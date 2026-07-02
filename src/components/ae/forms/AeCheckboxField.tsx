import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel, getFieldAccessibility } from '@/components/ui/field'

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
  const fieldA11y = getFieldAccessibility({ id, invalid, hasDescription: description !== undefined })

  return (
    <Field {...fieldA11y.fieldProps} className="ae-checkbox-field flex items-start gap-3">
      <Checkbox
        {...fieldA11y.controlProps}
        name={name}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      <div className="grid gap-1">
        <FieldLabel htmlFor={id} className="font-normal">
          {label}
        </FieldLabel>
        {description === undefined ? null : <FieldDescription {...fieldA11y.descriptionProps}>{description}</FieldDescription>}
      </div>
    </Field>
  )
}
