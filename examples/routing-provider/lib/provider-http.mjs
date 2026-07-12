const MAX_PROVIDER_RESPONSE_BYTES = 1024 * 1024

export async function providerJson(fetchImpl, url, init, timeoutMs = 10_000) {
  let response
  try {
    response = await fetchImpl(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    return { kind: 'transport_unknown' }
  }
  const buffer = await readBoundedBody(response, MAX_PROVIDER_RESPONSE_BYTES)
  if (buffer === undefined) return { kind: 'invalid_response', status: response.status }
  const text = new TextDecoder().decode(buffer)
  let body
  try { body = text.length === 0 ? {} : JSON.parse(text) } catch { return { kind: 'invalid_response', status: response.status } }
  if (!response.ok) return { kind: 'provider_error', status: response.status, body }
  return { kind: 'ok', status: response.status, body }
}

async function readBoundedBody(response, maximumBytes) {
  if (response.body === null) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maximumBytes) {
        await reader.cancel('provider_response_too_large').catch(() => undefined)
        return undefined
      }
      chunks.push(value)
    }
  } catch {
    return undefined
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  return body
}

export function audMinor(value) {
  if (typeof value !== 'string') return undefined
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value)
  if (match === null) return undefined
  const amount = (BigInt(match[1] ?? '0') * 100n) + BigInt((match[2] ?? '').padEnd(2, '0') || '0')
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : undefined
}
