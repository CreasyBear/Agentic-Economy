import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  createEmptyBusinessActionSourceState,
  verifyActionReceipt,
  type ActionReceipt,
  type AuthorizationCheckpoint,
  type BusinessActionNoRepairRecord,
  type BusinessActionResultArtifactStatus,
  type BusinessActionSourceState,
  type BusinessActionSupportRecord,
  type CapabilityRequest,
  type PublicActionReceiptReadback,
  type ReceiptReconstructionStatus,
} from '@/modules/business-action/public'
import {
  readCurrentOwnerBusinessActionQueueServer,
  type OwnerBusinessActionSourceStateServerResult,
} from '@/modules/business-action/business-action.functions'
import type { BusinessId, CapabilityRequestId, OwnerId } from '@/modules/common/ids'

export type OwnerBusinessActionRouteInput = {
  state?: BusinessActionSourceState
  ownerId?: OwnerId
  businessId?: BusinessId
}

export type OwnerBusinessActionDetailRouteInput = {
  state?: BusinessActionSourceState
  requestId: CapabilityRequestId
  ownerId?: OwnerId
}

export type OwnerBusinessActionResultArtifactState = {
  endpointDescriptor: 'present' | 'missing'
  jsonSchema: 'present' | 'missing'
  privateEndpointRef: 'redacted_present' | 'missing'
  status: BusinessActionResultArtifactStatus | 'missing'
  proofGapReason?: string
}

export type OwnerBusinessActionRouteQueueItem = {
  requestId: CapabilityRequestId
  actionSlug: CapabilityRequest['actionSlug']
  businessId: BusinessId
  requestStatus: CapabilityRequest['status']
  checkpointDecision: AuthorizationCheckpoint['decision'] | 'missing'
  receiptOutcome: ActionReceipt['outcome'] | 'missing'
  reconstructionStatus: ReceiptReconstructionStatus | 'missing'
  requestedBy: CapabilityRequest['requestedBy']
  expiresAt: number
}

export type OwnerBusinessActionRouteReconstruction = {
  request: CapabilityRequest
  checkpoint?: AuthorizationCheckpoint
  receipt?: ActionReceipt
  publicReadback?: PublicActionReceiptReadback
  resultArtifactState: OwnerBusinessActionResultArtifactState
  guardrailDecisionCount: number
  externalEvidenceEventCount: number
  privateEvidenceRefCount: number
  supportRecords: readonly BusinessActionSupportRecord[]
  noRepair?: BusinessActionNoRepairRecord
}

export type OwnerBusinessActionRouteReadback = {
  unavailableReason?: string
  queue: readonly OwnerBusinessActionRouteQueueItem[]
  reconstructions: readonly OwnerBusinessActionRouteReconstruction[]
}

export type OwnerBusinessActionDetailRouteReadback =
  | {
      kind: 'ok'
      reconstruction: OwnerBusinessActionRouteReconstruction
    }
  | {
      kind: 'not_found'
      reason: 'business_action_owner_readback_not_found'
    }
  | {
      kind: 'error'
      reason: string
    }

export const Route = createFileRoute('/owner/business-actions')({
  loader: () => readCurrentOwnerBusinessActionQueueServer(),
  head: () => ({
    meta: [
      { title: 'Business action requests | Agentic Economy' },
      {
        name: 'description',
        content: 'Owner business-action checkpoint and receipt readbacks from source-owned request state.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerBusinessActionsRoute,
})

export function readOwnerBusinessActionRouteReadback(
  input: OwnerBusinessActionRouteInput = {}
): OwnerBusinessActionRouteReadback {
  const state = input.state ?? createEmptyBusinessActionSourceState()
  const requests = state.requests.filter((request) => ownerCanReadRequest(request, input.ownerId, input.businessId))
  const reconstructions = requests.map((request) => buildOwnerBusinessActionRouteReconstruction(state, request))

  return {
    queue: reconstructions.map((reconstruction) => ({
      requestId: reconstruction.request.id,
      actionSlug: reconstruction.request.actionSlug,
      businessId: reconstruction.request.businessId,
      requestStatus: reconstruction.request.status,
      checkpointDecision: reconstruction.checkpoint?.decision ?? 'missing',
      receiptOutcome: reconstruction.receipt?.outcome ?? 'missing',
      reconstructionStatus: reconstruction.publicReadback?.reconstructionStatus ?? reconstruction.receipt?.reconstructionStatus ?? 'missing',
      requestedBy: reconstruction.request.requestedBy,
      expiresAt: reconstruction.request.expiresAt,
    })),
    reconstructions,
  }
}

export function readOwnerBusinessActionDetailRouteReadback(
  input: OwnerBusinessActionDetailRouteInput
): OwnerBusinessActionDetailRouteReadback {
  const state = input.state ?? createEmptyBusinessActionSourceState()
  const request = state.requests.find((candidate) => candidate.id === input.requestId)
  if (request === undefined || !ownerCanReadRequest(request, input.ownerId)) {
    return { kind: 'not_found', reason: 'business_action_owner_readback_not_found' }
  }

  return {
    kind: 'ok',
    reconstruction: buildOwnerBusinessActionRouteReconstruction(state, request),
  }
}

export function ownerBusinessActionQueueServerToRouteReadback(
  result: OwnerBusinessActionSourceStateServerResult
): OwnerBusinessActionRouteReadback {
  if (result.kind === 'ok') {
    return readOwnerBusinessActionRouteReadback({ state: result.state })
  }

  return {
    unavailableReason: result.reason,
    queue: [],
    reconstructions: [],
  }
}

export function ownerBusinessActionDetailServerToRouteReadback(
  result: OwnerBusinessActionSourceStateServerResult,
  requestId: CapabilityRequestId
): OwnerBusinessActionDetailRouteReadback {
  if (result.kind === 'ok') {
    return readOwnerBusinessActionDetailRouteReadback({ state: result.state, requestId })
  }

  return {
    kind: 'error',
    reason: result.reason,
  }
}

export function buildOwnerBusinessActionRouteReconstruction(
  state: BusinessActionSourceState,
  request: CapabilityRequest
): OwnerBusinessActionRouteReconstruction {
  const checkpoint = latestByRecordedAt(
    state.checkpoints.filter((candidate) => candidate.requestId === request.id),
    (candidate) => candidate.decidedAt
  )
  const receipt = latestByRecordedAt(
    state.receipts.filter((candidate) => candidate.requestId === request.id),
    (candidate) => candidate.recordedAt
  )
  const resultArtifact = latestByRecordedAt(
    state.resultArtifacts.filter((candidate) => candidate.requestId === request.id),
    (candidate) => candidate.recordedAt
  )
  const publicReadback = receipt === undefined ? undefined : verifyActionReceipt(state, receipt).publicReadback
  const privateEvidenceRefCount = state.privateEvidenceRefs.filter((candidate) => candidate.requestId === request.id).length
  const supportRecords = state.supportRecords.filter((candidate) => candidate.businessId === request.businessId)
  const noRepair = latestByRecordedAt(
    state.noRepairRecords.filter((candidate) => candidate.requestId === request.id),
    (candidate) => candidate.markedAt
  )

  return {
    request,
    ...(checkpoint === undefined ? {} : { checkpoint }),
    ...(receipt === undefined ? {} : { receipt }),
    ...(publicReadback === undefined ? {} : { publicReadback }),
    resultArtifactState: {
      endpointDescriptor: resultArtifact?.endpointDescriptorHash === undefined ? 'missing' : 'present',
      jsonSchema: resultArtifact?.jsonSchemaHash === undefined ? 'missing' : 'present',
      privateEndpointRef:
        resultArtifact?.privateEndpointProvisioningPaymentGateRefHash === undefined ? 'missing' : 'redacted_present',
      status: resultArtifact?.status ?? 'missing',
      ...(resultArtifact?.proofGapReason === undefined ? {} : { proofGapReason: resultArtifact.proofGapReason }),
    },
    guardrailDecisionCount: state.guardrailDecisions.filter((candidate) => candidate.requestId === request.id).length,
    externalEvidenceEventCount: state.externalEvidenceEvents.filter((candidate) => candidate.requestId === request.id).length,
    privateEvidenceRefCount,
    supportRecords,
    ...(noRepair === undefined ? {} : { noRepair }),
  }
}

function OwnerBusinessActionsRoute() {
  const location = useLocation()
  const readback = ownerBusinessActionQueueServerToRouteReadback(Route.useLoaderData())

  if (location.pathname !== '/owner/business-actions') {
    return <Outlet />
  }

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Owner checkpoint"
        title="Business action requests need source-owned authorization."
        description="Every request stays proposal-only until the owner checkpoint records accepted, refused, clarification, proof-gap, or expired source state."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <Alert>
          <AlertTitle>source/local proof only</AlertTitle>
          <AlertDescription>
            production proof not claimed. This queue is for local receipt inspection and does not publish a callable, payment, wallet, marketplace, or autonomous execution claim.
          </AlertDescription>
        </Alert>
        {readback.unavailableReason === undefined ? null : (
          <Alert>
            <AlertTitle>Business action source unavailable</AlertTitle>
            <AlertDescription>{readback.unavailableReason}</AlertDescription>
          </Alert>
        )}
        <OwnerBusinessActionQueue queue={readback.queue} />
      </section>
    </AePublicShell>
  )
}

function OwnerBusinessActionQueue({ queue }: { queue: readonly OwnerBusinessActionRouteQueueItem[] }) {
  if (queue.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No business action requests</CardTitle>
          <CardDescription>Source-owned capability requests appear here after a mandate and card produce a local request row.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      {queue.map((item) => (
        <Card key={item.requestId}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{item.requestStatus.replaceAll('_', ' ')}</Badge>
              <Badge variant="outline">{item.checkpointDecision.replaceAll('_', ' ')}</Badge>
            </div>
            <CardTitle className="break-words text-lg">{item.requestId}</CardTitle>
            <CardDescription>{item.actionSlug}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <FactGrid
              facts={[
                { label: 'Requested by', value: item.requestedBy },
                { label: 'Business', value: item.businessId },
                { label: 'Receipt', value: item.receiptOutcome.replaceAll('_', ' ') },
                { label: 'Reconstruction', value: item.reconstructionStatus.replaceAll('_', ' ') },
                { label: 'Expires', value: new Date(item.expiresAt).toISOString() },
              ]}
            />
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline" size="sm">
                <a href={`/owner/business-actions/${encodeURIComponent(item.requestId)}`}>Review checkpoint</a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/owner/business-actions/${encodeURIComponent(item.requestId)}/receipt`}>Open receipt</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function FactGrid({ facts }: { facts: readonly { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {facts.map((fact) => (
        <div key={`${fact.label}:${fact.value}`} className="rounded-md border bg-muted/30 p-3">
          <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{fact.label}</dt>
          <dd className="mt-1 break-words text-sm text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ownerCanReadRequest(
  request: CapabilityRequest,
  ownerId: OwnerId | undefined,
  businessId?: BusinessId
): boolean {
  if (businessId !== undefined && request.businessId !== businessId) {
    return false
  }

  return ownerId === undefined ? request.ownerId !== undefined : request.ownerId === ownerId
}

function latestByRecordedAt<T>(items: readonly T[], getTime: (item: T) => number): T | undefined {
  return [...items].sort((left, right) => getTime(left) - getTime(right)).at(-1)
}
