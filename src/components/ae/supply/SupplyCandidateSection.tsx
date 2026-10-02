import { useEffect, type Ref } from 'react'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { REASON_COPY } from '@/content/reason-copy'
import type { SupplyToolCandidate } from '@/modules/capability-supply/source-preview'
import {
  SUPPLY_PUBLICATION_ERROR_ID,
  SUPPLY_PUBLICATION_FIELD_IDS,
  type SupplyPublicationInvalidField,
} from './supply-source-native-start-presentation'

const CANDIDATE_CARD_CLASS =
  'grid min-h-touch cursor-pointer grid-cols-[auto_1fr] gap-3 rounded-lg border border-border p-4 has-[[data-checked]]:border-foreground has-[[data-checked]]:bg-muted enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

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
      className={cn(
        CANDIDATE_CARD_CLASS,
        !supported && 'cursor-not-allowed opacity-80 motion-reduce:active:scale-100 active:scale-100',
      )}
      data-disabled={!supported || undefined}
    >
      <RadioGroupItem
        id={inputId}
        value={candidate.candidateRef}
        disabled={!supported}
        aria-label={`Select ${candidate.title}`}
        className="mt-0.5"
      />
      <div className="grid min-w-0 gap-1">
        <p className="font-medium text-foreground">{candidate.title}</p>
        <p className="text-sm text-muted-foreground">{candidate.description}</p>
        <p className="text-sm text-muted-foreground">{candidate.x402 === undefined ? 'Payment challenge incomplete' : `Price ${candidate.x402.amount} · payTo ${candidate.x402.payTo} · ${candidate.x402.network}`}</p>
        <p className="text-sm text-muted-foreground">Input {candidate.inputSchema === undefined ? 'not declared' : 'schema declared'} · Output {candidate.outputSchema === undefined ? 'not declared' : 'schema declared'}</p>
        {supported ? null : <p className="text-sm text-destructive">{REASON_COPY[candidate.disposition.reason] ?? `This operation cannot be imported (${candidate.disposition.reason}). Correct its source definition, then find Tools again.`}</p>}
      </div>
    </Label>
  )
}
