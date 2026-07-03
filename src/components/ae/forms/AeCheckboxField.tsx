import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'

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
  label,
  description,
  checked,
  disabled = false,
  invalid = false,
  onCheckedChange,
}: AeCheckboxFieldProps) {
  return (
    <CheckboxInput
      label={label}
      value={checked}
      isDisabled={disabled}
      onChange={onCheckedChange}
      {...(description === undefined ? {} : { description })}
      {...(invalid ? { status: { type: 'error' as const } } : {})}
    />
  )
}
