import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'

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
  const descriptionId = `${id}-description`

  return (
    <FieldGroup>
      <Field orientation="horizontal" {...(invalid ? { 'data-invalid': true } : {})} {...(disabled ? { 'data-disabled': true } : {})}>
        <Checkbox
          id={id}
          {...(name === undefined ? {} : { name })}
          checked={checked}
          disabled={disabled}
          {...(invalid ? { 'aria-invalid': true } : {})}
          {...(description === undefined ? {} : { 'aria-describedby': descriptionId })}
          onCheckedChange={(next) => onCheckedChange(next === true)}
        />
        <FieldContent>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          {description === undefined ? null : <FieldDescription id={descriptionId}>{description}</FieldDescription>}
        </FieldContent>
      </Field>
    </FieldGroup>
  )
}
