import { SendIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import type { ChatStatus } from './presentation'

export function OperationComposer({
  prompt,
  busy,
  disabled,
  error,
  status,
  anonymousMessageCount,
  anonymousMessageLimitReached,
  onPromptChange,
  onSubmit,
}: Readonly<{
  prompt: string
  busy: boolean
  disabled: boolean
  error: string
  status: ChatStatus
  anonymousMessageCount?: number
  anonymousMessageLimitReached: boolean
  onPromptChange(value: string): void
  onSubmit(): void
}>) {
  const promptLength = Array.from(prompt).length
  return (
    <form className="border-t border-border bg-background p-3 sm:p-4" action={onSubmit}>
      <label htmlFor="operation-chat-prompt" className="mb-1.5 block text-sm font-medium">Message</label>
      <div className="flex items-end gap-2">
        <Textarea
          id="operation-chat-prompt"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          placeholder="Find an operation…"
          disabled={disabled}
          aria-describedby="operation-chat-limit operation-chat-error"
          aria-invalid={error.length > 0}
          className="max-h-40 min-h-11 resize-none"
          rows={1}
        />
        <Button type="submit" className="min-h-11 min-w-11" disabled={disabled} aria-label={busy ? 'Sending message' : 'Send message'}>
          {busy ? <Spinner aria-hidden="true" /> : <SendIcon aria-hidden="true" />}
          <span className="hidden sm:inline">{busy ? 'Sending…' : 'Send'}</span>
        </Button>
      </div>
      <div className="mt-1.5 flex min-h-5 items-start justify-between gap-3">
        <div>
          <p id="operation-chat-error" role="alert" className="text-sm text-destructive">{error}</p>
          {anonymousMessageCount === undefined || error.length > 0 ? null : (
            <p className="text-xs text-muted-foreground">
              {anonymousMessageCount} / 12 browser messages
              {anonymousMessageLimitReached ? ' — limit reached; start a new chat to continue.' : ''}
            </p>
          )}
        </div>
        <p id="operation-chat-limit" className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {promptLength >= 1_800 ? `${promptLength} / 2,000` : ''}
        </p>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
    </form>
  )
}
