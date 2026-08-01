/** JSON response with `Cache-Control: no-store`. Shared by every Customer Request HTTP adapter. */
export function response(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
