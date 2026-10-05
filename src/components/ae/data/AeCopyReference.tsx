import { CheckIcon, CopyIcon } from 'lucide-react'

import { Button } from '@/components/arc/button/button'
import { useClipboardCopy } from '@/hooks/use-clipboard-copy'
import { toast } from '@/lib/ui/toast'
import { cn } from '@/lib/utils'

export function AeCopyReference({
  label,
  value,
  className,
  copyFeedbackMs = 1_600,
  compact = false,
  href,
}: Readonly<{ label: string; value: string; className?: string; copyFeedbackMs?: number; compact?: boolean; href?: string }>) {
  const { status, isCopied: copied, copy } = useClipboardCopy(value, {
    timeout: copyFeedbackMs,
    // Clipboard refusal is recoverable. The helper resolves after handling it;
    // only its outcome callbacks can truthfully announce success or failure.
    onCopy: () => toast.success(`Copied ${label} to clipboard`),
    onError: () => toast.error(`Failed to copy ${label}`),
  })

  const feedback = copied ? 'Copied' : status === 'failed' ? 'Copy failed' : ''
  const shown = compact && value.length > 36 ? `${value.slice(0, 21)}…${value.slice(-8)}` : value
  const reference = <code dir="ltr" className={cn('min-w-0 font-mono text-sm', compact ? 'block truncate text-muted-foreground' : 'break-all text-foreground')}>{shown}</code>
  return (
    <span className={cn('arc-market inline-flex min-w-0 flex-wrap items-center gap-intra', className)}>
      {href === undefined
        ? <span className="min-w-0" title={compact ? value : undefined}>{reference}</span>
        : <a href={href} aria-label={value} title={value} className="min-w-0 underline-offset-4 hover:underline">{reference}</a>}
      <Button
        type="button"
        variant="ghost"
        size="md"
        className="h-11 w-11 shrink-0 px-0"
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        onClick={() => {
          void copy()
        }}
      >
        {copied
          ? <CheckIcon aria-hidden="true" className="size-4" />
          : <CopyIcon aria-hidden="true" className="size-4" />}
      </Button>
      <span
        role="status"
        aria-live="polite"
        className={cn(compact ? 'sr-only' : 'min-w-14 text-sm', status === 'failed' ? 'text-destructive' : 'text-muted-foreground')}
      >
        {feedback}
      </span>
    </span>
  )
}
