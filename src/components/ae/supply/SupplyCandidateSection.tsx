import { AeSection } from '@/components/ae/layout/AeSection'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import type { SupplyToolCandidate } from '@/modules/capability-supply/source-preview'

export function SupplyCandidateSection({ candidates, selectedRef, onSelect }: Readonly<{
  candidates: readonly SupplyToolCandidate[]
  selectedRef: string
  onSelect: (candidateRef: string) => void
}>) {
  return (
    <AeSection title="Select a Tool" description={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'} found. Unsupported source methods remain visible with their correction.`}>
      <RadioGroup value={selectedRef} onValueChange={onSelect}>
        {candidates.map((candidate) => <CandidateRow key={candidate.candidateRef} candidate={candidate} />)}
      </RadioGroup>
    </AeSection>
  )
}

function CandidateRow({ candidate }: Readonly<{ candidate: SupplyToolCandidate }>) {
  const supported = candidate.disposition.kind === 'supported'
  return (
    <div className="grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-border p-4" data-disabled={!supported || undefined}>
      <RadioGroupItem value={candidate.candidateRef} disabled={!supported} aria-label={`Select ${candidate.title}`} />
      <div className="grid min-w-0 gap-1">
        <p className="font-semibold text-foreground">{candidate.title}</p>
        <p className="text-sm text-muted-foreground">{candidate.description}</p>
        <p className="text-sm text-muted-foreground">{candidate.authentication.kind === 'public' ? 'Public' : 'Connection required'} · {candidate.validationExampleAvailable ? 'Validation input available' : 'Validation input required'}</p>
        {supported ? null : <p className="text-sm text-destructive">Action required: update this Tool at its source. {REASON_COPY[candidate.disposition.reason] ?? REASON_COPY_FALLBACK}</p>}
      </div>
    </div>
  )
}
