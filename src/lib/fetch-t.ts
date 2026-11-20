/** fetch with a hard timeout so a hanging server can never freeze the UI. */
export async function fetchT(input: string, init?: RequestInit, timeoutMs = 9000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
