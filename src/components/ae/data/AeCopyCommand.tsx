import { CheckIcon, CopyIcon } from 'lucide-react'
import { useCallback } from 'react'

import { Button } from '@/components/ui/button'
import { useClipboardCopy } from '@/hooks/use-clipboard-copy'
import { cn } from '@/lib/utils'

type AeCopyCommandProps = Readonly<{
  label: string
  code: string
  copyText?: string
  className?: string
  compact?: boolean
  comfortable?: boolean
  /** When true (default), show a `$` prompt prefix in comfortable layout. */
  prompt?: boolean
  /** Custom copied status text; also extends revert timeout to 2000ms. */
  copiedHint?: string
}>

/** Product-level command treatment. `$ORIGIN` resolves only when the user copies. */
export function AeCopyCommand({
  label,
  code,
  copyText = code,
  className,
  compact = false,
  comfortable = false,
  prompt = true,
  copiedHint,
}: AeCopyCommandProps) {
  const resolveCopyText = useCallback(
    () => copyText.replaceAll('$ORIGIN', window.location.origin),
    [copyText],
  )
  const copyTimeout = copiedHint !== undefined ? 2_000 : 1_600
  const { status, isCopied: copied, copy } = useClipboardCopy(resolveCopyText, {
    timeout: copyTimeout,
  })

  const copiedMessage = copied
    ? (copiedHint ?? `${label} copied.`)
    : status === 'failed'
      ? 'Copy failed. Select the command and copy it manually.'
      : ''

  return (
    <div className={cn('grid min-w-0 gap-1.5', className)}>
      <div className={cn('flex min-w-0 items-start gap-2 rounded-md border border-border bg-muted/40 dark:bg-muted/25', compact ? 'p-2' : comfortable ? 'p-related' : 'p-3')}>
        {comfortable && prompt ? (
          <span className="mt-0.5 font-mono text-sm text-muted-foreground" aria-hidden="true">
            $
          </span>
        ) : null}
        <code className={cn('min-w-0 flex-1 whitespace-pre-wrap break-words font-mono leading-5 text-foreground', compact ? 'text-[11px]' : comfortable ? 'text-sm leading-6' : 'text-xs')}>
          {code}
        </code>
        <Button
          type="button"
          variant="ghost"
          size={comfortable ? 'icon' : 'icon-sm'}
          className={cn(
            'relative shrink-0 enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100',
            comfortable && 'min-h-touch min-w-touch',
          )}
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          onClick={() => { void copy() }}
        >
          <span className="relative size-4">
            <CopyIcon
              aria-hidden="true"
              className={cn(
                'absolute inset-0 size-4 transition-[opacity,transform,filter] duration-base ease-standard motion-reduce:transition-none',
                copied ? 'scale-[0.25] opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-0',
              )}
            />
            <CheckIcon
              aria-hidden="true"
              className={cn(
                'absolute inset-0 size-4 transition-[opacity,transform,filter] duration-base ease-standard motion-reduce:transition-none',
                copied ? 'scale-100 opacity-100 blur-0 text-success' : 'scale-[0.25] opacity-0 blur-[4px]',
              )}
            />
          </span>
        </Button>
      </div>
      <p role="status" aria-live="polite" className={cn('min-h-4 text-xs', status === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
        {copiedMessage}
      </p>
    </div>
  )
}
