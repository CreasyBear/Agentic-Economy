import { useEffect, useRef, useState } from 'react'
import { DecisionPanel } from '@/components/arc/chat/DecisionPanel'
import { Button } from '@/components/arc/button/button'
import type { OwnerSupplySourceAssessmentInput } from '@/modules/capability-supply/source-first-owner'
import type { SupplySourceAssessment } from '@/modules/capability-supply/source-first-owner'
import type { SupplyNativeStartProps } from './supply-source-native-start-presentation'
import './SourceCandidatesComposition.css'

type Suggestion = Extract<SupplySourceAssessment, { kind: 'suggested' }>
type ReviewState = { kind: 'idle' | 'loading' | 'unavailable' }
  | { kind: 'suggested' | 'verifying'; suggestion: Suggestion }

/** The parent keys this review by source, candidate and current text: edits cancel stale work. */
export function SupplySourceSuggestion({ input, disabled, onAssess, onUse }: Readonly<{
  input: Omit<OwnerSupplySourceAssessmentInput, 'mode' | 'idempotencyKey'>
  disabled: boolean
  onAssess: NonNullable<SupplyNativeStartProps['onAssess']>
  onUse: (description: string) => void
}>) {
  const [review, setReview] = useState<ReviewState>({ kind: 'idle' })
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])

  async function assess(mode: 'suggest' | 'verify') {
    if (disabled) return
    const suggestion = 'suggestion' in review ? review.suggestion : undefined
    if (mode === 'verify' && suggestion === undefined) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setReview(suggestion && mode === 'verify' ? { kind: 'verifying', suggestion } : { kind: 'loading' })
    try {
      const result = await onAssess({ ...input, mode, idempotencyKey: crypto.randomUUID() }, controller.signal)
      if (controller.signal.aborted) return
      if (result.kind === 'current' && suggestion && mode === 'verify') {
        onUse(suggestion.description)
        setReview({ kind: 'idle' })
      } else if (result.kind === 'suggested' && mode === 'suggest') {
        setReview({ kind: 'suggested', suggestion: result })
      } else setReview({ kind: 'unavailable' })
    } catch (cause) {
      // Transport/authentication errors can include private details; show only the recoverable state.
      void cause
      if (!controller.signal.aborted) setReview({ kind: 'unavailable' })
    }
  }

  return <DecisionPanel aria-label="Source description suggestion" className="arc-source-description-review">
    <p className="arc-source-description-guidance">Choose useful wording from your source with Jev. Review it before using it.</p>
    {'suggestion' in review ? <>
      <p className="arc-source-description-copy">{review.suggestion.description}</p>
      <p className="arc-source-description-guidance">Copied from the source description and field descriptions. You can edit it before publication.</p>
      <div className="arc-source-description-actions">
        <Button type="button" variant="secondary" size="md" disabled={disabled || review.kind === 'verifying'} onClick={() => void assess('verify')}>
          {review.kind === 'verifying' ? 'Checking source…' : 'Use description'}
        </Button>
        <Button type="button" variant="ghost" size="md" disabled={disabled || review.kind === 'verifying'} onClick={() => setReview({ kind: 'idle' })}>Keep current description</Button>
      </div>
    </> : <>
      {review.kind === 'unavailable' ? <p role="status" className="arc-source-description-guidance">No current suggestion is available. Keep editing your description, or try again.</p> : null}
      <Button type="button" variant="secondary" size="md" className="arc-source-description-suggest" disabled={disabled || review.kind === 'loading'} onClick={() => void assess('suggest')}>
        {review.kind === 'loading' ? 'Reading source…' : 'Suggest from source'}
      </Button>
    </>}
  </DecisionPanel>
}
