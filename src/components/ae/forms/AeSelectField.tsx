import { useRef, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, FieldGroup } from '@/components/ui/field'

export type AeSelectOption = {
  value: string
  label: string
}


function ensureScrollIntoView(node: HTMLDivElement | null): void {
  if (node !== null && typeof node.scrollIntoView !== 'function') {
    node.scrollIntoView = () => undefined
  }
}

export type AeSelectFieldProps = {
  id: string
  name?: string
  value: string
  options: readonly AeSelectOption[]
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  placeholder?: string
  onValueChange: (value: string) => void
}

export function AeSelectField({
  id,
  name,
  value,
  options,
  disabled = false,
  invalid = false,
  describedBy,
  placeholder = 'Choose one',
  onValueChange,
}: AeSelectFieldProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      window.setTimeout(() => triggerRef.current?.focus(), 350)
    }
  }

  return (
    <FieldGroup>
      {name === undefined ? null : <input type="hidden" name={name} value={value} />}
      <Field {...(invalid ? { 'data-invalid': true } : {})} {...(disabled ? { 'data-disabled': true } : {})}>
        <Select value={value} open={open} disabled={disabled} onOpenChange={handleOpenChange} onValueChange={onValueChange}>
          <SelectTrigger
            ref={triggerRef}
            id={id}
            className="min-h-11 w-full"
            {...(invalid ? { 'aria-invalid': true } : {})}
            {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value} ref={ensureScrollIntoView}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  )
}
