export function getApiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;

  const payload = body as {
    errors?: { message?: unknown }[];
    message?: unknown;
  };
  const validationMessage = payload.errors?.[0]?.message;
  if (typeof validationMessage === "string") return validationMessage;
  return typeof payload.message === "string" ? payload.message : fallback;
}
