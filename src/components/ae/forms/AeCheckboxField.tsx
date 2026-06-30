import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'

export type AeCheckboxFieldProps = {
  id: string
  name?: string
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  invalid?: boolean
  onCheckedChange: (checked: boolean) => void
}

export function AeCheckboxField({
  id,
  name,
  label,
  description,
  checked,
  disabled = false,
  invalid = false,
  onCheckedChange,
}: AeCheckboxFieldProps) {
  return (
    <Field data-invalid={invalid ? true : undefined} className="ae-checkbox-field flex items-start gap-3">
      <Checkbox
        id={id}
        name={name}
        checked={checked}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      <div className="grid gap-1">
        <FieldLabel htmlFor={id} className="font-normal">
          {label}
        </FieldLabel>
        {description === undefined ? null : <FieldDescription>{description}</FieldDescription>}
      </div>
    </Field>
  )
}
