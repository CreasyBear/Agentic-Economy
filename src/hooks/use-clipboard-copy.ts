import { useCallback, useEffect, useRef, useState } from 'react'
import { copyTextToClipboard } from '@/lib/ui/copy-text-to-clipboard'

export function useClipboardCopy(
  text: string | (() => string),
  options: Readonly<{
    timeout?: number
    ignoreWhileCopied?: boolean
    onCopy?: () => void
    onError?: (error: Error) => void
  }> = {},
): Readonly<{
  status: 'idle' | 'copied' | 'failed'
  isCopied: boolean
  copy: () => Promise<void>
}> {
  const { timeout = 2_000, ignoreWhileCopied = false, onCopy, onError } = options
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const isCopied = status === 'copied'
  const timeoutRef = useRef<number | undefined>(undefined)

  const copy = useCallback(async () => {
    if (ignoreWhileCopied && isCopied) return

    try {
      await copyTextToClipboard(typeof text === 'function' ? text() : text)
      setStatus('copied')
      onCopy?.()
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => setStatus('idle'), timeout)
    } catch (error) {
      setStatus('failed')
      onError?.(error instanceof Error ? error : new Error(String(error)))
    }
  }, [ignoreWhileCopied, isCopied, onCopy, onError, text, timeout])

  useEffect(() => () => window.clearTimeout(timeoutRef.current), [])

  return { status, isCopied, copy }
}
