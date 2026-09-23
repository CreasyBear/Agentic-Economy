import type { FunctionReference, FunctionReturnType } from 'convex/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type {
  OwnerSupplyFunnelReadback,
} from './supply-funnel/types'
import type { PublishPreparedCapabilityCommandResult } from './publication'
import {
  prepareSupplyPublicationV2,
  type PublishSupplyToolV2Input,
} from '../supply-publication-v2'

export type SupplyPublishPipelineResult =
  | Readonly<{
      kind: 'submitted' | 'replayed'
      publicationRef: string
      publicationRevision: number
      toolRef: string
      state: 'Submitted'
    }>
  | Readonly<{ kind: 'refused'; reason: string }>

export type MutateFn = <Mutation extends FunctionReference<'mutation', 'public', Record<string, unknown>>>(
  mutation: Mutation,
  command: Record<string, unknown>,
  operationKey: string,
  correlationId: string,
) => Promise<FunctionReturnType<Mutation>>

export type QueryFn = <Q extends FunctionReference<'query', 'public', Record<string, unknown>>>(
  sourceQueryRef: Q,
  command: Record<string, unknown>,
  operationKey: string,
  correlationId: string,
) => Promise<FunctionReturnType<Q>>

type ConnectionDetailResult =
  | Readonly<{ kind: 'found'; connection: Readonly<{ businessId: string; connectionRef: string; providerRef: string; lifecycle: string; available: boolean }> }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'error'; code: string }>

type OwnerPublicationReservationResult =
  | { kind: 'reserved' }
  | { kind: 'replayed' }
  | { kind: 'refused'; reason: string }

type SupplyIntegrationDraftSaveResult =
  | Readonly<{ kind: 'saved' | 'replayed'; offeringRef: string; accessPathRef: string; candidateRef: string; sourceDigest: string }>
  | Readonly<{ kind: 'refused'; reason: string }>

const connectionDetailQuery = sourceQuery<Record<string, unknown>, ConnectionDetailResult>('capabilityProviderConnectionAgents:read')
const supplyReadQuery = sourceQuery<Record<string, unknown>, OwnerSupplyFunnelReadback>('capabilitySupplyOwnerFunnel:readAgentOwnerSupplyFunnel')
const integrationDraftSaveMutation = sourceMutation<Record<string, unknown>, SupplyIntegrationDraftSaveResult>('capabilitySupplyOwnerFunnel:saveAgentSupplyIntegrationDraft')
const publishReservationMutation = sourceMutation<Record<string, unknown>, OwnerPublicationReservationResult>('capabilitySupplyOwnerFunnel:reserveOwnerCapabilityPublication')
const publishMutation = sourceMutation<Record<string, unknown>, PublishPreparedCapabilityCommandResult>('capabilitySupply:publishPreparedCapability')

function commandKey(action: string, principal: AgentAccessPrincipal, idempotencyKey: string): string {
  return canonicalDigest({ action, ownerId: principal.ownerId, idempotencyKey })
}

function refused(reason: string): { kind: 'refused'; reason: string } {
  return { kind: 'refused', reason }
}

export async function executePublishCommitPipeline(options: {
  input: PublishSupplyToolV2Input
  principal: AgentAccessPrincipal
  mutate: MutateFn
  query: QueryFn
}): Promise<SupplyPublishPipelineResult> {
  const { input, principal, mutate, query } = options
  const baseKey = commandKey('supply.publish', principal, input.idempotencyKey)
  const durableCorrelationId = baseKey
  let providerAuthority: { kind: 'provider_connection'; connectionRef: string; providerRef: string } | undefined

  if (input.connectionRef !== undefined) {
    const connection = await query(connectionDetailQuery, {
      connectionRef: input.connectionRef,
      agentPrincipal: principal,
      operationKey: `${baseKey}:connection`,
      correlationId: durableCorrelationId,
    }, `${baseKey}:connection`, durableCorrelationId)
    if (connection.kind !== 'found'
      || connection.connection.businessId !== input.businessRef
      || connection.connection.lifecycle !== 'active'
      || !connection.connection.available) return refused('connection_unavailable')
    providerAuthority = {
      kind: 'provider_connection',
      connectionRef: connection.connection.connectionRef,
      providerRef: connection.connection.providerRef,
    }
  }

  const preparation = await prepareSupplyPublicationV2(input, {
    ...(providerAuthority === undefined ? {} : { providerAuthority }),
  })
  if (preparation.kind === 'refused') return refused(preparation.reason)

  const saved = await mutate(integrationDraftSaveMutation, {
    businessId: input.businessRef,
    title: input.presentation.name,
    description: input.presentation.description,
    category: input.presentation.category,
    sourceKind: input.source.kind,
    sourceDescriptorJson: preparation.sourceDescriptorJson,
    sourceDigest: preparation.sourceDigest,
    sourceRevision: preparation.sourceRevision,
    candidateRef: input.candidateRef,
    sourceSelectorJson: preparation.sourceSelectorJson,
    ...(input.connectionRef === undefined ? {} : { connectionRef: input.connectionRef }),
    ...(preparation.validationInputJson === undefined ? {} : { validationInputJson: preparation.validationInputJson }),
    operationKey: `${baseKey}:draft`,
    correlationId: durableCorrelationId,
    agentPrincipal: principal,
  }, `${baseKey}:draft`, durableCorrelationId)
  if (saved.kind === 'refused') return refused(saved.reason)

  const readback = await query(supplyReadQuery, {
    businessId: input.businessRef,
    agentPrincipal: principal,
    operationKey: `${baseKey}:read`,
    correlationId: durableCorrelationId,
  }, `${baseKey}:read`, durableCorrelationId)
  if (readback.kind !== 'available') return refused(readback.kind === 'error' ? readback.code : 'authorization_denied')

  const offering = readback.offerings.find((candidate) => candidate.offeringRef === saved.offeringRef)
  const accessPath = offering?.accessPaths.find((candidate) => candidate.accessPathRef === saved.accessPathRef)
  if (offering === undefined || offering.sourceHash === undefined || accessPath === undefined) return refused('catalog_offering_origin_changed')

  const prepared = {
    ...preparation.prepared.prepared,
    sourceAuthorityState: preparation.sourceAuthorityState,
    offering: {
      ...preparation.prepared.prepared.offering,
      origin: {
        kind: 'catalog_offering' as const,
        offeringRef: offering.offeringRef,
        offeringRevision: offering.revision,
        offeringSourceHash: offering.sourceHash,
        declaredAccessPathRef: accessPath.accessPathRef,
        accessPathSourceHash: accessPath.sourceHash,
      },
    },
  }

  const materialDigest = canonicalDigest(input)
  const reservation = await mutate(publishReservationMutation, {
    businessId: input.businessRef,
    offeringRef: offering.offeringRef,
    offeringRevision: offering.revision,
    offeringSourceHash: offering.sourceHash,
    materialDigest,
    operationKey: baseKey,
    correlationId: durableCorrelationId,
    reasonCode: 'supply.publish',
    evidenceRefs: [preparation.sourceDigest, input.candidateRef],
    agentPrincipal: principal,
  }, baseKey, durableCorrelationId)
  if (reservation.kind !== 'reserved' && reservation.kind !== 'replayed') return refused(reservation.reason ?? 'operation_key_conflict')

  const published = await mutate(publishMutation, {
    businessId: input.businessRef,
    offeringRef: offering.offeringRef,
    revision: offering.revision,
    sourceHash: offering.sourceHash,
    runtimeEnvironment: input.environment,
    prepared,
    operationKey: baseKey,
    correlationId: durableCorrelationId,
    reasonCode: 'supply.publish',
    evidenceRefs: [preparation.sourceDigest, input.candidateRef],
    agentPrincipal: principal,
  }, baseKey, durableCorrelationId)

  if (published.kind === 'refused') return refused(typeof published.reason === 'string' ? published.reason : 'source_unavailable')
  if ((published.kind !== 'published' && published.kind !== 'replayed')
    || typeof published.publicationRef !== 'string'
    || typeof published.toolRef !== 'string'
    || typeof published.publicationRevision !== 'number') return refused('source_unavailable')

  return {
    kind: published.kind === 'replayed' ? 'replayed' : 'submitted',
    publicationRef: published.publicationRef,
    publicationRevision: published.publicationRevision,
    toolRef: published.toolRef,
    state: 'Submitted',
  }
}
