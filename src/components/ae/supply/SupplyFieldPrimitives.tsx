import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export type TextFieldProps = Readonly<{
  id: string
  label: string
  value: string
  description: string
  type?: string
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  onChange: (value: string) => void
}>

export function TextField({
  id,
  label,
  value,
  description,
  type = 'text',
  disabled = false,
  invalid = false,
  describedBy,
  onChange,
}: TextFieldProps) {
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid && describedBy !== undefined ? describedBy : undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <FieldDescription>{description}</FieldDescription>
    </Field>
  )
}

export type TextAreaFieldProps = Readonly<{
  id: string
  label: string
  value: string
  description: string
  disabled?: boolean
  onChange: (value: string) => void
}>

export function TextAreaField({
  id,
  label,
  value,
  description,
  disabled = false,
  onChange,
}: TextAreaFieldProps) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Textarea id={id} rows={6} value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} /><FieldDescription>{description}</FieldDescription><FieldError /></Field>
}
