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

export type AeInquiryComposerProps = {
  id?: string
  name?: string
  label: string
  description?: string
  value: string
  maxLength?: number
  invalid?: boolean
  errorMessage?: string
  disabled?: boolean
  pending?: boolean
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  onChange: (value: string) => void
  onSubmit?: () => void
}

// Adapter retained for the inquiry-specific field/error contract that PromptInput
// does not provide. Its input and submit controls are official PromptInput parts.
export function AeInquiryComposer({
  id = 'body',
  name = 'body',
  label,
  description,
  value,
  maxLength,
  invalid = false,
  errorMessage,
  disabled = false,
  pending = false,
  textareaRef,
  onChange,
  onSubmit,
}: AeInquiryComposerProps) {
  function insertLineBreak(event: KeyboardEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget
    const nextValue = `${target.value.slice(0, target.selectionStart)}\n${target.value.slice(target.selectionEnd)}`
    if (maxLength !== undefined && nextValue.length > maxLength) {
      return
    }
    onChange(nextValue)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.shiftKey) {
      return
    }

    event.preventDefault()
    if (event.metaKey || event.ctrlKey) {
      if (!disabled && !pending && onSubmit !== undefined) {
        event.currentTarget.form?.requestSubmit()
      }
      return
    }

    insertLineBreak(event)
  }

  function handlePromptSubmit({ text }: PromptInputMessage) {
    // Files stay internal to PromptInput; inquiry submission keeps its existing
    // no-argument callback contract and only exposes the text control.
    const submittedText = text.length > 0 ? text : value
    if (submittedText !== value) {
      onChange(submittedText)
    }
    onSubmit?.()
  }

  const descriptionId = `${id}-desc`
  const statusId = `${id}-error`
  const describedBy = [
    description === undefined ? undefined : descriptionId,
    invalid && errorMessage !== undefined ? statusId : undefined,
  ].filter(Boolean).join(' ') || undefined

  return (
    <FieldGroup>
      <Field
        {...(invalid ? { 'data-invalid': true } : {})}
        {...(disabled ? { 'data-disabled': true } : {})}
      >
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <PromptInput className="w-full" onSubmit={handlePromptSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              id={id}
              {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
              {...(invalid ? { 'aria-invalid': true } : {})}
              name={name}
              {...(textareaRef === undefined ? {} : { ref: textareaRef })}
              value={value}
              rows={5}
              placeholder=""
              className="min-h-28 items-end"
              {...(maxLength === undefined ? {} : { maxLength })}
              disabled={disabled}
              onChange={(event) => onChange(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
            />
          </PromptInputBody>
          {onSubmit === undefined ? null : (
            <PromptInputFooter className="pb-2">
              <PromptInputSubmit
                aria-label="Submit inquiry"
                disabled={disabled || pending}
                status={pending ? 'submitted' : 'ready'}
              />
            </PromptInputFooter>
          )}
        </PromptInput>
        {description === undefined ? null : <FieldDescription id={descriptionId}>{description}</FieldDescription>}
        {invalid && errorMessage !== undefined ? <FieldError id={statusId}>{errorMessage}</FieldError> : null}
      </Field>
    </FieldGroup>
  )
}
