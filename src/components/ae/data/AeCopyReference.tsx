import { CheckIcon, CopyIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useClipboardCopy } from '@/hooks/use-clipboard-copy'
import { cn } from '@/lib/utils'

export function AeCopyReference({
  label,
  value,
  className,
}: Readonly<{ label: string; value: string; className?: string }>) {
  const { status, isCopied: copied, copy } = useClipboardCopy(value, {
    timeout: 1_600,
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
        onClick={() => { void copy() }}
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
