import { CheckIcon, CopyIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useClipboardCopy } from '@/hooks/use-clipboard-copy'
import { toast } from '@/lib/ui/toast'
import { cn } from '@/lib/utils'

export function AeCopyReference({
  label,
  value,
  className,
  copyFeedbackMs = 1_600,
}: Readonly<{ label: string; value: string; className?: string; copyFeedbackMs?: number }>) {
  const { status, isCopied: copied, copy } = useClipboardCopy(value, {
    timeout: copyFeedbackMs,
  })

  const feedback = copied ? 'Copied' : status === 'failed' ? 'Copy failed' : ''
  return (
    <span className={cn('inline-flex min-w-0 flex-wrap items-center gap-intra', className)}>
      <code dir="ltr" className="min-w-0 break-all font-mono text-xs text-foreground">{value}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        onClick={() => {
          void copy().then(() => {
            toast.success(`Copied ${label} to clipboard`)
          }).catch(() => {
            toast.error(`Failed to copy ${label}`)
          })
        }}
      >
        {copied
          ? <CheckIcon aria-hidden="true" className="size-4" />
          : <CopyIcon aria-hidden="true" className="size-4" />}
      </Button>
      <span
        role="status"
        aria-live="polite"
        className={cn('min-w-14 text-xs', status === 'failed' ? 'text-destructive' : 'text-muted-foreground')}
      >
        {feedback}
      </span>
    </span>
  )
}
