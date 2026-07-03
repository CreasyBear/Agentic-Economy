import { forwardRef, type ComponentPropsWithoutRef, type KeyboardEvent, type RefObject } from 'react'
import { SendIcon } from 'lucide-react'

import { Button } from '@astryxdesign/core/Button'
import { Field } from '@astryxdesign/core/Field'
import { FormLayout } from '@astryxdesign/core/FormLayout'

import { cn } from '@/lib/utils'

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

type OwnerReplyInputGroupAddonAlign = 'inline-start' | 'inline-end' | 'block-start' | 'block-end'

function OwnerReplyInputGroup({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3', className)}
      {...props}
    />
  )
}

function OwnerReplyInputGroupAddon({
  className,
  align: _align,
  ...props
}: ComponentPropsWithoutRef<'div'> & { align?: OwnerReplyInputGroupAddonAlign }) {
  return <div className={cn('flex items-center gap-1 text-secondary', className)} {...props} />
}

const OwnerReplyInputGroupTextarea = forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<'textarea'>>(
  function OwnerReplyInputGroupTextarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn('min-h-20 flex-1 bg-transparent text-sm outline-none', className)} {...props} />
  }
)

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

  const description = 'This message is private to the inquiry thread and the customer notification path. Press ⌘↵ or Ctrl↵ to send.'
  const descriptionId = `${id}-desc`
  const statusId = `${id}-error`
  const describedBy = [descriptionId, invalid ? statusId : undefined].filter(Boolean).join(' ')

  return (
    <FormLayout>
      <Field
        label="Owner reply"
        inputID={id}
        description={description}
        descriptionID={descriptionId}
        {...(invalid ? { status: { type: 'error' as const, message: 'Reply body is required.', messageID: statusId } } : {})}
      >
        <OwnerReplyInputGroup className="min-h-24 items-end">
          <OwnerReplyInputGroupTextarea
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            name="ownerReply"
            ref={textareaRef}
            value={value}
            rows={4}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
          <OwnerReplyInputGroupAddon align="inline-end" className="pb-2">
            <Button
              type="button"
              size="sm"
              variant="primary"
              isIconOnly
              label="Send reply"
              icon={<SendIcon aria-hidden="true" />}
              isDisabled={disabled || pending}
              isLoading={pending}
              onClick={onSubmit}
            />
          </OwnerReplyInputGroupAddon>
        </OwnerReplyInputGroup>
      </Field>
    </FormLayout>
  )
}
