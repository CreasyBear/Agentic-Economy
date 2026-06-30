import type { CSSProperties } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon data-icon="inline-start" />,
        info: <InfoIcon data-icon="inline-start" />,
        warning: <TriangleAlertIcon data-icon="inline-start" />,
        error: <OctagonXIcon data-icon="inline-start" />,
        loading: <Loader2Icon className="animate-spin" data-icon="inline-start" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--ae-radius-sm)',
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'ae-toast cn-toast',
          title: 'font-medium',
          description: 'text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
