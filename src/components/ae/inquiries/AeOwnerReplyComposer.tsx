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

// Owner-reply field and keyboard behavior composed from the shared form
// primitives.
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
        <form className="w-full" onSubmit={handleSubmit}>
          <InputGroup className="overflow-hidden">
            <InputGroupTextarea
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
            <InputGroupAddon align="block-end" className="justify-end pb-2">
              <Button
                type="submit"
                size="icon-sm"
                aria-label="Send reply"
                disabled={disabled || pending}
              >
                {pending ? <Spinner /> : <CornerDownLeftIcon aria-hidden="true" />}
              </Button>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
        {invalid ? <FieldError id={statusId}>Reply body is required.</FieldError> : null}
      </Field>
    </FieldGroup>
  )
}
