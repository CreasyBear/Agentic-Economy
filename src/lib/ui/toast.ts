export type AeToastType = 'success' | 'error' | 'info' | 'warning'
export type AeToastOptions = { description?: string }
export type AeToastEvent = { type: AeToastType; title: string; description?: string }

const eventName = 'ae:toast'

function emit(type: AeToastType, title: string, options: AeToastOptions = {}) {
  if (typeof window === 'undefined') return
  const detail: AeToastEvent = options.description === undefined ? { type, title } : { type, title, description: options.description }
  window.dispatchEvent(new CustomEvent<AeToastEvent>(eventName, { detail }))
}

export const toast = {
  success: (title: string, options?: AeToastOptions) => emit('success', title, options),
  error: (title: string, options?: AeToastOptions) => emit('error', title, options),
  info: (title: string, options?: AeToastOptions) => emit('info', title, options),
  warning: (title: string, options?: AeToastOptions) => emit('warning', title, options),
}

export function subscribeToAeToasts(listener: (event: AeToastEvent) => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const handler = (event: Event) => listener((event as CustomEvent<AeToastEvent>).detail)
  window.addEventListener(eventName, handler)
  return () => window.removeEventListener(eventName, handler)
}
