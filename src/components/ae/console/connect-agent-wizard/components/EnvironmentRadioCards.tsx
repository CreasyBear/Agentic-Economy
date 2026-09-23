import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import type { EnvironmentRadioCardsProps } from '../connect-agent-wizard.contracts'

const ENVIRONMENT_LABEL_ID = 'connect-agent-environment-label'

const envCardBase =
  'grid min-h-touch cursor-pointer gap-1 rounded-md border border-border bg-container p-3 hover:bg-muted/60 has-[[data-checked]]:border-foreground enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export function EnvironmentRadioCards({ value, disabled, onChange }: EnvironmentRadioCardsProps) {
  return (
    <div className="grid gap-2">
      <span id={ENVIRONMENT_LABEL_ID} className="text-sm font-medium leading-none">
        Environment
      </span>
      <RadioGroup
        value={value}
        onValueChange={(val) => onChange(val as typeof value)}
        disabled={disabled}
        aria-labelledby={ENVIRONMENT_LABEL_ID}
        className="grid grid-cols-2 gap-3"
      >
        <Label htmlFor="env-sandbox" className={`${envCardBase} has-[[data-checked]]:bg-muted`}>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="sandbox" id="env-sandbox" />
            <span className="font-medium">Sandbox</span>
          </div>
          <span className="text-xs text-muted-foreground pl-6">
            Safe testing defaults. No live catalogue spend.
          </span>
        </Label>
        <Label
          htmlFor="env-production"
          className={`${envCardBase} has-[[data-checked]]:border-warning-ring has-[[data-checked]]:bg-warning-subtle`}
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="production" id="env-production" />
            <span className="font-medium">Production</span>
          </div>
          <span className="text-xs text-muted-foreground pl-6">
            Live prepaid credit. Limits are hard caps.
          </span>
        </Label>
      </RadioGroup>
    </div>
  )
}
