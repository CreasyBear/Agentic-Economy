import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import type { AuthorityModeRadioCardsProps } from '../connect-agent-wizard.contracts'

const AUTHORITY_LABEL_ID = 'connect-agent-authority-label'

export function AuthorityModeRadioCards({
  value,
  disabled,
  onChange,
}: AuthorityModeRadioCardsProps) {
  return (
    <div className="arc-agent-choice-group">
      <span id={AUTHORITY_LABEL_ID} className="arc-agent-choice-heading">Authority mode</span>
      <RadioGroup
        value={value}
        onValueChange={(val) => onChange(val as typeof value)}
        disabled={disabled}
        aria-labelledby={AUTHORITY_LABEL_ID}
        className="arc-agent-authority-options"
      >
        <Label htmlFor="auth-spending-policy" className="arc-agent-choice arc-agent-choice-list">
          <RadioGroupItem value="spending_policy" id="auth-spending-policy" className="mt-0.5" />
          <div className="arc-agent-choice-copy">
            <span className="font-medium">Work within limits</span>
            <span className="arc-agent-choice-description">
              Autonomous paid capability purchases up to approved limits.
            </span>
          </div>
        </Label>
        <Label htmlFor="auth-approval-required" className="arc-agent-choice arc-agent-choice-list">
          <RadioGroupItem value="approval_required" id="auth-approval-required" className="mt-0.5" />
          <div className="arc-agent-choice-copy">
            <span className="font-medium">Ask each time</span>
            <span className="arc-agent-choice-description">
              Owner approval required for every paid capability purchase.
            </span>
          </div>
        </Label>
        <Label htmlFor="auth-read-only" className="arc-agent-choice arc-agent-choice-list">
          <RadioGroupItem value="read_only" id="auth-read-only" className="mt-0.5" />
          <div className="arc-agent-choice-copy">
            <span className="font-medium">Browse only</span>
            <span className="arc-agent-choice-description">
              Free tool discovery and quotes only. Cannot execute paid tools.
            </span>
          </div>
        </Label>
      </RadioGroup>
    </div>
  )
}
