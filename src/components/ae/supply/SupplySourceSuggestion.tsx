import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { OwnerSupplySourceAssessmentInput } from '@/modules/capability-supply/source-first-owner'
import type { SupplySourceAssessment } from '@/modules/capability-supply/source-first-owner'
import type { SupplyNativeStartProps } from './supply-source-native-start-presentation'

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

  return <div className="grid gap-intra" aria-label="Source description suggestion">
    <p className="text-sm text-muted-foreground">Choose useful wording from your source with Jev. Review it before using it.</p>
    {'suggestion' in review ? <>
      <p className="whitespace-pre-line rounded-md border border-border p-3 text-sm">{review.suggestion.description}</p>
      <p className="text-xs text-muted-foreground">Copied from the source description and field descriptions. You can edit it before publication.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="min-h-touch" disabled={disabled || review.kind === 'verifying'} onClick={() => void assess('verify')}>
          {review.kind === 'verifying' ? 'Checking source…' : 'Use description'}
        </Button>
        <Button type="button" variant="ghost" className="min-h-touch" disabled={disabled || review.kind === 'verifying'} onClick={() => setReview({ kind: 'idle' })}>Keep current description</Button>
      </div>
    </> : <>
      {review.kind === 'unavailable' ? <p role="status" className="text-sm text-muted-foreground">No current suggestion is available. Keep editing your description, or try again.</p> : null}
      <Button type="button" variant="outline" className="min-h-touch justify-self-start" disabled={disabled || review.kind === 'loading'} onClick={() => void assess('suggest')}>
        {review.kind === 'loading' ? 'Reading source…' : 'Suggest from source'}
      </Button>
    </>}
  </div>
}
