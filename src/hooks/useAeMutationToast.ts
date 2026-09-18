import { useCallback } from 'react'
import { toast } from '@/lib/ui/toast'

export type MutationToastConfig<T> = Readonly<{
  loading?: string
  success: string | ((result: T) => string)
  error?: string | ((err: unknown) => string)
  description?: string
}>

export function useAeMutationToast() {
  const executeWithToast = useCallback(
    async <T>(
      promise: Promise<T> | (() => Promise<T>),
      config: MutationToastConfig<T>
    ): Promise<T> => {
      try {
        const actionPromise = typeof promise === 'function' ? promise() : promise
        const result = await actionPromise
        const successMessage =
          typeof config.success === 'function' ? config.success(result) : config.success
        toast.success(successMessage, config.description ? { description: config.description } : undefined)
        return result
      } catch (err: unknown) {
        const errorMessage =
          typeof config.error === 'function'
            ? config.error(err)
            : config.error ?? (err instanceof Error ? err.message : 'An unexpected error occurred')
        toast.error(errorMessage)
        throw err
      }
    },
    []
  )

  const copyWithToast = useCallback(async (text: string, label = 'Copied to clipboard'): Promise<boolean> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        toast.success(label)
        return true
      }
      toast.error('Clipboard access not available')
      return false
    } catch (cause) {
      void cause
      toast.error('Failed to copy to clipboard')
      return false
    }
  }, [])

  return {
    executeWithToast,
    copyWithToast,
  }
}
