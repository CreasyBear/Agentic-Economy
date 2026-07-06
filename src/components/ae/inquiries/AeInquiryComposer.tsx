import { type ComponentPropsWithoutRef, type KeyboardEvent, type Ref, type RefObject } from 'react'
import { SendIcon } from 'lucide-react'

import { Button } from '@astryxdesign/core/Button'
import { Field } from '@astryxdesign/core/Field'
import { FormLayout } from '@astryxdesign/core/FormLayout'

import { cn } from '@/lib/utils'

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

type ComposerInputGroupAddonAlign = 'inline-start' | 'inline-end' | 'block-start' | 'block-end'

function ComposerInputGroup({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3 motion-safe:transition motion-safe:duration-150 focus-within:border-accent', className)}
      {...props}
    />
  )
}

function ComposerInputGroupAddon({
  className,
  align: _align,
  ...props
}: ComponentPropsWithoutRef<'div'> & { align?: ComposerInputGroupAddonAlign }) {
  return <div className={cn('flex items-center gap-1 text-secondary', className)} {...props} />
}

type ComposerInputGroupTextareaProps = ComponentPropsWithoutRef<'textarea'> & {
  ref?: Ref<HTMLTextAreaElement> | undefined
}

function ComposerInputGroupTextarea({ className, ref, ...props }: ComposerInputGroupTextareaProps) {
  return <textarea ref={ref} className={cn('min-h-20 flex-1 bg-transparent text-sm outline-none', className)} {...props} />
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

  const descriptionId = `${id}-desc`
  const statusId = `${id}-error`
  const describedBy = [
    description === undefined ? undefined : descriptionId,
    invalid && errorMessage !== undefined ? statusId : undefined,
  ].filter(Boolean).join(' ') || undefined

  return (
    <FormLayout>
      <Field
        label={label}
        inputID={id}
        {...(description === undefined ? {} : { description, descriptionID: descriptionId })}
        {...(invalid && errorMessage !== undefined ? { status: { type: 'error' as const, message: errorMessage, messageID: statusId } } : {})}
      >
        <ComposerInputGroup className="min-h-28 items-end">
          <ComposerInputGroupTextarea
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            name={name}
            {...(textareaRef === undefined ? {} : { ref: textareaRef })}
            value={value}
            rows={5}
            maxLength={maxLength}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
          {onSubmit === undefined ? null : (
            <ComposerInputGroupAddon align="inline-end" className="pb-2">
              <Button
                type="button"
                size="sm"
                variant="primary"
                isIconOnly
                label="Submit inquiry"
                icon={<SendIcon aria-hidden="true" />}
                isDisabled={disabled || pending}
                isLoading={pending}
                onClick={onSubmit}
              />
            </ComposerInputGroupAddon>
          )}
        </ComposerInputGroup>
      </Field>
    </FormLayout>
  )
}
