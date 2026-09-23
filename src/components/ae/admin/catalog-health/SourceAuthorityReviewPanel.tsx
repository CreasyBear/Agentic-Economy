import { useState, type FormEvent } from 'react'
import { useServerFn } from '@tanstack/react-start'

import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { degrade } from '@/lib/observability/degrade'
import {
  reviewSourceAuthorityServer,
  type SourceAuthorityReviewResult,
} from '@/modules/capability-supply/source-authority-review.functions'

import type { SourceAuthorityReviewPanelProps } from './catalog-health.contracts'

export function SourceAuthorityReviewPanel({ review }: SourceAuthorityReviewPanelProps) {
  const confirmReview = useServerFn(reviewSourceAuthorityServer)
  const [evidenceRef, setEvidenceRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<SourceAuthorityReviewResult>()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || evidenceRef.trim().length === 0) return
    setBusy(true)
    setOutcome(undefined)
    try {
      setOutcome(await confirmReview({ data: {
        publicationRef: review.publicationRef,
        expectedRevision: review.expectedRevision,
        expectedSourceDigest: review.expectedSourceDigest,
        evidenceRef: evidenceRef.trim(),
      } }))
    } catch (cause) {
      setOutcome(degrade(cause, { kind: 'error', code: 'source_unavailable' }, {
        site: 'reviewSourceAuthorityConfirm',
        reason: 'source_unavailable',
      }))
    } finally {
      setBusy(false)
    }
  }

  const presentation = outcome === undefined ? undefined : reviewOutcomePresentation(outcome)
  return (
    <AeSection
      title="Review source authority"
      description="Confirm this exact publication only after independently verifying that the Provider controls the source."
    >
      <div className="grid gap-4">
        <dl className="grid gap-2 text-sm">
          <div className="grid gap-1">
            <dt className="font-medium text-foreground">Source</dt>
            <dd className="break-all text-muted-foreground">
              {review.sourceKind.replace('_', ' ')} · {review.sourceUrl}
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="font-medium text-foreground">Source digest</dt>
            <dd><code className="break-all text-xs text-muted-foreground">{review.expectedSourceDigest}</code></dd>
          </div>
          <div className="grid gap-1">
            <dt className="font-medium text-foreground">Publication</dt>
            <dd><code className="break-all text-xs text-muted-foreground">{review.publicationRef} · revision {review.expectedRevision}</code></dd>
          </div>
          <div className="grid gap-1">
            <dt className="font-medium text-foreground">Tool reference</dt>
            <dd><code className="break-all text-xs text-muted-foreground">{review.operationRef}</code></dd>
          </div>
        </dl>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="source-authority-evidence">Authority evidence reference</Label>
            <Input
              id="source-authority-evidence"
              value={evidenceRef}
              maxLength={500}
              autoComplete="off"
              placeholder="Review ticket or independently verified evidence"
              onChange={(event) => setEvidenceRef(event.currentTarget.value)}
            />
          </div>
          <Button type="submit" disabled={busy || evidenceRef.trim().length === 0}>
            {busy ? 'Confirming…' : 'Confirm source authority'}
          </Button>
        </form>
        {presentation === undefined ? null : (
          <Alert role={presentation.success ? 'status' : 'alert'} variant={presentation.success ? 'default' : 'destructive'}>
            <AlertTitle>{presentation.title}</AlertTitle>
            <AlertDescription>{presentation.description}</AlertDescription>
          </Alert>
        )}
      </div>
    </AeSection>
  )
}

function reviewOutcomePresentation(result: SourceAuthorityReviewResult): Readonly<{
  success: boolean
  title: string
  description: string
}> {
  if (result.kind === 'error') {
    return {
      success: false,
      title: 'Review outcome not confirmed',
      description: 'No approval can be claimed. Reload this page to reread the current source state before trying again.',
    }
  }
  if (result.kind === 'refused') {
    if (result.code === 'missing_membership' || result.code === 'action_not_allowed') {
      return {
        success: false,
        title: 'No source authority changed',
        description: 'Ask an active AE reviewer to open this link and complete the review.',
      }
    }
    if (result.code === 'mfa_reverification_required') {
      return {
        success: false,
        title: 'Reverification required',
        description: 'Verify your identity again before confirming source authority.',
      }
    }
    return {
      success: false,
      title: 'No source authority changed',
      description: 'Return to the release task and rerun source preview to receive a current review link.',
    }
  }
  return {
    success: result.kind === 'completed',
    title: result.kind === 'completed' ? 'Source authority confirmed' : 'Review pending',
    description: result.kind === 'completed'
      ? 'The exact publication is verified. Return to the release task and rerun the same Package 5 release task; it will resume from authoritative state.'
      : 'This review needs another administrator.',
  }
}
