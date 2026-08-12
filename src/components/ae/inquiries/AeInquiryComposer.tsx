import { type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { CornerDownLeftIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'

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

// Inquiry-specific field and keyboard behavior composed from the shared form
// primitives.
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
        <form className="w-full" onSubmit={handleSubmit}>
          <InputGroup className="overflow-hidden">
            <InputGroupTextarea
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
            {onSubmit === undefined ? null : (
              <InputGroupAddon align="block-end" className="justify-end pb-2">
                <Button
                  type="submit"
                  size="icon-sm"
                  aria-label="Submit inquiry"
                  disabled={disabled || pending}
                >
                  {pending ? <Spinner /> : <CornerDownLeftIcon aria-hidden="true" />}
                </Button>
              </InputGroupAddon>
            )}
          </InputGroup>
        </form>
        {description === undefined ? null : <FieldDescription id={descriptionId}>{description}</FieldDescription>}
        {invalid && errorMessage !== undefined ? <FieldError id={statusId}>{errorMessage}</FieldError> : null}
      </Field>
    </FieldGroup>
  )
}
