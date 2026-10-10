/**
 * Rebinds a runtime request to a narrower deadline. Built from parts because
 * Nitro/srvx hands server functions a NodeRequest that inherits
 * Request.prototype without undici's internal state, so `new Request(request)`
 * throws there. Bodies are not carried: callers are read-only GET handlers.
 */
export function withSignal(request: Request, signal: AbortSignal): Request {
  if (request.method !== 'GET') throw new Error(`withSignal only rebinds GET requests, got ${request.method}`)
  return new Request(request.url, { method: request.method, headers: request.headers, signal })
}
