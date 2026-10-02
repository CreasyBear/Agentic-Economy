import { useEffect, type Ref } from 'react'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { REASON_COPY } from '@/content/reason-copy'
import type { SupplyToolCandidate } from '@/modules/capability-supply/source-preview'
import {
  SUPPLY_PUBLICATION_ERROR_ID,
  SUPPLY_PUBLICATION_FIELD_IDS,
  type SupplyPublicationInvalidField,
} from './supply-source-native-start-presentation'
import './SourceCandidatesComposition.css'

export function SupplyCandidateSection({ candidates, selectedRef, invalidField, fieldError, headingRef, onSelect }: Readonly<{
  candidates: readonly SupplyToolCandidate[]
  selectedRef: string
  invalidField?: SupplyPublicationInvalidField
  fieldError?: string
  headingRef?: Ref<HTMLHeadingElement>
  onSelect: (candidateRef: string) => void
}>) {
  const invalid = invalidField === 'candidate'
  const errorDescribedBy = invalid && fieldError !== undefined ? SUPPLY_PUBLICATION_ERROR_ID : undefined

  useEffect(() => {
    if (!invalid || fieldError === undefined) return
    document.getElementById(SUPPLY_PUBLICATION_FIELD_IDS.candidate)?.focus()
  }, [invalid, fieldError])

  return (
    <AeSection title="Select a Tool" description={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'} found. Unsupported source methods remain visible with their correction.`} {...(headingRef === undefined ? {} : { headingRef })}>
      <RadioGroup
        id={SUPPLY_PUBLICATION_FIELD_IDS.candidate}
        tabIndex={-1}
        aria-label="Select a Tool"
        aria-invalid={invalid || undefined}
        data-invalid={invalid || undefined}
        aria-describedby={errorDescribedBy}
        value={selectedRef}
        onValueChange={(val) => onSelect(String(val))}
        className="arc-market arc-source-candidates"
      >
        {candidates.map((candidate) => <CandidateRow key={candidate.candidateRef} candidate={candidate} />)}
      </RadioGroup>
    </AeSection>
  )
}

function CandidateRow({ candidate }: Readonly<{ candidate: SupplyToolCandidate }>) {
  const supported = candidate.disposition.kind === 'supported'
  const inputId = `supply-candidate-${candidate.candidateRef}`

  return (
    <Label
      htmlFor={inputId}
      className="arc-source-candidate"
      data-disabled={!supported || undefined}
    >
      <RadioGroupItem
        id={inputId}
        value={candidate.candidateRef}
        disabled={!supported}
        aria-label={`Select ${candidate.title}`}
        className="arc-source-candidate-radio"
      />
      <div className="arc-source-candidate-copy">
        <p className="arc-source-candidate-title">{candidate.title}</p>
        <p className="arc-source-candidate-description">{candidate.description}</p>
        <p className="arc-source-candidate-payment">{candidate.x402 === undefined ? 'Payment challenge incomplete' : `Price ${candidate.x402.amount} · payTo ${candidate.x402.payTo} · ${candidate.x402.network}`}</p>
        <p className="arc-source-candidate-description">Input {candidate.inputSchema === undefined ? 'not declared' : 'schema declared'} · Output {candidate.outputSchema === undefined ? 'not declared' : 'schema declared'}</p>
        {supported ? null : <p className="arc-source-candidate-refusal">{REASON_COPY[candidate.disposition.reason] ?? `This operation cannot be imported (${candidate.disposition.reason}). Correct its source definition, then find Tools again.`}</p>}
      </div>
    </Label>
  )
}
