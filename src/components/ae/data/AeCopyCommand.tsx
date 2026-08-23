import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { copyTextToClipboard } from '@/lib/ui/copy-text-to-clipboard'
import { cn } from '@/lib/utils'

type AeCopyCommandProps = Readonly<{
  label: string
  code: string
  copyText?: string
  className?: string
  compact?: boolean
}>

/** Product-level command treatment. `$ORIGIN` resolves only when the user copies. */
export function AeCopyCommand({
  label,
  code,
  copyText = code,
  className,
  compact = false,
}: AeCopyCommandProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function handleCopy() {
    const resolved = copyText.replaceAll('$ORIGIN', window.location.origin)
    try {
      await copyTextToClipboard(resolved)
      setStatus('copied')
      window.setTimeout(() => setStatus('idle'), 1_600)
    } catch {
      setStatus('failed')
    }
  }

  return (
    <div className={cn('grid min-w-0 gap-1.5', className)}>
      <div className={cn('flex min-w-0 items-start gap-2 rounded-md border bg-muted/35', compact ? 'p-2' : 'p-3')}>
        <code className={cn('min-w-0 flex-1 whitespace-pre-wrap break-words font-mono leading-5 text-foreground', compact ? 'text-[11px]' : 'text-xs')}>
          {code}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={status === 'copied' ? `${label} copied` : `Copy ${label}`}
          onClick={handleCopy}
        >
          {status === 'copied' ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
        </Button>
      </div>
      <p role="status" aria-live="polite" className={cn('min-h-4 text-xs', status === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
        {status === 'copied' ? `${label} copied.` : status === 'failed' ? 'Copy failed. Select the command and copy it manually.' : ''}
      </p>
    </div>
  )
}
