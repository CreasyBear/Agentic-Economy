import { useCallback, useEffect, useRef, useState } from 'react'
import { copyTextToClipboard } from '@/lib/ui/copy-text-to-clipboard'

export function useClipboardCopy(
  text: string,
  options: Readonly<{
    timeout?: number
    ignoreWhileCopied?: boolean
    onCopy?: () => void
    onError?: (error: Error) => void
  }> = {},
): Readonly<{ isCopied: boolean; copy: () => Promise<void> }> {
  const { timeout = 2_000, ignoreWhileCopied = false, onCopy, onError } = options
  const [isCopied, setIsCopied] = useState(false)
  const timeoutRef = useRef<number | undefined>(undefined)

  const copy = useCallback(async () => {
    if (ignoreWhileCopied && isCopied) return

    try {
      await copyTextToClipboard(text)
      setIsCopied(true)
      onCopy?.()
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => setIsCopied(false), timeout)
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)))
    }
  }, [ignoreWhileCopied, isCopied, onCopy, onError, text, timeout])

  useEffect(() => () => window.clearTimeout(timeoutRef.current), [])

  return { isCopied, copy }
}
