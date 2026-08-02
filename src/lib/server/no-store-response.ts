/** JSON response with `Cache-Control: no-store`. */
export function response(
  body: unknown,
  status: number,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}
