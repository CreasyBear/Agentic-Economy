import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import {
  AUTHORIZE_RADIO_CARD_CLASS_TOUCH,
  authorityOptions,
  canSelectPublicAuthority,
  type AuthorityModeRadioGroupProps,
  type PublicAuthorityMode,
} from '../authorize-form.contracts'

export function AuthorityModeRadioGroup({ pending, selectedMode, ceiling, onSelectMode }: AuthorityModeRadioGroupProps) {
  return (
    <fieldset className="grid gap-3" disabled={pending}>
      <legend className="sr-only">Authority</legend>
      <RadioGroup aria-describedby="consent-expiry" value={selectedMode} onValueChange={(value) => onSelectMode(value as PublicAuthorityMode)} className="grid gap-2">
        {authorityOptions.map((option) => {
          const disabled = !canSelectPublicAuthority(option.value, ceiling)
          return (
            <Label key={option.value} htmlFor={`authority-${option.value}`} className={AUTHORIZE_RADIO_CARD_CLASS_TOUCH}>
              <RadioGroupItem id={`authority-${option.value}`} value={option.value} disabled={disabled} className="mt-1" />
              <span className="grid gap-1">
                <span className="font-medium text-foreground">{option.label}</span>
                <span className="text-sm font-normal text-muted-foreground">{disabled ? 'This agent requested narrower access.' : option.description}</span>
              </span>
            </Label>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}
