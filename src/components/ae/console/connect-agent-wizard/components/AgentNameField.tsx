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
    <div className="arc-agent-name-field">
      <label htmlFor="agent-name">Agent name</label>
      <input
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
        className="arc-agent-name-input"
      />
      <div className="arc-agent-name-description">
        <p id={HELPER_ID}>
          Display name for your agent in directory and call activity logs.
        </p>
        <span id={COUNT_ID}>
          {value.length}/80
        </span>
      </div>
    </div>
  )
}
