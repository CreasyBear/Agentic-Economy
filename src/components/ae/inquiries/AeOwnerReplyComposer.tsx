import { type KeyboardEvent, type RefObject } from 'react'

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'

export type AeOwnerReplyComposerProps = {
  id?: string
  value: string
  invalid?: boolean
  disabled?: boolean
  pending?: boolean
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  onChange: (value: string) => void
  onSubmit: () => void
}

// Adapter retained for the owner-reply field/error contract that PromptInput
// does not provide. Its input and submit controls are official PromptInput parts.
export function AeOwnerReplyComposer({
  id = 'ownerReply',
  value,
  invalid = false,
  disabled = false,
  pending = false,
  textareaRef,
  onChange,
  onSubmit,
}: AeOwnerReplyComposerProps) {
  function insertLineBreak(event: KeyboardEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget
    onChange(`${target.value.slice(0, target.selectionStart)}\n${target.value.slice(target.selectionEnd)}`)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.shiftKey) {
      return
    }

    event.preventDefault()
    if (event.metaKey || event.ctrlKey) {
      if (!disabled && !pending) {
        event.currentTarget.form?.requestSubmit()
      }
      return
    }

    insertLineBreak(event)
  }

  function handlePromptSubmit({ text }: PromptInputMessage) {
    // Files stay internal to PromptInput; owner replies expose only the text
    // control through the existing no-argument callback.
    const submittedText = text.length > 0 ? text : value
    if (submittedText !== value) {
      onChange(submittedText)
    }
    onSubmit()
  }

  const description = 'This reply is saved on the thread and sent to the customer. Booking, payment, and dispatch require their own confirmed action.'
  const descriptionId = `${id}-desc`
  const statusId = `${id}-error`
  const describedBy = [descriptionId, invalid ? statusId : undefined].filter(Boolean).join(' ')

  return (
    <FieldGroup>
      <Field
        {...(invalid ? { 'data-invalid': true } : {})}
        {...(disabled ? { 'data-disabled': true } : {})}
      >
        <FieldLabel htmlFor={id}>Owner reply</FieldLabel>
        <PromptInput className="w-full" onSubmit={handlePromptSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              id={id}
              aria-describedby={describedBy}
              {...(invalid ? { 'aria-invalid': true } : {})}
              name="ownerReply"
              {...(textareaRef === undefined ? {} : { ref: textareaRef })}
              value={value}
              rows={4}
              placeholder=""
              className="min-h-24 items-end"
              disabled={disabled}
              onChange={(event) => onChange(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
            />
          </PromptInputBody>
          <PromptInputFooter className="pb-2">
            <PromptInputSubmit
              aria-label="Send reply"
              disabled={disabled || pending}
              status={pending ? 'submitted' : 'ready'}
            />
          </PromptInputFooter>
        </PromptInput>
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
        {invalid ? <FieldError id={statusId}>Reply body is required.</FieldError> : null}
      </Field>
    </FieldGroup>
  )
}
