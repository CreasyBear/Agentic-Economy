import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AeOperatorQueueList } from '@/components/ae/operator/AeOperatorQueueList'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Banner } from '@astryxdesign/core/Banner'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { formatTimestamp } from '@/lib/ui/format-time'
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

export const Route = createFileRoute('/_operator/owner/business-actions')({
  ...operatorRouteOptions,
  loader: () => readCurrentOwnerBusinessActionQueueServer(),
  head: () => ({
    meta: [
      { title: 'Business action requests | Agentic Economy' },
      {
        name: 'description',
        content: 'Owner business-action checkpoint and receipt status for your requests.',
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
    <AeOperatorShell
      operatorRole="owner"
      eyebrow="Owner checkpoint"
      title="Business action requests need owner authorization."
      description="Every request stays proposal-only until you record a decision — accepted, refused, needs clarification, evidence missing, or expired."
      currentPath="/owner/business-actions"
      navBadges={{ '/owner/business-actions': readback.queue.length }}
    >
      <div className="grid gap-6">
        <Banner
          status="info"
          title="Local proof only"
          description="Production proof is not claimed. This queue is for local receipt inspection and owner review only."
        />
        {readback.unavailableReason === undefined ? null : (
          <Banner
            status="warning"
            title="Business action source unavailable"
            description={readback.unavailableReason}
          />
        )}
        <OwnerBusinessActionQueue queue={readback.queue} />
      </div>
    </AeOperatorShell>
  )
}

function OwnerBusinessActionQueue({ queue }: { queue: readonly OwnerBusinessActionRouteQueueItem[] }) {
  return (
    <AeOperatorQueueList
      scroll
      rows={queue.map((item) => ({
        id: item.requestId,
        href: `/owner/business-actions/${encodeURIComponent(item.requestId)}`,
        badges: [
          { label: humanizeStatusValue(item.requestStatus) },
          { label: humanizeStatusValue(item.checkpointDecision), variant: 'outline' as const },
        ],
        title: `${humanizeActionSlug(item.actionSlug)} — ${item.businessId}`,
        facts: [
          { label: 'Request ID', value: item.requestId },
          { label: 'Requested by', value: item.requestedBy },
          { label: 'Receipt', value: humanizeStatusValue(item.receiptOutcome) },
          { label: 'Evidence status', value: humanizeStatusValue(item.reconstructionStatus) },
          { label: 'Expires', value: formatTimestamp(item.expiresAt) },
        ],
        actions: [
          {
            label: 'Open receipt',
            href: `/owner/business-actions/${encodeURIComponent(item.requestId)}/receipt`,
            variant: 'secondary',
          },
        ],
      }))}
      emptyTitle="No business action requests"
      emptyDescription="Capability requests appear here after a mandate and card produce a local request row."
    />
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

function humanizeStatusValue(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\bproof gap\b/gi, 'evidence missing')
    .replace(/\bgateway admitted\b/gi, 'approved')
    .replace(/\s+/g, ' ')
    .trim()
}

function humanizeActionSlug(slug: string): string {
  const spaced = slug.replaceAll(/[-_]/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
