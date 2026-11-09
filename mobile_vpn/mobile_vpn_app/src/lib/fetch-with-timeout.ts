/** Bound the entire API response, including a server that stalls while sending JSON. */
export async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options?.signal?.aborted) controller.abort();
  options?.signal?.addEventListener("abort", abort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        // Buffer a clone so the timeout also covers reading the response body.
        // Return the original Response to preserve the callers' existing contract.
        await response.clone().arrayBuffer();
        return response;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new Error(
              "O servidor demorou para responder. Verifique sua conexão e tente novamente.",
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    options?.signal?.removeEventListener("abort", abort);
  }
}

/** Revoke the captured token independently of cleared React state. */
export async function revokeAccessToken(apiUrl: string, token: string) {
  const response = await fetchWithTimeout(`${apiUrl}/account/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  // An expired or already revoked token is also a completed logout.
  if (!response.ok && response.status !== 401) {
    throw new Error("Não foi possível revogar a sessão no servidor.");
  }
}
