import { createElement, type ReactElement } from 'react'
import { toast as sonnerToast } from 'sonner'
import { createClientOnlyFn } from '@tanstack/react-start'

export type AeToastOptions = { description?: string }

type ToastRole = 'alert' | 'status'

function titledToast(role: ToastRole, title: string, description: string | undefined): ReactElement {
  const accessibleTitle = description === undefined ? title : `${title}. ${description}`
  return createElement('span', { role, 'aria-label': accessibleTitle }, title)
}

type ToastKind = 'success' | 'error' | 'info' | 'warning'

const dispatchToastOnClient = createClientOnlyFn(
  (kind: ToastKind, title: string, options?: AeToastOptions) => {
    const role: ToastRole = kind === 'error' ? 'alert' : 'status'
    return sonnerToast[kind](titledToast(role, title, options?.description), options)
  },
)

export const toast = {
  success: (title: string, options?: AeToastOptions) => dispatchToastOnClient('success', title, options),
  error: (title: string, options?: AeToastOptions) => dispatchToastOnClient('error', title, options),
  info: (title: string, options?: AeToastOptions) => dispatchToastOnClient('info', title, options),
  warning: (title: string, options?: AeToastOptions) => dispatchToastOnClient('warning', title, options),
}
