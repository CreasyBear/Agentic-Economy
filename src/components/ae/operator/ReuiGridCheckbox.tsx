import { Checkbox as AeCheckbox, type CheckboxProps } from '@/components/ae/shared/base-ui/checkbox/checkbox'

/** ReUI uses Base UI's separate indeterminate prop; Aecon keeps its union-state control. */
export function Checkbox({ checked, indeterminate, ...props }: Omit<CheckboxProps, 'checked'> & {
  checked?: boolean
  indeterminate?: boolean
}) {
  return <AeCheckbox {...props} checked={indeterminate ? 'indeterminate' : checked ?? false} />
}
