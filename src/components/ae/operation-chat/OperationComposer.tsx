import { SendIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupTextarea } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { chatAnonymousCountLine, chatComposer } from '@/lib/public/chat-ia'
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
  const invalid = error.length > 0
  return (
    <form
      className="bg-background px-gutter pb-[max(var(--spacing-related),env(safe-area-inset-bottom))] pt-intra"
      action={onSubmit}
    >
      <FieldGroup className="mx-auto w-full max-w-3xl gap-intra">
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor="operation-chat-prompt" className="sr-only">
            {chatComposer.promptLabel}
          </FieldLabel>
          <InputGroup className="items-end bg-container">
            <InputGroupTextarea
              id="operation-chat-prompt"
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder={chatComposer.placeholder}
              disabled={disabled}
              aria-describedby="operation-chat-limit operation-chat-error"
              aria-invalid={invalid}
              className="max-h-40 min-h-touch"
              rows={1}
            />
            <InputGroupAddon align="inline-end">
              <Button
                type="submit"
                className="min-h-touch min-w-touch"
                disabled={disabled}
                aria-label={busy ? chatComposer.sendingAria : chatComposer.sendAria}
              >
                {busy
                  ? <Spinner data-icon="inline-start" aria-hidden="true" />
                  : <SendIcon data-icon="inline-start" aria-hidden="true" />}
                <span className="hidden sm:inline">{busy ? chatComposer.sending : chatComposer.send}</span>
              </Button>
            </InputGroupAddon>
          </InputGroup>
          <div className="flex items-start justify-between gap-related">
            <div className="min-w-0 flex-1">
              {invalid
                ? <FieldError id="operation-chat-error">{error}</FieldError>
                : <div id="operation-chat-error" role="alert" />}
              {anonymousMessageCount === undefined || invalid ? null : (
                <FieldDescription>
                  {chatAnonymousCountLine(anonymousMessageCount, anonymousMessageLimitReached)}
                </FieldDescription>
              )}
            </div>
            <FieldDescription id="operation-chat-limit" className="shrink-0 tabular-nums">
              {promptLength >= 1_800 ? `${promptLength} / 2,000` : ''}
            </FieldDescription>
          </div>
        </Field>
      </FieldGroup>
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
    </form>
  )
}
