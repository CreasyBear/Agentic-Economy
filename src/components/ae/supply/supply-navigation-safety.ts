import { useEffect } from 'react'

type SupplyNavigationSafety = Readonly<{
  dirty: boolean
  pending: boolean
  saveOutcome: 'idle' | 'saved' | 'failed' | 'outcome_unknown'
}>

export function supplyPublishAuthorityRequired(input: Readonly<{
  selected: { authentication: { kind: string } } | undefined
  preview: { provenance: { authority: string } } | undefined
}>): boolean {
  if (input.selected === undefined || input.preview === undefined) return true
  return input.selected.authentication.kind !== 'public' || input.preview.provenance.authority === 'verified_registry'
}

export function useReportSupplyNavigationSafety(
  onChange: ((next: SupplyNavigationSafety) => void) | undefined,
  state: Readonly<{
    termsDirty: boolean
    pending: string | undefined
    termsSaveOutcome: SupplyNavigationSafety['saveOutcome']
  }>,
) {
  useEffect(() => {
    onChange?.({
      dirty: state.termsDirty,
      pending: state.pending === 'terms',
      saveOutcome: state.termsSaveOutcome,
    })
  }, [onChange, state.pending, state.termsDirty, state.termsSaveOutcome])
}
