import { fetchWithTimeout } from "./fetch-with-timeout";
import { isBridgePairingSession, type BridgePairingSession } from "./gateway-pairing";

export type LocalGateway = {
  ip: string;
  model: string;
  mac: string;
  serial: string;
  bridgeHost?: string;
  bridgePort?: number;
};

export type LocalBridge = {
  host: string;
  model: string;
  username: string;
  gateways: LocalGateway[];
  pairing?: BridgePairingSession;
};

type BridgeResponse = {
  service?: unknown;
  pc?: unknown;
  gateways?: unknown;
  pairing?: unknown;
};

const BRIDGE_SERVICE = "saganexus-lan-bridge-v1";
const MAX_CONCURRENT_PROBES = 24;

function isIPv4(value: unknown): value is string {
  return typeof value === "string" &&
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) &&
    value.split(".").every((octet) => Number(octet) <= 255);
}

export function isPrivateIPv4(value: unknown): value is string {
  if (!isIPv4(value)) return false;
  const [first, second] = value.split(".").map(Number);
  return first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
}

export function buildLocalBridgeCandidates(ip: string): string[] {
  if (!isPrivateIPv4(ip)) return [];
  const octets = ip.split(".");
  const prefix = `${octets[0]}.${octets[1]}.${octets[2]}.`;
  return Array.from({ length: 254 }, (_, index) => `${prefix}${index + 1}`);
}

function isGatewayIdentity(value: unknown): value is Omit<LocalGateway, "bridgeHost" | "bridgePort"> & { port?: number } {
  if (!value || typeof value !== "object") return false;
  const gateway = value as Record<string, unknown>;
  return isIPv4(gateway.ip) &&
    typeof gateway.model === "string" && gateway.model.length > 0 &&
    typeof gateway.mac === "string" && /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(gateway.mac) &&
    (gateway.serial === undefined || typeof gateway.serial === "string") &&
    Number.isInteger(gateway.port) && Number(gateway.port) >= 8800 && Number(gateway.port) < 8864;
}

function isPcIdentity(value: unknown): value is { model: string; username: string } {
  if (!value || typeof value !== "object") return false;
  const pc = value as Record<string, unknown>;
  return typeof pc.model === "string" && pc.model.length > 0 &&
    typeof pc.username === "string" && pc.username.length > 0;
}

async function probeHosts<T>(
  ips: string[],
  probe: (ip: string) => Promise<T | null>,
  onFound?: (result: Awaited<T>) => void,
): Promise<Awaited<T>[]> {
  const found: Awaited<T>[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_PROBES, ips.length) }, async () => {
    while (next < ips.length) {
      const result = await probe(ips[next++]);
      if (result !== null) {
        found.push(result);
        onFound?.(result);
      }
    }
  }));
  return found;
}

async function discoverViaBridge(host: string, timeoutMs: number): Promise<LocalGateway[]> {
  try {
    const response = await fetchWithTimeout(
      `http://${host}:8787/saganexus-discovery`,
      { headers: { Accept: "application/json" } },
      timeoutMs,
    );
    if (!response.ok) return [];
    const body = (await response.json()) as BridgeResponse;
    if (body.service !== BRIDGE_SERVICE || !Array.isArray(body.gateways)) return [];
    return body.gateways.filter(isGatewayIdentity).map((gateway) => ({
      ip: gateway.ip,
      model: gateway.model,
      mac: gateway.mac,
      serial: gateway.serial ?? "",
      bridgeHost: host,
      bridgePort: gateway.port!,
    }));
  } catch {
    return [];
  }
}

async function discoverBridge(host: string, timeoutMs: number): Promise<LocalBridge | null> {
  try {
    const response = await fetchWithTimeout(`http://${host}:8787/saganexus-discovery`, {
      headers: { Accept: "application/json" },
    }, timeoutMs);
    if (!response.ok) return null;
    const body = (await response.json()) as BridgeResponse;
    if (body.service !== BRIDGE_SERVICE || !isPcIdentity(body.pc) || !Array.isArray(body.gateways)) return null;
    const gateways = body.gateways.filter(isGatewayIdentity).map((gateway) => ({
      ip: gateway.ip,
      model: gateway.model,
      mac: gateway.mac,
      serial: gateway.serial ?? "",
      bridgeHost: host,
      bridgePort: gateway.port!,
    }));
    return gateways.length ? {
      host, model: body.pc.model, username: body.pc.username, gateways,
      ...(isBridgePairingSession(body.pairing) ? { pairing: body.pairing } : {}),
    } : null;
  } catch {
    return null;
  }
}

export async function discoverLocalBridges(
  ips: string[],
  timeoutMs = 1200,
  onFound?: (bridge: LocalBridge) => void,
): Promise<LocalBridge[]> {
  const hosts = [...new Set(ips)].filter(isIPv4);
  return probeHosts(hosts, (host) => discoverBridge(host, timeoutMs), onFound);
}

/** Find gateways only through the external PC bridge on HTTP :8787. */
export async function discoverLocalGateways(
  ips: string[],
  timeoutMs = 1200,
): Promise<LocalGateway[]> {
  const hosts = [...new Set(ips)].filter(isIPv4);
  return (await probeHosts(hosts, (host) => discoverViaBridge(host, timeoutMs))).flat();
}
