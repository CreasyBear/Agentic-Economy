import { AeSection } from '@/components/ae/layout/AeSection'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import type { SupplyToolCandidate } from '@/modules/capability-supply/source-preview'

const CANDIDATE_CARD_CLASS =
  'grid min-h-touch cursor-pointer grid-cols-[auto_1fr] gap-3 rounded-lg border border-border p-4 has-[[data-checked]]:border-foreground has-[[data-checked]]:bg-muted enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export function SupplyCandidateSection({ candidates, selectedRef, onSelect }: Readonly<{
  candidates: readonly SupplyToolCandidate[]
  selectedRef: string
  onSelect: (candidateRef: string) => void
}>) {
  return (
    <AeSection title="Select a Tool" description={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'} found. Unsupported source methods remain visible with their correction.`}>
      <RadioGroup value={selectedRef} onValueChange={(val) => onSelect(String(val))}>
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
        <p className="text-sm text-muted-foreground">{candidate.authentication.kind === 'public' ? 'Public' : 'Connection required'} · {candidate.validationExampleAvailable ? 'Validation input available' : 'Validation input required'}</p>
        {supported ? null : <p className="text-sm text-destructive">Action required: update this Tool at its source. {REASON_COPY[candidate.disposition.reason] ?? REASON_COPY_FALLBACK}</p>}
      </div>
    </Label>
  )
}
