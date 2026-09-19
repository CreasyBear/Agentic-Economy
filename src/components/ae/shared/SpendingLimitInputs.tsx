import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
  const rootClass = className ?? 'grid min-h-[4.5rem] grid-cols-1 gap-3 sm:grid-cols-3'

  if (presentation === 'sandbox-static') {
    const display = sandboxDisplay ?? values
    return (
      <div className={rootClass}>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">{PER_CALL_LABEL}</span>
          <span className="font-mono text-sm tabular-nums text-foreground">{display.perCall}</span>
        </div>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">{DAILY_LABEL}</span>
          <span className="font-mono text-sm tabular-nums text-foreground">{display.daily}</span>
        </div>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">{MONTHLY_LABEL}</span>
          <span className="font-mono text-sm tabular-nums text-foreground">{display.monthly}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={rootClass}>
      <div className="grid gap-1">
        <Label htmlFor={ids.perCall} className="text-xs">
          {PER_CALL_LABEL}
        </Label>
        <Input
          id={ids.perCall}
          type="text"
          inputMode="decimal"
          value={values.perCall}
          onChange={(e) => onPerCallChange(e.target.value)}
          disabled={disabled}
          {...(placeholders?.perCall !== undefined ? { placeholder: placeholders.perCall } : {})}
          className="font-mono text-sm tabular-nums"
        />
      </div>

      <div className="grid gap-1">
        <Label htmlFor={ids.daily} className="text-xs">
          {DAILY_LABEL}
        </Label>
        <Input
          id={ids.daily}
          type="text"
          inputMode="decimal"
          value={values.daily}
          onChange={(e) => onDailyChange(e.target.value)}
          disabled={disabled}
          {...(placeholders?.daily !== undefined ? { placeholder: placeholders.daily } : {})}
          className="font-mono text-sm tabular-nums"
        />
      </div>

      <div className="grid gap-1">
        <Label htmlFor={ids.monthly} className="text-xs">
          {MONTHLY_LABEL}
        </Label>
        <Input
          id={ids.monthly}
          type="text"
          inputMode="decimal"
          value={values.monthly}
          onChange={(e) => onMonthlyChange(e.target.value)}
          disabled={disabled}
          {...(placeholders?.monthly !== undefined ? { placeholder: placeholders.monthly } : {})}
          className="font-mono text-sm tabular-nums"
        />
      </div>
    </div>
  )
}
