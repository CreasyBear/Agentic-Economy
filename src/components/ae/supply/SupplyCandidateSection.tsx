import { useEffect, type Ref } from 'react'
import { AeSection } from '@/components/ae/layout/AeSection'
import { RadioCards } from '@/components/arc/radio-cards/radio-cards'
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
      <RadioCards
        id={SUPPLY_PUBLICATION_FIELD_IDS.candidate}
        tabIndex={-1}
        aria-label="Select a Tool"
        aria-invalid={invalid || undefined}
        data-invalid={invalid || undefined}
        aria-describedby={errorDescribedBy}
        value={selectedRef}
        onValueChange={onSelect}
        layout="list"
        className="arc-market"
        options={candidates.map((candidate) => {
          const description = <CandidateFacts candidate={candidate} />
          return {
            value: candidate.candidateRef,
            label: <span title={candidate.title}>Select {candidate.title}</span>,
            description,
            disabled: candidate.disposition.kind === 'unsupported',
            disabledReason: description,
          }
        })}
      />
    </AeSection>
  )
}

function CandidateFacts({ candidate }: Readonly<{ candidate: SupplyToolCandidate }>) {
  const supported = candidate.disposition.kind === 'supported'

  return (
    <span className="arc-source-candidate-copy">
      <span className="arc-source-candidate-description">{candidate.description}</span>
      <span className="arc-source-candidate-payment">{candidate.x402 === undefined ? 'Payment challenge incomplete' : `Price ${candidate.x402.amount} · payTo ${candidate.x402.payTo} · ${candidate.x402.network}`}</span>
      <span className="arc-source-candidate-description">Input {candidate.inputSchema === undefined ? 'not declared' : 'schema declared'} · Output {candidate.outputSchema === undefined ? 'not declared' : 'schema declared'}</span>
      {supported ? null : <span className="arc-source-candidate-refusal">{REASON_COPY[candidate.disposition.reason] ?? `This operation cannot be imported (${candidate.disposition.reason}). Correct its source definition, then find Tools again.`}</span>}
    </span>
  )
}
