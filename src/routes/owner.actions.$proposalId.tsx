import { useRef, useState, type FormEvent } from 'react'
import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Banner } from '@astryxdesign/core/Banner'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { formatTimestamp } from '@/lib/ui/format-time'
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
import { useClientMounted } from '@/hooks/use-client-mounted'

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
  ...operatorRouteOptions,
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
  const hydrated = useClientMounted()
  const [consequenceAccepted, setConsequenceAccepted] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | undefined>()
  const [actionMessage, setActionMessage] = useState<string | undefined>()
  const [actionError, setActionError] = useState<string | undefined>(readback.kind === 'error' ? readback.reason : undefined)
  const consequenceRef = useRef<HTMLInputElement>(null)
  const rejectReasonRef = useRef<HTMLTextAreaElement>(null)


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
      handleMutationResult(result, 'Contact follow-up approved and recorded.')
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
      handleMutationResult(result, 'Contact follow-up rejected. No approval or attempt was recorded.')
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
      <AeOperatorShell
        operatorRole="owner"
        eyebrow="Owner decision"
        title="Review contact follow-up"
        description="Approve or reject one contact follow-up request after reviewing the consequence details."
        currentPath="/owner/actions"
      >
        <Banner status="warning" title="Contact follow-up unavailable" description={readback.reason} />
      </AeOperatorShell>
    )
  }
  const reconstruction = readback.reconstruction
  const decisionDisabledReason = ownerDecisionDisabledReason(reconstruction)
  const canDecide = decisionDisabledReason === undefined
  const consequenceInvalid = actionError === 'Consequence acknowledgement is required before approval.'
  const rejectInvalid = actionError === 'Reject reason is required.'


  return (
    <AeOperatorShell
      operatorRole="owner"
      eyebrow="Owner decision"
      title="Review contact follow-up"
      description="Approve or reject one contact follow-up request after reviewing target, deadline, consequence, reversibility, and proof requirement."
      currentPath="/owner/actions"
    >
      <Card padding={3}>
          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral" label={humanizeStatusValue(reconstruction.readbackStatus)} />
              <Badge variant="neutral" label={reconstruction.proposal.selectedActionSlug} />
            </div>
            <Text as="div" type="large" weight="semibold" color="primary" display="block">{reconstruction.proposal.parameters.contactName}</Text>
            <Text as="div" type="supporting" color="secondary" display="block">{reconstruction.proposal.parameters.messageSummary}</Text>
          </div>
          <div className="grid gap-5">
            <AeOperatorFactGrid
              facts={[
                { label: 'Target source message', value: reconstruction.proposal.parameters.sourceMessageRef },
                { label: 'Allowed channel', value: reconstruction.proposal.parameters.contactChannel },
                { label: 'Deadline', value: formatTimestamp(reconstruction.proposal.deadlineAt) },
                { label: 'Proof expectation', value: humanizeStatusValue(reconstruction.proposal.proofExpectation) },
                { label: 'Reversibility', value: humanizeStatusValue(reconstruction.proposal.reversibility) },
                { label: 'Correlation', value: reconstruction.proposal.correlationId },
              ]}
            />
            <Banner
              status="info"
              title="Consequence before approval"
              description="Approval records one contact follow-up attempt. It does not book work, charge money, guarantee response, or authorize future actions."
            />
            {actionMessage === undefined ? null : (
              <Banner status="success" title="Source state updated" description={actionMessage} />
            )}
            {actionError === undefined || consequenceInvalid || rejectInvalid ? null : (
              <Banner status="error" title="Decision needs attention" description={actionError} />
            )}
            {decisionDisabledReason === undefined ? null : (
              <Banner status="warning" title="Owner decision disabled" description={decisionDisabledReason} />
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <form onSubmit={handleApprove} className="grid gap-3 rounded-md border bg-muted/20 p-4" noValidate>
                <CheckboxInput
                  ref={consequenceRef}
                  label="I understand this approves one contact follow-up attempt for this proposal only. AE will record a receipt, or a note that evidence is missing."
                  description="No future action, booking, payment, or autonomous execution is authorized."
                  value={consequenceAccepted}
                  onChange={setConsequenceAccepted}
                  {...(consequenceInvalid ? { status: { type: 'error' as const, message: actionError } } : {})}
                  isDisabled={!canDecide || pendingAction !== undefined}
                />
                <Button
                  isDisabled={!hydrated || !canDecide || pendingAction !== undefined}
                  type="submit"
                  label={pendingAction === 'approve' ? 'Approving...' : 'Approve contact follow-up'}
                />
              </form>
              <form onSubmit={handleReject} className="grid gap-3 rounded-md border bg-muted/20 p-4" noValidate>
                <TextArea
                  ref={rejectReasonRef}
                  label="Reject reason"
                  description="Rejection records the owner decision without creating an approval or an attempt."
                  value={rejectReason}
                  onChange={setRejectReason}
                  {...(rejectInvalid ? { status: { type: 'error' as const, message: actionError } } : {})}
                  isDisabled={!canDecide || pendingAction !== undefined}
                />
                <Button
                  variant="secondary"
                  isDisabled={!hydrated || !canDecide || pendingAction !== undefined}
                  type="submit"
                  label={pendingAction === 'reject' ? 'Rejecting...' : 'Reject contact follow-up'}
                />
              </form>
            </div>
            <Button
              href={`/owner/actions/${encodeURIComponent(reconstruction.proposal.id)}/receipt`}
              variant="secondary"
              label="Open receipt"
            />
          </div>
        </Card>
    </AeOperatorShell>
  )
}

function ownerDecisionDisabledReason(reconstruction: ContactFollowUpReconstruction): string | undefined {
  if (reconstruction.ownerDecision !== undefined) {
    return 'This proposal already has an owner decision recorded in source state.'
  }

  if (reconstruction.policy === undefined) {
    return 'Policy review is required before an owner decision can be recorded.'
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

function humanizeStatusValue(value: string): string {
  if (value === 'source_owned_receipt_or_gap') {
    return 'receipt or evidence-missing note'
  }

  return value
    .replaceAll('_', ' ')
    .replace(/\bproof gap\b/gi, 'evidence missing')
    .replace(/\bgateway admitted\b/gi, 'approved')
    .replace(/\s+/g, ' ')
    .trim()
}
