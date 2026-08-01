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
  return (
    <FieldGroup>
      {name === undefined ? null : <input type="hidden" name={name} value={value} />}
      <Field {...(invalid ? { 'data-invalid': true } : {})} {...(disabled ? { 'data-disabled': true } : {})}>
        <Select value={value} disabled={disabled} onValueChange={onValueChange}>
          <SelectTrigger
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
