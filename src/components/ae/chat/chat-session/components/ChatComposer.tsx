// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/multimodal-input.tsx (Apache-2.0). Attachments and model controls omitted.
import { SendIcon, SquareIcon } from 'lucide-react'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupTextarea } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { RecoveryNotice } from '../../recovery/RecoveryNotice'
import { chatAnonymousCountLine, chatComposer, chatRecovery } from '@/lib/public/chat-ia'

import { MAX_PROMPT_CHARACTERS } from '../anonymous-session'
import type { ChatComposerProps } from '../chat-session.contracts'

export function ChatComposer({
  prompt,
  busy,
  disabled,
  error,
  errorReference,
  browseMarketOnError,
  status,
  anonymousMessageCount,
  anonymousMessageLimitReached,
  recovery,
  onPromptChange,
  onSubmit,
  onRetry,
  onEditLast,
  onNewChat,
  onStop,
}: ChatComposerProps) {
  const promptLength = Array.from(prompt).length
  const invalid = error.length > 0
  return (
    <form
      className="w-full shrink-0 bg-background"
      action={onSubmit}
    >
      <FieldGroup className="w-full gap-2">
        <Field data-invalid={invalid || undefined}>
        <FieldLabel htmlFor="tool-chat-prompt" className="sr-only">
            {chatComposer.promptLabel}
          </FieldLabel>
          <InputGroup className="min-h-0 items-stretch rounded-2xl border border-border/50 bg-card/70 shadow-soft transition-[box-shadow] duration-300 focus-within:ring-2 focus-within:ring-ring/40">
            <InputGroupTextarea
              id="tool-chat-prompt"
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
              aria-describedby="tool-chat-limit tool-chat-error"
              aria-invalid={invalid}
              className="max-h-40 min-h-11 px-4 pt-3.5 pb-1.5 text-base leading-relaxed placeholder:text-muted-foreground"
              rows={1}
            />
            <InputGroupAddon align="block-end" className="!justify-end !px-3 !pb-3 !pt-0">
              {busy && onStop !== undefined ? (
                <Button
                  type="button"
                  className="size-9 min-h-9 min-w-9 rounded-xl bg-foreground !p-0 text-background focus-visible:ring-2 focus-visible:ring-ring/40"
                  aria-label={chatComposer.stopAria}
                  onClick={onStop}
                >
                  <SquareIcon data-icon="inline-start" aria-hidden="true" />
                  <span className="sr-only">{chatComposer.stop}</span>
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="size-9 min-h-9 min-w-9 rounded-xl bg-foreground !p-0 text-background transition-opacity duration-fast disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={disabled || prompt.trim().length === 0 || Array.from(prompt.trim()).length > MAX_PROMPT_CHARACTERS}
                  aria-label={busy ? chatComposer.sendingAria : chatComposer.sendAria}
                >
                  {busy
                    ? <Spinner data-icon="inline-start" aria-hidden="true" />
                    : <SendIcon data-icon="inline-start" aria-hidden="true" />}
                  <span className="sr-only">{busy ? chatComposer.sending : chatComposer.send}</span>
                </Button>
              )}
            </InputGroupAddon>
          </InputGroup>
          <div className={cn('flex items-start justify-between gap-related', !invalid && anonymousMessageCount === undefined && promptLength < 1_800 && 'max-sm:hidden')}>
            <div className="min-w-0 flex-1">
              {invalid ? (
                <div id="tool-chat-error" className="grid gap-intra">
                  {recovery === undefined
                    ? <FieldError>{error}</FieldError>
                    : <RecoveryNotice reason={recovery}
                      {...(onRetry === undefined ? {} : { onRetry })}
                      {...(onEditLast === undefined ? {} : { onEdit: onEditLast })}
                      {...(onNewChat === undefined ? {} : { onNewChat })} />}
                  {errorReference === undefined ? null : (
                    <p className="flex flex-wrap items-center gap-intra text-muted-foreground">
                      <span>{chatRecovery.reference}</span>
                      <AeCopyReference label="chat support reference" value={errorReference} />
                    </p>
                  )}
                  {browseMarketOnError && recovery === undefined ? (
                    <a
                      href="/market"
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'min-h-touch w-fit')}
                    >
                      {chatRecovery.browse}
                    </a>
                  ) : null}
                </div>
              ) : <div id="tool-chat-error" role="alert" />}
              {anonymousMessageLimitReached && !invalid ? (
                <RecoveryNotice reason="anonymous_message_limit"
                  {...(onNewChat === undefined ? {} : { onNewChat })} />
              ) : anonymousMessageCount === undefined || invalid ? null : (
                <FieldDescription>
                  {chatAnonymousCountLine(anonymousMessageCount, false)}
                </FieldDescription>
              )}
            </div>
            <FieldDescription id="tool-chat-limit" className="shrink-0 tabular-nums">
              {promptLength >= 1_800 ? `${promptLength} / 2,000` : ''}
            </FieldDescription>
          </div>
        </Field>
      </FieldGroup>
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
    </form>
  )
}
