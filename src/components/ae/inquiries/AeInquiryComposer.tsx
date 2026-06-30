import type { KeyboardEvent, RefObject } from 'react'
import { SendIcon } from 'lucide-react'

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
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
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (onSubmit === undefined) {
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      onSubmit()
    }
  }

  return (
    <FieldGroup>
      <Field data-invalid={invalid ? true : undefined}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <InputGroup className="ae-inquiry-composer min-h-28 items-end">
          <InputGroupTextarea
            id={id}
            name={name}
            ref={textareaRef}
            value={value}
            rows={5}
            maxLength={maxLength}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
          {onSubmit === undefined ? null : (
            <InputGroupAddon align="inline-end" className="pb-2">
              <InputGroupButton
                type="button"
                size="icon-sm"
                variant="default"
                disabled={disabled || pending}
                aria-label="Submit inquiry"
                onClick={onSubmit}
              >
                {pending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        {description === undefined ? null : <FieldDescription>{description}</FieldDescription>}
        {invalid && errorMessage !== undefined ? <FieldError>{errorMessage}</FieldError> : null}
      </Field>
    </FieldGroup>
  )
}
