export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return message === 'aborted' || message.includes('abort') || message.includes('cancel')
  }

  return false
}

export function createAbortAwareSseStream(input: {
  request: Request
  run: (sendLine: (line: string) => void) => Promise<void>
}): ReadableStream<Uint8Array> {
  let closed = false

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()

      const safeClose = () => {
        if (closed) {
          return
        }
        closed = true
        try {
          controller.close()
        } catch {
          // Stream already cancelled by the client.
        }
      }

      const sendLine = (line: string) => {
        if (closed || input.request.signal.aborted) {
          return
        }
        try {
          controller.enqueue(encoder.encode(line))
        } catch {
          closed = true
        }
      }

      const onAbort = () => {
        closed = true
      }
      input.request.signal.addEventListener('abort', onAbort)

      try {
        if (!input.request.signal.aborted) {
          await input.run(sendLine)
        }
      } catch (error) {
        if (!isAbortError(error) && !input.request.signal.aborted) {
          throw error
        }
      } finally {
        input.request.signal.removeEventListener('abort', onAbort)
        safeClose()
      }
    },
    cancel() {
      closed = true
    },
  })
}

export function sseDataLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}
