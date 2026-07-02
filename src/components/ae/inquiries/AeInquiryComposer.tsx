import type { KeyboardEvent, RefObject } from 'react'
import { SendIcon } from 'lucide-react'

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, getFieldAccessibility } from '@/components/ui/field'
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

  const fieldA11y = getFieldAccessibility({
    id,
    invalid,
    hasDescription: description !== undefined,
    hasError: invalid && errorMessage !== undefined,
  })

  return (
    <FieldGroup>
      <Field {...fieldA11y.fieldProps}>
        <FieldLabel htmlFor={fieldA11y.controlProps.id}>{label}</FieldLabel>
        <InputGroup className="ae-inquiry-composer min-h-28 items-end">
          <InputGroupTextarea
            {...fieldA11y.controlProps}
            name={name}
            ref={textareaRef}
            value={value}
            rows={5}
            maxLength={maxLength}
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
        {description === undefined ? null : <FieldDescription {...fieldA11y.descriptionProps}>{description}</FieldDescription>}
        {invalid && errorMessage !== undefined ? <FieldError {...fieldA11y.errorProps}>{errorMessage}</FieldError> : null}
      </Field>
    </FieldGroup>
  )
}
