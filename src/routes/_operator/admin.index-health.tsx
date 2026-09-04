import { useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import {
  reviewSourceAuthorityServer,
  type SourceAuthorityReviewResult,
} from '@/modules/capability-supply/source-authority-review.functions'
import {
  readAdminIndexHealthThroughSource,
} from '@/modules/security/admin-readback.functions'

const readAdminIndexHealthServer = createServerFn().handler(() => readAdminIndexHealthThroughSource())

export const Route = createFileRoute('/_operator/admin/index-health')({
  ...operatorRouteOptions,
  validateSearch: z.object({
    publicationRef: z.string().trim().min(1).max(300).optional(),
    expectedRevision: z.coerce.number().int().positive().optional(),
    expectedSourceDigest: z.string().trim().min(1).max(300).optional(),
    operationRef: z.string().trim().min(1).max(300).optional(),
    sourceKind: z.enum(['openapi', 'mcp', 'agent_plugin', 'x402']).optional(),
    sourceUrl: z.string().url().max(2_048).optional(),
  }),
  loader: async () => ({
    readback: await readAdminIndexHealthServer(),
  }),
  head: () => ({
    meta: [
      { title: 'Catalog health | Agentic Economy' },
      {
        name: 'description',
        content: 'Check catalog and projection readbacks before public discovery files ship.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminIndexHealthRoute,
})

function AdminIndexHealthRoute() {
  const { readback } = Route.useLoaderData()
  const search = Route.useSearch()
  const reviewRequest = search.publicationRef !== undefined
    && search.expectedRevision !== undefined
    && search.expectedSourceDigest !== undefined
    && search.operationRef !== undefined
    && search.sourceKind !== undefined
    && search.sourceUrl !== undefined
    ? {
        publicationRef: search.publicationRef,
        expectedRevision: search.expectedRevision,
        expectedSourceDigest: search.expectedSourceDigest,
        operationRef: search.operationRef,
        sourceKind: search.sourceKind,
        sourceUrl: search.sourceUrl,
      }
    : undefined

  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Catalog health"
      description="Check catalog and projection readbacks before public discovery files are allowed to ship."
      currentPath="/admin/index-health"
      navBadges={{ '/admin/index-health': readback.rows.length }}
    >
      <div className="grid gap-6">
        {reviewRequest === undefined ? null : (
          <SourceAuthorityReviewPanel review={reviewRequest} />
        )}
        <AeAdminReadbackPanel
          title="Catalog readback"
          description="Denied reads return no private rows; authorized reads show source, attempt, repair, and affected public surfaces."
          readback={readback}
        />
      </div>
    </AeOperatorShell>
  )
}

type SourceAuthorityReviewRequest = Readonly<{
  publicationRef: string
  expectedRevision: number
  expectedSourceDigest: string
  operationRef: string
  sourceKind: 'openapi' | 'mcp' | 'agent_plugin' | 'x402'
  sourceUrl: string
}>

export function SourceAuthorityReviewPanel({ review }: { review: SourceAuthorityReviewRequest }) {
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
    } catch {
      setOutcome({ kind: 'error', code: 'source_unavailable' })
    } finally {
      setBusy(false)
    }
  }

  const presentation = outcome === undefined ? undefined : reviewOutcomePresentation(outcome)
  return (
    <AeSection
      title="Review source authority"
      description="Confirm this exact publication only after independently verifying that the Business controls the source."
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
            <dt className="font-medium text-foreground">Operation</dt>
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
    if (result.reason === 'authorization_denied') {
      return {
        success: false,
        title: 'No source authority changed',
        description: 'Ask an active AE reviewer to open this link and complete the review.',
      }
    }
    if (result.reason === 'evidence_invalid') {
      return {
        success: false,
        title: 'No source authority changed',
        description: 'Enter one current evidence reference for the independent source-control check.',
      }
    }
    return {
      success: false,
      title: 'No source authority changed',
      description: 'Return to the release task and rerun source preview to receive a current review link.',
    }
  }
  return {
    success: true,
    title: 'Source authority confirmed',
    description: 'The exact publication is verified. Return to the release task and rerun the same Package 5 release task; it will resume from authoritative state.',
  }
}
