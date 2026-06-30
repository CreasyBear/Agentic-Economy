import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type AeSelectOption = {
  value: string
  label: string
}

export type AeSelectFieldProps = {
  id: string
  name?: string
  value: string
  options: readonly AeSelectOption[]
  disabled?: boolean
  invalid?: boolean
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
  placeholder = 'Choose one',
  onValueChange,
}: AeSelectFieldProps) {
  return (
    <>
      {name === undefined ? null : <input type="hidden" name={name} value={value} />}
      <Select value={value} disabled={disabled} onValueChange={onValueChange}>
        <SelectTrigger id={id} aria-invalid={invalid || undefined} className="ae-select-field">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent align="start">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}
