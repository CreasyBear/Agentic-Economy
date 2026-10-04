import { RadioCards } from '@/components/arc/radio-cards/radio-cards'

import {
  authorityOptions,
  canSelectPublicAuthority,
  type AuthorityModeRadioGroupProps,
} from '../authorize-form.contracts'

import './ConsentChoiceComposition.css'

export function AuthorityModeRadioGroup({ pending, selectedMode, ceiling, onSelectMode }: AuthorityModeRadioGroupProps) {
  const options = authorityOptions.map((option) => {
    const disabled = !canSelectPublicAuthority(option.value, ceiling)
    return {
      ...option,
      disabled,
      disabledReason: disabled ? 'This agent requested narrower access.' : undefined,
    }
  })

  const handleValueChange = (value: string) => {
    if (pending) return

    const option = authorityOptions.find((candidate) => candidate.value === value)
    if (option === undefined || !canSelectPublicAuthority(option.value, ceiling)) return

    onSelectMode(option.value)
  }

  return (
    <fieldset className="arc-market arc-consent-authority" disabled={pending}>
      <legend>Authority</legend>
      <RadioCards
        aria-label="Authority"
        aria-describedby="consent-expiry"
        disabled={pending}
        layout="list"
        value={selectedMode}
        options={options}
        onValueChange={handleValueChange}
      />
    </fieldset>
  )
}
