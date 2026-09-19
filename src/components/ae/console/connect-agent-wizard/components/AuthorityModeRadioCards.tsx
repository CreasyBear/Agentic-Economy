import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import type { AuthorityModeRadioCardsProps } from '../connect-agent-wizard.contracts'

const authorityCardBase =
  'grid min-h-touch cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-md border border-border px-3 py-3 has-[[data-checked]]:border-foreground has-[[data-checked]]:bg-muted enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export function AuthorityModeRadioCards({
  value,
  disabled,
  onChange,
}: AuthorityModeRadioCardsProps) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium leading-none">Authority mode</span>
      <RadioGroup
        value={value}
        onValueChange={(val) => onChange(val as typeof value)}
        disabled={disabled}
        className="grid gap-2"
      >
        <Label htmlFor="auth-spending-policy" className={authorityCardBase}>
          <RadioGroupItem value="spending_policy" id="auth-spending-policy" className="mt-0.5" />
          <div className="grid gap-0.5">
            <span className="font-medium">Work within limits</span>
            <span className="text-xs text-muted-foreground">
              Autonomous paid capability purchases up to approved limits.
            </span>
          </div>
        </Label>
        <Label htmlFor="auth-approval-required" className={authorityCardBase}>
          <RadioGroupItem value="approval_required" id="auth-approval-required" className="mt-0.5" />
          <div className="grid gap-0.5">
            <span className="font-medium">Ask each time</span>
            <span className="text-xs text-muted-foreground">
              Owner approval required for every paid capability purchase.
            </span>
          </div>
        </Label>
        <Label htmlFor="auth-read-only" className={authorityCardBase}>
          <RadioGroupItem value="read_only" id="auth-read-only" className="mt-0.5" />
          <div className="grid gap-0.5">
            <span className="font-medium">Browse only</span>
            <span className="text-xs text-muted-foreground">
              Free tool discovery and quotes only. Cannot execute paid tools.
            </span>
          </div>
        </Label>
      </RadioGroup>
    </div>
  )
}
