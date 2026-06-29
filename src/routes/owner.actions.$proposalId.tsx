import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import {
  createEmptyContactFollowUpSourceState,
  readContactFollowUpReconstruction,
  type ContactFollowUpProposalId,
  type ContactFollowUpReconstruction,
  type ContactFollowUpSourceState,
} from '@/modules/protected-action/public'
import {
  approveCurrentOwnerContactFollowUpServer,
  readCurrentOwnerContactFollowUpDetailServer,
  rejectCurrentOwnerContactFollowUpServer,
  type OwnerContactFollowUpDetailServerResult,
  type OwnerContactFollowUpMutationServerResult,
} from '@/modules/protected-action/contact-follow-up.functions'

export type OwnerContactFollowUpDetailRouteInput = {
  state?: ContactFollowUpSourceState
  proposalId: ContactFollowUpProposalId
}

export type OwnerContactFollowUpDetailRouteReadback =
  | {
      kind: 'ok'
      reconstruction: ContactFollowUpReconstruction
    }
  | {
      kind: 'error'
      reason: string
    }

export const Route = createFileRoute('/owner/actions/$proposalId')({
  loader: ({ params }) => readCurrentOwnerContactFollowUpDetailServer({ data: { proposalId: params.proposalId } }),
  head: () => ({
    meta: [
      { title: 'Review contact follow-up | Agentic Economy' },
      { name: 'description', content: 'Owner decision surface for one contact follow-up proposal.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerContactFollowUpDetailRoute,
})

export function readOwnerContactFollowUpDetailRouteReadback(
  input: OwnerContactFollowUpDetailRouteInput
): ContactFollowUpReconstruction {
  return readContactFollowUpReconstruction(input.state ?? createEmptyContactFollowUpSourceState(), input.proposalId)
}

function OwnerContactFollowUpDetailRoute() {
  const initialReadback = ownerContactFollowUpDetailServerToRouteReadback(Route.useLoaderData())
  const location = useLocation()
  const approveContactFollowUp = useServerFn(approveCurrentOwnerContactFollowUpServer)
  const rejectContactFollowUp = useServerFn(rejectCurrentOwnerContactFollowUpServer)
  const [readback, setReadback] = useState(initialReadback)
  const [hydrated, setHydrated] = useState(false)
  const [consequenceAccepted, setConsequenceAccepted] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | undefined>()
  const [actionMessage, setActionMessage] = useState<string | undefined>()
  const [actionError, setActionError] = useState<string | undefined>(readback.kind === 'error' ? readback.reason : undefined)
  const consequenceRef = useRef<HTMLInputElement>(null)
  const rejectReasonRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setHydrated(true)
  }, [])

  if (location.pathname.endsWith('/receipt')) {
    return <Outlet />
  }

  async function handleApprove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionMessage(undefined)
    setActionError(undefined)

    if (readback.kind !== 'ok') {
      setActionError(readback.reason)
      return
    }

    if (!consequenceAccepted) {
      setActionError('Consequence acknowledgement is required before approval.')
      requestAnimationFrame(() => consequenceRef.current?.focus())
      return
    }

    setPendingAction('approve')
    try {
      const result = await approveContactFollowUp({
        data: {
          proposalId: readback.reconstruction.proposal.id,
          reason: 'Owner acknowledged the contact follow-up consequence.',
          evidenceRefs: ['owner-ui:consequence-acknowledged'],
          consequenceAccepted,
        },
      })
      handleMutationResult(result, 'Contact follow-up approved and source readback recorded.')
    } finally {
      setPendingAction(undefined)
    }
  }

  async function handleReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionMessage(undefined)
    setActionError(undefined)

    if (readback.kind !== 'ok') {
      setActionError(readback.reason)
      return
    }

    const reason = rejectReason.trim().replace(/\s+/g, ' ')
    if (reason.length === 0) {
      setActionError('Reject reason is required.')
      requestAnimationFrame(() => rejectReasonRef.current?.focus())
      return
    }

    setPendingAction('reject')
    try {
      const result = await rejectContactFollowUp({
        data: {
          proposalId: readback.reconstruction.proposal.id,
          reason,
          evidenceRefs: ['owner-ui:reject-reason'],
          consequenceAccepted: false,
        },
      })
      handleMutationResult(result, 'Contact follow-up rejected. No gateway or attempt was recorded.')
      if (result.kind === 'ok') {
        setRejectReason('')
      }
    } finally {
      setPendingAction(undefined)
    }
  }

  function handleMutationResult(result: OwnerContactFollowUpMutationServerResult, message: string) {
    if (result.kind === 'ok') {
      setReadback({ kind: 'ok', reconstruction: result.reconstruction })
      setActionMessage(message)
      return
    }

    setActionError(result.reason)
  }

  if (readback.kind === 'error') {
    return (
      <AePublicShell>
        <AePageHeader
          eyebrow="Owner decision"
          title="Review contact follow-up"
          description="Approve or reject one contact follow-up request after reviewing source-owned consequence details."
        />
        <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
          <Alert>
            <AlertTitle>Contact follow-up unavailable</AlertTitle>
            <AlertDescription>{readback.reason}</AlertDescription>
          </Alert>
        </section>
      </AePublicShell>
    )
  }
  const reconstruction = readback.reconstruction
  const decisionDisabledReason = ownerDecisionDisabledReason(reconstruction)
  const canDecide = decisionDisabledReason === undefined

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Owner decision"
        title="Review contact follow-up"
        description="Approve or reject one contact follow-up request after reviewing target, deadline, consequence, reversibility, and proof requirement."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{reconstruction.readbackStatus.replaceAll('_', ' ')}</Badge>
              <Badge variant="outline">{reconstruction.proposal.selectedActionSlug}</Badge>
            </div>
            <CardTitle>{reconstruction.proposal.parameters.contactName}</CardTitle>
            <CardDescription>{reconstruction.proposal.parameters.messageSummary}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <FactGrid
              facts={[
                { label: 'Target source message', value: reconstruction.proposal.parameters.sourceMessageRef },
                { label: 'Allowed channel', value: reconstruction.proposal.parameters.contactChannel },
                { label: 'Deadline', value: new Date(reconstruction.proposal.deadlineAt).toISOString() },
                { label: 'Proof expectation', value: reconstruction.proposal.proofExpectation.replaceAll('_', ' ') },
                { label: 'Reversibility', value: reconstruction.proposal.reversibility.replaceAll('_', ' ') },
                { label: 'Correlation', value: reconstruction.proposal.correlationId },
              ]}
            />
            <Alert>
              <AlertTitle>Consequence before approval</AlertTitle>
              <AlertDescription>
                Approval records one contact follow-up attempt through the source-owned follow-up outbox. It does not book work, charge money, guarantee response, or authorize future actions.
              </AlertDescription>
            </Alert>
            {actionMessage === undefined ? null : (
              <Alert>
                <AlertTitle>Source state updated</AlertTitle>
                <AlertDescription>{actionMessage}</AlertDescription>
              </Alert>
            )}
            {actionError === undefined || actionError === 'Reject reason is required.' ? null : (
              <Alert>
                <AlertTitle>Decision needs attention</AlertTitle>
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}
            {decisionDisabledReason === undefined ? null : (
              <Alert>
                <AlertTitle>Owner decision disabled</AlertTitle>
                <AlertDescription>{decisionDisabledReason}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <form onSubmit={handleApprove} className="grid gap-3 rounded-md border bg-muted/20 p-4" noValidate>
                <FieldGroup>
                  <Field>
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        ref={consequenceRef}
                        type="checkbox"
                        checked={consequenceAccepted}
                        onChange={(event) => setConsequenceAccepted(event.currentTarget.checked)}
                        className="mt-1 size-4"
                      />
                      <span>
                        I understand this approves one contact follow-up attempt for this proposal only, with source-owned receipt or proof-gap readback.
                      </span>
                    </label>
                    <FieldDescription>No future action, booking, payment, or autonomous execution is authorized.</FieldDescription>
                  </Field>
                </FieldGroup>
                <Button
                  disabled={!hydrated || !canDecide || pendingAction !== undefined}
                  type="submit"
                >
                  {pendingAction === 'approve' ? 'Approving...' : 'Approve contact follow-up'}
                </Button>
              </form>
              <form onSubmit={handleReject} className="grid gap-3 rounded-md border bg-muted/20 p-4" noValidate>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="contact-follow-up-reject-reason">Reject reason</FieldLabel>
                    <Textarea
                      ref={rejectReasonRef}
                      id="contact-follow-up-reject-reason"
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.currentTarget.value)}
                      aria-invalid={actionError === 'Reject reason is required.'}
                    />
                    <FieldDescription>Rejection records owner decision and audit state without creating a gateway or attempt.</FieldDescription>
                    {actionError === 'Reject reason is required.' ? <FieldError>{actionError}</FieldError> : null}
                  </Field>
                </FieldGroup>
                <Button
                  variant="outline"
                  disabled={!hydrated || !canDecide || pendingAction !== undefined}
                  type="submit"
                >
                  {pendingAction === 'reject' ? 'Rejecting...' : 'Reject contact follow-up'}
                </Button>
              </form>
            </div>
            <Button asChild variant="outline">
              <a href={`/owner/actions/${encodeURIComponent(reconstruction.proposal.id)}/receipt`}>Open receipt readback</a>
            </Button>
          </CardContent>
        </Card>
      </section>
    </AePublicShell>
  )
}

function ownerDecisionDisabledReason(reconstruction: ContactFollowUpReconstruction): string | undefined {
  if (reconstruction.ownerDecision !== undefined) {
    return 'This proposal already has an owner decision recorded in source state.'
  }

  if (reconstruction.policy === undefined) {
    return 'Policy readback is required before an owner decision can be recorded.'
  }

  if (reconstruction.policy.kind === 'expired') {
    return 'This contact follow-up request is stale because its approval deadline has expired.'
  }

  if (reconstruction.policy.kind !== 'review_required' && reconstruction.policy.kind !== 'time_bound') {
    return `This contact follow-up request is policy-refused: ${reconstruction.policy.reason}.`
  }

  return undefined
}

export function ownerContactFollowUpDetailServerToRouteReadback(
  result: OwnerContactFollowUpDetailServerResult
): OwnerContactFollowUpDetailRouteReadback {
  if (result.kind === 'ok') {
    return { kind: 'ok', reconstruction: result.reconstruction }
  }

  return { kind: 'error', reason: result.reason }
}

function FactGrid({ facts }: { facts: readonly { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {facts.map((fact) => (
        <div key={`${fact.label}:${fact.value}`} className="rounded-lg border bg-muted/30 p-3">
          <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{fact.label}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
