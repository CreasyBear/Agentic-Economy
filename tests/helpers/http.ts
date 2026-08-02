export function postJsonRequest(path: string, body: unknown): Request {
  return new Request(`https://ae.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
