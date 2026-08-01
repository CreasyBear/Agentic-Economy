import { createElement, type ReactElement } from 'react'
import { toast as sonnerToast } from 'sonner'

export type AeToastOptions = { description?: string }

type ToastRole = 'alert' | 'status'

function titledToast(role: ToastRole, title: string, description: string | undefined): ReactElement {
  const accessibleTitle = description === undefined ? title : `${title}. ${description}`
  return createElement('span', { role, 'aria-label': accessibleTitle }, title)
}

export const toast = {
  success: (title: string, options?: AeToastOptions) => sonnerToast.success(titledToast('status', title, options?.description), options),
  error: (title: string, options?: AeToastOptions) => sonnerToast.error(titledToast('alert', title, options?.description), options),
  info: (title: string, options?: AeToastOptions) => sonnerToast.info(titledToast('status', title, options?.description), options),
  warning: (title: string, options?: AeToastOptions) => sonnerToast.warning(titledToast('status', title, options?.description), options),
}
