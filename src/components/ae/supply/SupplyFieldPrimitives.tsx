import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function TextField({ id, label, value, description, type = 'text', disabled = false, onChange }: Readonly<{ id: string; label: string; value: string; description: string; type?: string; disabled?: boolean; onChange: (value: string) => void }>) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} /><FieldDescription>{description}</FieldDescription></Field>
}

export function TextAreaField({ id, label, value, description, disabled = false, onChange }: Readonly<{ id: string; label: string; value: string; description: string; disabled?: boolean; onChange: (value: string) => void }>) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Textarea id={id} rows={6} value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} /><FieldDescription>{description}</FieldDescription><FieldError /></Field>
}
