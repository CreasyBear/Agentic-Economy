/* Arc code-block frame/header/selectable source, using the existing clipboard
 * controller. Displayed code may be redacted; clipboard content is resolved
 * only on activation. Never retain an outgoing secret for a code animation. */
import { CheckIcon, CopyIcon, FileCode2Icon } from 'lucide-react'
import { useCallback } from 'react'

import { Button } from '@/components/arc/button/button'
import { useClipboardCopy } from '@/hooks/use-clipboard-copy'
import { cn } from '@/lib/utils'
import './CopyCommandComposition.css'

type AeCopyCommandProps = Readonly<{
  label: string
  code: string
  copyText?: string | (() => string)
  resolveOrigin?: boolean
  className?: string
  compact?: boolean
  comfortable?: boolean
  /** When true (default), show a `$` prompt prefix in comfortable layout. */
  prompt?: boolean
  /** Custom copied status text; also extends revert timeout to 2000ms. */
  copiedHint?: string
  actionLabel?: string
}>

/** Product-level command treatment. `$ORIGIN` resolves only when the user copies. */
export function AeCopyCommand({
  label,
  code,
  copyText = code,
  resolveOrigin = true,
  className,
  compact = false,
  comfortable = false,
  prompt = true,
  copiedHint,
  actionLabel,
}: AeCopyCommandProps) {
  const resolveCopyText = useCallback(
    () => resolveCommandCopyText(copyText, resolveOrigin),
    [copyText, resolveOrigin],
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
    <div className={cn('arc-market arc-copy-command', className)}>
      <section className="arc-copy-command-block" aria-label={label} data-compact={compact || undefined} data-comfortable={comfortable || undefined}>
        <header className="arc-copy-command-header">
          <span className="arc-copy-command-file"><FileCode2Icon size={16} aria-hidden="true" />{label}</span>
        <Button
          type="button"
          variant={actionLabel === undefined ? 'ghost' : 'primary'}
          size="md"
          className="arc-copy-command-action"
          data-with-label={actionLabel !== undefined || undefined}
          aria-label={copied ? `${label} copied` : actionLabel ?? `Copy ${label}`}
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
          {actionLabel === undefined ? null : <span>{copied ? 'Copied' : actionLabel}</span>}
        </Button>
        </header>
        <div className="arc-copy-command-viewport" data-prompt={comfortable && prompt || undefined}>
          {comfortable && prompt ? <span className="arc-copy-command-prompt" aria-hidden="true">$</span> : null}
          <pre className="arc-copy-command-source" tabIndex={0} aria-label={`Selectable ${label}`}><code>{code}</code></pre>
        </div>
      </section>
      <p role="status" aria-live="polite" className={cn('min-h-4 text-xs', status === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
        {copiedMessage}
      </p>
    </div>
  )
}

function resolveCommandCopyText(copyText: string | (() => string), resolveOrigin: boolean): string {
  const value = typeof copyText === 'function' ? copyText() : copyText
  return resolveOrigin ? value.replaceAll('$ORIGIN', window.location.origin) : value
}
