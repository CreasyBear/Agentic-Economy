import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/arc/textarea/textarea'
import './SupplyPublicationComposition.css'

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
    <Field className="arc-market arc-publication-field" data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        className="arc-publication-input"
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
  return (
    <div className="arc-market">
      <Textarea
        id={id}
        label={label}
        description={description}
        rows={6}
        className="arc-publication-textarea"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  )
}
