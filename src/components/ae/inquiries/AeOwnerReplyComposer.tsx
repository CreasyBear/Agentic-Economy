import { SendIcon } from 'lucide-react'
import type { KeyboardEvent, RefObject } from 'react'

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, getFieldAccessibility } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'

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
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      onSubmit()
    }
  }

  const fieldA11y = getFieldAccessibility({ id, invalid, hasDescription: true, hasError: invalid })

  return (
    <FieldGroup>
      <Field {...fieldA11y.fieldProps}>
        <FieldLabel htmlFor={fieldA11y.controlProps.id}>Owner reply</FieldLabel>
        <InputGroup className="ae-owner-reply min-h-24 items-end">
          <InputGroupTextarea
            {...fieldA11y.controlProps}
            name="ownerReply"
            ref={textareaRef}
            value={value}
            rows={4}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
          <InputGroupAddon align="inline-end" className="pb-2">
            <InputGroupButton
              size="icon-sm"
              variant="default"
              disabled={disabled || pending}
              aria-label="Send owner reply"
              onClick={onSubmit}
            >
              {pending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription {...fieldA11y.descriptionProps}>
          This message is private to the inquiry thread and the customer notification path. Press ⌘↵ or Ctrl↵ to send.
        </FieldDescription>
        {invalid ? <FieldError {...fieldA11y.errorProps}>Reply body is required.</FieldError> : null}
      </Field>
    </FieldGroup>
  )
}
