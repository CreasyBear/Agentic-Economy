import './SpendingInputsComposition.css'

export type SpendingLimitInputsProps = Readonly<{
  presentation: 'editable' | 'sandbox-static'
  ids: Readonly<{ perCall: string; daily: string; monthly: string }>
  values: Readonly<{ perCall: string; daily: string; monthly: string }>
  disabled: boolean
  className?: string
  placeholders?: Readonly<{ perCall?: string; daily?: string; monthly?: string }>
  sandboxDisplay?: Readonly<{ perCall: string; daily: string; monthly: string }>
  onPerCallChange: (value: string) => void
  onDailyChange: (value: string) => void
  onMonthlyChange: (value: string) => void
}>

const PER_CALL_LABEL = 'Max spend per call (A$)'
const DAILY_LABEL = 'Daily spend limit (A$)'
const MONTHLY_LABEL = 'Monthly spend limit (A$)'

export function SpendingLimitInputs({
  presentation,
  ids,
  values,
  disabled,
  className,
  placeholders,
  sandboxDisplay,
  onPerCallChange,
  onDailyChange,
  onMonthlyChange,
}: SpendingLimitInputsProps) {
  const rootClass = `arc-market arc-spending-inputs ${className ?? 'arc-spending-inputs-grid'}`

  if (presentation === 'sandbox-static') {
    const display = sandboxDisplay ?? values
    return (
      <div className={rootClass}>
        <div className="arc-spending-input-field">
          <span className="arc-spending-input-label">{PER_CALL_LABEL}</span>
          <span className="arc-spending-input-value">{display.perCall}</span>
        </div>
        <div className="arc-spending-input-field">
          <span className="arc-spending-input-label">{DAILY_LABEL}</span>
          <span className="arc-spending-input-value">{display.daily}</span>
        </div>
        <div className="arc-spending-input-field">
          <span className="arc-spending-input-label">{MONTHLY_LABEL}</span>
          <span className="arc-spending-input-value">{display.monthly}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={rootClass}>
      <div className="arc-spending-input-field">
        <label htmlFor={ids.perCall} className="arc-spending-input-label">
          {PER_CALL_LABEL}
        </label>
        <input
          id={ids.perCall}
          type="text"
          inputMode="decimal"
          value={values.perCall}
          onChange={(e) => onPerCallChange(e.target.value)}
          disabled={disabled}
          {...(placeholders?.perCall !== undefined ? { placeholder: placeholders.perCall } : {})}
          className="arc-spending-input-control"
        />
      </div>

      <div className="arc-spending-input-field">
        <label htmlFor={ids.daily} className="arc-spending-input-label">
          {DAILY_LABEL}
        </label>
        <input
          id={ids.daily}
          type="text"
          inputMode="decimal"
          value={values.daily}
          onChange={(e) => onDailyChange(e.target.value)}
          disabled={disabled}
          {...(placeholders?.daily !== undefined ? { placeholder: placeholders.daily } : {})}
          className="arc-spending-input-control"
        />
      </div>

      <div className="arc-spending-input-field">
        <label htmlFor={ids.monthly} className="arc-spending-input-label">
          {MONTHLY_LABEL}
        </label>
        <input
          id={ids.monthly}
          type="text"
          inputMode="decimal"
          value={values.monthly}
          onChange={(e) => onMonthlyChange(e.target.value)}
          disabled={disabled}
          {...(placeholders?.monthly !== undefined ? { placeholder: placeholders.monthly } : {})}
          className="arc-spending-input-control"
        />
      </div>
    </div>
  )
}
