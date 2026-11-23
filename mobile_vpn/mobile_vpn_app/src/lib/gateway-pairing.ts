export type BridgePairingSession = { sessionId: string; expiresAt: number };
export type PairingEvent = "authorized" | "submitted" | "online";
export class PairingConfirmationPending extends Error {
  constructor() {
    super("O gateway recebeu o pareamento. Aguardando confirmação online; acompanhe pela lista de gateways.");
    this.name = "PairingConfirmationPending";
  }
}
type Options = {
  apiUrl: string;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
  session: BridgePairingSession;
  gatewayId: number;
  gatewayMac: string;
  enrollmentCode: string;
  signal: AbortSignal;
  onEvent: (event: PairingEvent) => void;
  onPending?: () => void;
  timeoutMs?: number;
  wait?: (signal: AbortSignal) => Promise<void>;
};

export function isBridgePairingSession(value: unknown): value is BridgePairingSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return typeof session.sessionId === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(session.sessionId) &&
    typeof session.expiresAt === "number" && Number.isFinite(session.expiresAt) &&
    session.expiresAt > Date.now();
}

function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(new Error("Pareamento interrompido.")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 4000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** Enrollment secrets go only to the authenticated HTTPS backend, never the LAN bridge. */
export async function pairGateway(options: Options) {
  const { apiFetch, session, signal, onEvent } = options;
  const api = new URL(options.apiUrl);
  if (api.protocol !== "https:" || api.username || api.password || api.search || api.hash) {
    throw new Error("O pareamento exige uma conexão HTTPS com o servidor.");
  }
  if (!isBridgePairingSession(session)) throw new Error("A sessão da ponte expirou. Busque os PCs novamente.");
  if (!Number.isSafeInteger(options.gatewayId) || options.gatewayId < 1 ||
      !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(options.gatewayMac) ||
      !/^[A-Za-z0-9_-]{43}$/.test(options.enrollmentCode)) throw new Error("Dados de pareamento inválidos.");
  const base = options.apiUrl.replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;
  let submitted = false;
  let pending = false;
  function timeoutError() {
    return submitted
      ? new PairingConfirmationPending()
      : new Error("O PC não concluiu a entrega a tempo. Verifique a ponte e tente novamente.");
  }
  async function request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    if (signal.aborted) throw new Error("Pareamento interrompido.");
    const requestDeadline = pending ? Date.now() + timeoutMs : deadline;
    if (Date.now() >= requestDeadline) throw timeoutError();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: () => void = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      abort = () => {
        reject(new Error("Pareamento interrompido."));
        controller.abort();
      };
      signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => {
        reject(timeoutError());
        controller.abort();
      }, Math.max(0, requestDeadline - Date.now()));
    });
    let response: Response;
    let body: unknown;
    try {
      [response, body] = await Promise.race([
        (async (): Promise<[Response, unknown]> => {
          const result = await apiFetch(`${base}${path}`, { ...init, signal: controller.signal, redirect: "error" });
          return [result, await result.json().catch(() => null)];
        })(),
        interrupted,
      ]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
    if (signal.aborted) throw new Error("Pareamento interrompido.");
    if (!response.ok) {
      throw new Error(response.status === 403
        ? "A ponte selecionada não está autorizada para sua conta."
        : response.status === 404
          ? "A sessão expirou ou não está disponível. Busque os PCs novamente."
          : "Não foi possível consultar o pareamento. Verifique a conexão e tente novamente.");
    }
    if (!body || typeof body !== "object") throw new Error("Resposta de pareamento inválida.");
    return body as Record<string, unknown>;
  }
  const path = `/gateway-bridge-sessions/${session.sessionId}`;
  const approved = await request(`${path}/approve`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gatewayId: options.gatewayId, gatewayMac: options.gatewayMac, enrollmentCode: options.enrollmentCode }),
  });
  if (approved.status !== "approved") throw new Error("O servidor não confirmou a autorização.");
  onEvent("authorized");
  while (true) {
    try {
      if (!submitted) {
        const relay = await request(path);
        if (relay.status === "failed" || relay.status === "locked") {
          throw new Error("A ponte não conseguiu acessar o gateway. Verifique o cabo e tente novamente.");
        }
        if (relay.status !== "approved" && relay.status !== "submitted") throw new Error("Estado de pareamento inválido.");
        if (relay.status === "submitted") { submitted = true; onEvent("submitted"); }
      }
      if (submitted) {
        const body = await request(`/gateways/${options.gatewayId}`);
        const gateway = body.gateway as { status?: unknown } | undefined;
        if (gateway?.status === "online") { onEvent("online"); return; }
      }
    } catch (error) {
      if (!(error instanceof PairingConfirmationPending) || !options.onPending) throw error;
      if (!pending) { pending = true; options.onPending(); }
    }
    await (options.wait ?? waitForPoll)(signal);
  }
}
