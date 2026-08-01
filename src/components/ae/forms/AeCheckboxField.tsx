import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'

export type AeCheckboxFieldProps = {
  id: string
  name?: string
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  invalid?: boolean
  errorMessage?: string
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
  errorMessage,
  onCheckedChange,
}: AeCheckboxFieldProps) {
  const descriptionId = `${id}-description`
  const errorId = `${id}-error`
  const describedBy = [description === undefined ? undefined : descriptionId, errorMessage === undefined ? undefined : errorId].filter((entry): entry is string => entry !== undefined).join(' ') || undefined

  return (
    <FieldGroup>
      <Field orientation="horizontal" {...(invalid ? { 'data-invalid': true } : {})} {...(disabled ? { 'data-disabled': true } : {})}>
        <Checkbox
          id={id}
          {...(name === undefined ? {} : { name })}
          checked={checked}
          disabled={disabled}
          {...(invalid ? { 'aria-invalid': true } : {})}
          {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
          onCheckedChange={(next) => onCheckedChange(next === true)}
        />
        <FieldContent>
          <FieldLabel htmlFor={id} className="min-h-11 items-center">{label}</FieldLabel>
          {description === undefined ? null : <FieldDescription id={descriptionId}>{description}</FieldDescription>}
          {errorMessage === undefined ? null : <FieldError id={errorId}>{errorMessage}</FieldError>}
        </FieldContent>
      </Field>
    </FieldGroup>
  )
}
