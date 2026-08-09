import type { Response as UndiciResponse } from 'undici'

export type BoundedRequestBody =
  | Pick<Request | Response, 'body' | 'headers'>
  | Pick<UndiciResponse, 'body' | 'headers'>

export type BoundedRequestTextResult =
  | { ok: true; text: string }
  | { ok: false; code: 'payload_too_large' }

export type BoundedRequestJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; code: 'payload_too_large' | 'invalid_json' }

const decoder = new TextDecoder()

export async function readBoundedRequestText(
  request: BoundedRequestBody,
  maxBytes: number,
): Promise<BoundedRequestTextResult> {
  const declaredContentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredContentLength) && declaredContentLength > maxBytes) {
    return { ok: false, code: 'payload_too_large' }
  }

  if (request.body === null) {
    return { ok: true, text: '' }
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (value === undefined) {
        throw new TypeError('Response body reader returned no value before completion.')
      }

      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, code: 'payload_too_large' }
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  if (chunks.length === 0) {
    return { ok: true, text: '' }
  }

  if (chunks.length === 1) {
    return { ok: true, text: decoder.decode(chunks[0]) }
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  return { ok: true, text: decoder.decode(body) }
}

export async function readBoundedRequestJson(
  request: BoundedRequestBody,
  maxBytes: number,
): Promise<BoundedRequestJsonResult> {
  const bounded = await readBoundedRequestText(request, maxBytes)
  if (!bounded.ok) return bounded
  try {
    return { ok: true, value: JSON.parse(bounded.text) as unknown }
  } catch {
    return { ok: false, code: 'invalid_json' }
  }
}
