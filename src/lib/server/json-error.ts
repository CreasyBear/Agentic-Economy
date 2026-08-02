export function jsonError(code: string, status: number, retryAfter?: number): Response {
  const headers: Record<string, string> = retryAfter === undefined
    ? {}
    : { 'Retry-After': String(Math.max(1, Math.ceil((retryAfter - Date.now()) / 1000))) }
  return Response.json({ error: code }, { status, headers })
}
