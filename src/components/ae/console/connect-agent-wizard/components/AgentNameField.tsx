import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { AgentNameFieldProps } from '../connect-agent-wizard.contracts'

export function AgentNameField({ value, disabled, onChange }: AgentNameFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="agent-name">Agent name</Label>
      <Input
        id="agent-name"
        placeholder="e.g. Research Bot"
        value={value}
        maxLength={80}
        autoFocus
        autoComplete="off"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Display name for your agent in directory and call activity logs.
        </p>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {value.length}/80
        </span>
      </div>
    </div>
  )
}
