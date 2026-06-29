import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { SearchIcon } from 'lucide-react'

import { AeAdminShell } from '@/components/ae/layout/AeAdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type {
  BusinessActionPrivateEvidenceRef,
  BusinessActionSourceState,
  ExternalEvidenceEvent,
  GuardrailDecisionEvidence,
} from '@/modules/business-action/public'
import { createEmptyBusinessActionSourceState } from '@/modules/business-action/public'
import type { CapabilityRequestId } from '@/modules/common/ids'
import {
  FactGrid,
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
  const readback = readAdminBusinessActionsRouteReadback({
    ...(search.requestId === undefined ? {} : { requestId: search.requestId as CapabilityRequestId }),
  })

  if (location.pathname !== '/admin/business-actions') {
    return <Outlet />
  }

  return (
    <AeAdminShell
      title="Business action reconstruction"
      description="source/local proof only. production proof not claimed."
      currentPath="/admin/business-actions"
    >
      <FilterPanel requestId={search.requestId} />
      {readback.rows.length === 0 ? <EmptyState /> : <AdminBusinessActionRows rows={readback.rows} />}
    </AeAdminShell>
  )
}

function FilterPanel({ requestId }: { requestId?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Find a business action request</CardTitle>
        <CardDescription>Filter by one source-owned request identifier.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action="/admin/business-actions" method="get" className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="requestId">Request ID</FieldLabel>
              <Input id="requestId" name="requestId" defaultValue={requestId ?? ''} autoComplete="off" />
              <FieldDescription>Business action capability request source ref.</FieldDescription>
            </Field>
          </FieldGroup>
          <Button type="submit">
            <SearchIcon data-icon="inline-start" aria-hidden="true" />
            Filter
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No business action rows</CardTitle>
        <CardDescription>No source-owned business action request matches the current filters.</CardDescription>
      </CardHeader>
    </Card>
  )
}

function AdminBusinessActionRows({ rows }: { rows: readonly AdminBusinessActionRouteReconstruction[] }) {
  return (
    <div className="grid gap-4">
      {rows.map((row) => (
        <Card key={row.request.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{row.receipt?.outcome.replaceAll('_', ' ') ?? 'no receipt'}</Badge>
              <Badge variant="outline">{row.resultArtifactState.status.replaceAll('_', ' ')}</Badge>
            </div>
            <CardTitle className="break-words text-lg">{row.request.id}</CardTitle>
            <CardDescription>No raw prompts, traces, provider payloads, Stripe payloads, endpoint refs, keys, or webhook secrets are exposed.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <FactGrid
              facts={[
                { label: 'Checkpoint', value: row.checkpoint?.decision ?? 'missing' },
                { label: 'Guardrail decisions', value: String(row.guardrailDecisions.length) },
                { label: 'External evidence', value: String(row.externalEvidenceEvents.length) },
                { label: 'Private evidence refs', value: String(row.privateEvidenceMetadata.count) },
                { label: 'Support', value: row.supportRecords[0]?.status ?? 'none' },
                { label: 'No repair', value: row.noRepair?.reason ?? 'none' },
              ]}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
