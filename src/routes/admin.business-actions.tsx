import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'

import { AeOperatorFilterCard } from '@/components/ae/operator/AeOperatorFilterCard'
import { AeOperatorQueueList } from '@/components/ae/operator/AeOperatorQueueList'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  BusinessActionPrivateEvidenceRef,
  BusinessActionSourceState,
  ExternalEvidenceEvent,
  GuardrailDecisionEvidence,
} from '@/modules/business-action/public'
import { createEmptyBusinessActionSourceState } from '@/modules/business-action/public'
import {
  readAdminBusinessActionReconstructionServer,
  type AdminBusinessActionSourceStateServerResult,
} from '@/modules/business-action/business-action.functions'
import type { CapabilityRequestId } from '@/modules/common/ids'
import {
  buildOwnerBusinessActionRouteReconstruction,
  type OwnerBusinessActionRouteReconstruction,
} from '@/routes/owner.business-actions'

type AdminBusinessActionSearch = {
  requestId?: string
}

export type AdminBusinessActionsRouteInput = {
  state?: BusinessActionSourceState
  requestId?: CapabilityRequestId
}

export type AdminBusinessActionGuardrailDecisionReadback = Pick<
  GuardrailDecisionEvidence,
  | 'id'
  | 'requestId'
  | 'provider'
  | 'modelName'
  | 'modelVersion'
  | 'decision'
  | 'policyHash'
  | 'decisionHash'
  | 'payloadHash'
  | 'recordedAt'
>

export type AdminBusinessActionExternalEvidenceReadback = Pick<
  ExternalEvidenceEvent,
  | 'id'
  | 'requestId'
  | 'checkpointId'
  | 'provider'
  | 'status'
  | 'providerRefHash'
  | 'payloadHash'
  | 'idempotencyKey'
  | 'correlationId'
  | 'receivedAt'
  | 'amountCents'
  | 'currency'
  | 'reason'
> & {
  evidenceKind?: string
}

export type AdminBusinessActionPrivateEvidenceMetadata = {
  count: number
  refs: ReadonlyArray<
    Pick<
      BusinessActionPrivateEvidenceRef,
      'id' | 'requestId' | 'retentionClass' | 'accessPolicy' | 'payloadHash' | 'ttlExpiresAt' | 'redactedAt'
    >
  >
}

export type AdminBusinessActionRouteReconstruction = OwnerBusinessActionRouteReconstruction & {
  guardrailDecisions: readonly AdminBusinessActionGuardrailDecisionReadback[]
  externalEvidenceEvents: readonly AdminBusinessActionExternalEvidenceReadback[]
  privateEvidenceMetadata: AdminBusinessActionPrivateEvidenceMetadata
}

export type AdminBusinessActionRouteReadback = {
  deniedReason?: string
  rows: readonly AdminBusinessActionRouteReconstruction[]
}

export type AdminBusinessActionDetailRouteReadback =
  | {
      kind: 'ok'
      reconstruction: AdminBusinessActionRouteReconstruction
    }
  | {
      kind: 'not_found'
      reason: 'business_action_admin_readback_not_found'
    }

export const Route = createFileRoute('/admin/business-actions')({
  validateSearch: (search: Record<string, unknown>): AdminBusinessActionSearch => {
    const requestId = typeof search.requestId === 'string' && search.requestId.trim().length > 0 ? search.requestId.trim() : undefined
    return requestId === undefined ? {} : { requestId }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readAdminBusinessActionReconstructionServer({ data: compactAdminSearch(deps) }),
  head: () => ({
    meta: [
      { title: 'Business action reconstruction | Agentic Economy' },
      {
        name: 'description',
        content: 'Operator reconstruction for source-local business action requests, checkpoints, evidence, artifacts, and receipts.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminBusinessActionsRoute,
})

export function readAdminBusinessActionsRouteReadback(
  input: AdminBusinessActionsRouteInput = {}
): AdminBusinessActionRouteReadback {
  const state = input.state ?? createEmptyBusinessActionSourceState()
  const requests = input.requestId === undefined
    ? state.requests
    : state.requests.filter((request) => request.id === input.requestId)

  return {
    rows: requests.map((request) => buildAdminBusinessActionRouteReconstruction(state, request.id)),
  }
}

export function adminBusinessActionServerToRouteReadback(
  result: AdminBusinessActionSourceStateServerResult,
  requestId?: CapabilityRequestId
): AdminBusinessActionRouteReadback {
  if (result.kind === 'allowed') {
    return readAdminBusinessActionsRouteReadback({
      state: result.state,
      ...(requestId === undefined ? {} : { requestId }),
    })
  }

  return {
    deniedReason: result.publicMessage,
    rows: [],
  }
}

export function adminBusinessActionServerToDetailRouteReadback(
  result: AdminBusinessActionSourceStateServerResult,
  requestId: CapabilityRequestId
): AdminBusinessActionDetailRouteReadback {
  if (result.kind === 'allowed') {
    return readAdminBusinessActionDetailRouteReadback({ state: result.state, requestId })
  }

  return {
    kind: 'not_found',
    reason: 'business_action_admin_readback_not_found',
  }
}

export function readAdminBusinessActionDetailRouteReadback(
  input: Required<Pick<AdminBusinessActionsRouteInput, 'requestId'>> & Pick<AdminBusinessActionsRouteInput, 'state'>
): AdminBusinessActionDetailRouteReadback {
  const state = input.state ?? createEmptyBusinessActionSourceState()
  const request = state.requests.find((candidate) => candidate.id === input.requestId)
  if (request === undefined) {
    return { kind: 'not_found', reason: 'business_action_admin_readback_not_found' }
  }

  return {
    kind: 'ok',
    reconstruction: buildAdminBusinessActionRouteReconstruction(state, request.id),
  }
}

export function buildAdminBusinessActionRouteReconstruction(
  state: BusinessActionSourceState,
  requestId: CapabilityRequestId
): AdminBusinessActionRouteReconstruction {
  const request = state.requests.find((candidate) => candidate.id === requestId)
  if (request === undefined) {
    throw new Error('business_action_admin_readback_not_found')
  }

  const ownerSafe = buildOwnerBusinessActionRouteReconstruction(state, request)
  return {
    ...ownerSafe,
    guardrailDecisions: state.guardrailDecisions
      .filter((candidate) => candidate.requestId === request.id)
      .map((decision) => ({
        id: decision.id,
        requestId: decision.requestId,
        provider: decision.provider,
        modelName: decision.modelName,
        modelVersion: decision.modelVersion,
        decision: decision.decision,
        policyHash: decision.policyHash,
        decisionHash: decision.decisionHash,
        payloadHash: decision.payloadHash,
        recordedAt: decision.recordedAt,
      })),
    externalEvidenceEvents: state.externalEvidenceEvents
      .filter((candidate) => candidate.requestId === request.id)
      .map((event) => ({
        id: event.id,
        requestId: event.requestId,
        checkpointId: event.checkpointId,
        provider: event.provider,
        status: event.status,
        providerRefHash: event.providerRefHash,
        payloadHash: event.payloadHash,
        idempotencyKey: event.idempotencyKey,
        correlationId: event.correlationId,
        receivedAt: event.receivedAt,
        ...('amountCents' in event && event.amountCents === undefined ? {} : { amountCents: event.amountCents }),
        ...('currency' in event && event.currency === undefined ? {} : { currency: event.currency }),
        ...('reason' in event && event.reason === undefined ? {} : { reason: event.reason }),
        ...('evidenceKind' in event && typeof event.evidenceKind === 'string' ? { evidenceKind: event.evidenceKind } : {}),
      })),
    privateEvidenceMetadata: {
      count: state.privateEvidenceRefs.filter((candidate) => candidate.requestId === request.id).length,
      refs: state.privateEvidenceRefs
        .filter((candidate) => candidate.requestId === request.id)
        .map((ref) => ({
          id: ref.id,
          requestId: ref.requestId,
          retentionClass: ref.retentionClass,
          accessPolicy: ref.accessPolicy,
          payloadHash: ref.payloadHash,
          ttlExpiresAt: ref.ttlExpiresAt,
          ...(ref.redactedAt === undefined ? {} : { redactedAt: ref.redactedAt }),
        })),
    },
  }
}

function AdminBusinessActionsRoute() {
  const location = useLocation()
  const search = Route.useSearch()
  const requestId = search.requestId === undefined ? undefined : (search.requestId as CapabilityRequestId)
  const readback = adminBusinessActionServerToRouteReadback(Route.useLoaderData(), requestId)

  if (location.pathname !== '/admin/business-actions') {
    return <Outlet />
  }

  return (
    <AeOperatorShell
      role="admin"
      title="Business action reconstruction"
      description="source/local proof only. production proof not claimed."
      currentPath="/admin/business-actions"
      navBadges={{ '/admin/business-actions': readback.rows.length }}
    >
      {search.requestId === undefined ? <FilterPanel /> : <FilterPanel requestId={search.requestId} />}
      {readback.deniedReason === undefined ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Business action reconstruction unavailable</CardTitle>
            <CardDescription>{readback.deniedReason}</CardDescription>
          </CardHeader>
        </Card>
      )}
      {readback.rows.length === 0 ? <EmptyState /> : <AdminBusinessActionRows rows={readback.rows} />}
    </AeOperatorShell>
  )
}

function compactAdminSearch(search: AdminBusinessActionSearch): { requestId?: string } {
  return search.requestId === undefined ? {} : { requestId: search.requestId }
}

function FilterPanel({ requestId }: { requestId?: string }) {
  return (
    <AeOperatorFilterCard
      action="/admin/business-actions"
      title="Find a business action request"
      description="Filter by one source-owned request identifier."
      fields={[
        {
          id: 'requestId',
          name: 'requestId',
          label: 'Request ID',
          description: 'Business action capability request source ref.',
          defaultValue: requestId ?? '',
        },
      ]}
    />
  )
}

function EmptyState() {
  return (
    <AeOperatorQueueList
      rows={[]}
      emptyTitle="No business action rows"
      emptyDescription="No source-owned business action request matches the current filters."
    />
  )
}

function AdminBusinessActionRows({ rows }: { rows: readonly AdminBusinessActionRouteReconstruction[] }) {
  return (
    <AeOperatorQueueList
      scroll
      rows={rows.map((row) => ({
        id: row.request.id,
        href: `/admin/business-actions/${encodeURIComponent(row.request.id)}`,
        badges: [
          { label: row.receipt?.outcome.replaceAll('_', ' ') ?? 'no receipt' },
          { label: row.resultArtifactState.status.replaceAll('_', ' '), variant: 'outline' as const },
        ],
        title: row.request.id,
        description: 'No raw prompts, traces, provider payloads, Stripe payloads, endpoint refs, keys, or webhook secrets are exposed.',
        facts: [
          { label: 'Checkpoint', value: row.checkpoint?.decision ?? 'missing' },
          { label: 'Guardrail decisions', value: String(row.guardrailDecisions.length) },
          { label: 'External evidence', value: String(row.externalEvidenceEvents.length) },
          { label: 'Private evidence refs', value: String(row.privateEvidenceMetadata.count) },
          { label: 'Support', value: row.supportRecords[0]?.status ?? 'none' },
          { label: 'No repair', value: row.noRepair?.reason ?? 'none' },
        ],
        actions: [
          {
            label: 'Open operation',
            href: `/admin/business-actions/${encodeURIComponent(row.request.id)}`,
            variant: 'outline',
          },
        ],
      }))}
      emptyTitle="No business action rows"
      emptyDescription="No source-owned business action request matches the current filters."
    />
  )
}
