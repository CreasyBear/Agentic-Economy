import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import type { AgentNameFieldProps } from '../connect-agent-wizard.contracts'

const HELPER_ID = 'agent-name-helper'
const COUNT_ID = 'agent-name-count'

export function AgentNameField({
  value,
  disabled,
  invalid = false,
  inputRef,
  onChange,
}: AgentNameFieldProps) {
  return (
    <Field className="grid gap-2">
      <FieldLabel htmlFor="agent-name">Agent name</FieldLabel>
      <Input
        ref={inputRef}
        id="agent-name"
        placeholder="e.g. Research Bot"
        value={value}
        maxLength={80}
        autoFocus
        autoComplete="off"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={`${HELPER_ID} ${COUNT_ID}`}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex items-baseline justify-between gap-2">
        <FieldDescription id={HELPER_ID} className="text-xs text-muted-foreground">
          Display name for your agent in directory and call activity logs.
        </FieldDescription>
        <span id={COUNT_ID} className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {value.length}/80
        </span>
      </div>
    </Field>
  )
}
