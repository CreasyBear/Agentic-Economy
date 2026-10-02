import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import {
  authorityOptions,
  canSelectPublicAuthority,
  type AuthorityModeRadioGroupProps,
  type PublicAuthorityMode,
} from '../authorize-form.contracts'

import './ConsentChoiceComposition.css'

export function AuthorityModeRadioGroup({ pending, selectedMode, ceiling, onSelectMode }: AuthorityModeRadioGroupProps) {
  return (
    <fieldset className="arc-market arc-consent-authority" disabled={pending}>
      <legend>Authority</legend>
      <RadioGroup aria-describedby="consent-expiry" value={selectedMode} onValueChange={(value) => onSelectMode(value as PublicAuthorityMode)} className="arc-consent-authority-options">
        {authorityOptions.map((option) => {
          const disabled = !canSelectPublicAuthority(option.value, ceiling)
          return (
            <Label
              key={option.value}
              htmlFor={`authority-${option.value}`}
              className="arc-consent-authority-card"
              data-disabled={disabled}
              data-selected={selectedMode === option.value}
            >
              <RadioGroupItem id={`authority-${option.value}`} value={option.value} disabled={disabled} className="arc-consent-authority-radio" />
              <span className="arc-consent-authority-copy">
                <span className="arc-consent-authority-title">{option.label}</span>
                <span className="arc-consent-authority-description">{disabled ? 'This agent requested narrower access.' : option.description}</span>
              </span>
            </Label>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}
