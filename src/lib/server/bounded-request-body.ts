export type BoundedRequestTextResult =
  | { ok: true; text: string }
  | { ok: false; code: 'payload_too_large' }

const decoder = new TextDecoder()

export async function readBoundedRequestText(
  request: Pick<Request, 'body' | 'headers'>,
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
