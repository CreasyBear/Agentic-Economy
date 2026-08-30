import { z } from 'zod'
import type { FunctionReference, FunctionReturnType } from 'convex/server'

import {
  callPublicSourceMutation,
  sourceMutation,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'
import { jsonValueSchema } from '@/modules/capability-contract/public'
import { defineAction, type ActionParameter } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { currencySchema, exactAmountSchema, ProviderEarningsViewSchema } from '@/modules/money/public'
import {
  ownerPublicationImport,
  ownerPublicationWithCatalogOrigin,
  type OwnerProviderEarningsReadback,
  type OwnerSupplyCommandResult,
  type OwnerSupplyFunnelReadback,
  type OwnerSupplyOfferingReadback,
} from './supply-funnel.functions'
import { preparePublicationDraft, publicationMaterialContainsCredential, type PublishPreparedCapabilityCommandResult } from './internal/publication'
import { dereferenceOpenApiSchema } from './internal/schema-deref'

const publicationLifecycleSchema = z.strictObject({
  state: z.enum(['inactive', 'active', 'withdrawn', 'incompatible']),
  reasons: z.array(z.string()),
})
const actionRefusalSchema = z.strictObject({
  kind: z.literal('refused'),
  reason: z.string(),
})

export const SUPPLY_ACTION_IDS = Object.freeze({
  status: 'supply.status',
  publish: 'supply.publish',
  withdraw: 'supply.withdraw',
  recheck: 'supply.recheck',
  republish: 'supply.republish',
  earnings: 'supply.earnings',
  connectionList: 'supply.connection.list',
  connectionDetail: 'supply.connection.detail',
  connectionConnect: 'supply.connection.connect',
  connectionReconnect: 'supply.connection.reconnect',
  connectionRevoke: 'supply.connection.revoke',
  connectionRetryCleanup: 'supply.connection.retryCleanup',
} as const)

export const SUPPLY_ACTION_ROUTE_CONTRACTS = Object.freeze({
  status: Object.freeze({ actionId: SUPPLY_ACTION_IDS.status, contractVersion: 'supply-status:v1', method: 'POST' as const, path: '/api/v1/supply/status', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  publish: Object.freeze({ actionId: SUPPLY_ACTION_IDS.publish, contractVersion: 'supply-publication:v1', method: 'POST' as const, path: '/api/v1/supply/publish', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  withdraw: Object.freeze({ actionId: SUPPLY_ACTION_IDS.withdraw, contractVersion: 'supply-withdrawal:v1', method: 'POST' as const, path: '/api/v1/supply/withdraw', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  recheck: Object.freeze({ actionId: SUPPLY_ACTION_IDS.recheck, contractVersion: 'supply-recheck:v1', method: 'POST' as const, path: '/api/v1/supply/recheck', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  republish: Object.freeze({ actionId: SUPPLY_ACTION_IDS.republish, contractVersion: 'supply-republish:v1', method: 'POST' as const, path: '/api/v1/supply/republish', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  earnings: Object.freeze({ actionId: SUPPLY_ACTION_IDS.earnings, contractVersion: 'supply-earnings:v1', method: 'POST' as const, path: '/api/v1/supply/earnings', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionList: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionList, contractVersion: 'supply-connection-list:v1', method: 'POST' as const, path: '/api/v1/supply/connections/list', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionDetail: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionDetail, contractVersion: 'supply-connection-detail:v1', method: 'POST' as const, path: '/api/v1/supply/connections/detail', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionConnect: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionConnect, contractVersion: 'supply-connection-connect:v1', method: 'POST' as const, path: '/api/v1/supply/connections/connect', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionReconnect: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionReconnect, contractVersion: 'supply-connection-reconnect:v1', method: 'POST' as const, path: '/api/v1/supply/connections/reconnect', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionRevoke: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionRevoke, contractVersion: 'supply-connection-revoke:v1', method: 'POST' as const, path: '/api/v1/supply/connections/revoke', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionRetryCleanup: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionRetryCleanup, contractVersion: 'supply-connection-retry-cleanup:v1', method: 'POST' as const, path: '/api/v1/supply/connections/retry-cleanup', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
})

const funnelStepSchema = z.enum(['describe', 'admission', 'readiness', 'test'])
const funnelStepStateSchema = z.enum(['not_started', 'in_progress', 'completed', 'refused', 'stale'])
const supplyStatusOperationSchema = z.strictObject({
  offeringRef: z.string(),
  revision: z.number().int().positive(),
  name: z.string(),
  summary: z.string(),
  catalogStatus: z.enum(['draft', 'published', 'paused', 'retired']),
  lifecycle: publicationLifecycleSchema,
  readiness: z.strictObject({
    outcome: z.string(),
    observedAt: z.number().optional(),
    validUntil: z.number().optional(),
  }),
  live: z.strictObject({
    available: z.boolean(),
    reason: z.string().optional(),
  }),
  currentStep: funnelStepSchema,
  stepStates: z.strictObject({
    describe: funnelStepStateSchema,
    admission: funnelStepStateSchema,
    readiness: funnelStepStateSchema,
    test: funnelStepStateSchema,
  }),
  actionableReason: z.string().optional(),
  publication: z.strictObject({
    publicationRef: z.string(),
    publicationRevision: z.number().int().positive(),
    operationRef: z.string(),
    state: z.enum(['current', 'withdrawn', 'superseded', 'incompatible']),
  }).optional(),
})

export const supplyStatusInputSchema = z.strictObject({
  businessId: z.string().trim().min(1),
  offeringRef: z.string().trim().min(1).optional(),
})
export type SupplyStatusInput = z.infer<typeof supplyStatusInputSchema>
export const supplyStatusResultSchema = z.union([
  z.strictObject({
    kind: z.literal('available'),
    businessId: z.string(),
    business: z.strictObject({ name: z.string(), slug: z.string() }),
    operations: z.array(supplyStatusOperationSchema),
    activityTruncated: z.boolean(),
  }),
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({ kind: z.literal('incomplete') }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])
export type SupplyStatusResult = z.infer<typeof supplyStatusResultSchema>

export const supplyPublishInputSchema = z.strictObject({
  version: z.literal('supply-publication:v1'),
  businessId: z.string().trim().min(1),
  offeringRef: z.string().trim().min(1),
  offeringRevision: z.number().int().positive(),
  offeringSourceHash: z.string().trim().min(1),
  source: z.record(z.string(), jsonValueSchema),
  evidenceRefs: z.array(z.string().trim().min(1)).max(64),
  idempotencyKey: z.string().trim().min(8).max(200),
})
export type SupplyPublishInput = z.infer<typeof supplyPublishInputSchema>
export const supplyPublishResultSchema = z.union([
  z.strictObject({
    kind: z.enum(['published', 'replayed']),
    publicationRef: z.string(),
    publicationRevision: z.number().int().positive(),
    operationRef: z.string(),
    lifecycle: publicationLifecycleSchema,
  }),
  actionRefusalSchema,
])
export type SupplyPublishResult = z.infer<typeof supplyPublishResultSchema>

export const supplyWithdrawInputSchema = z.strictObject({
  businessId: z.string().trim().min(1),
  offeringRef: z.string().trim().min(1),
  offeringRevision: z.number().int().positive(),
  offeringSourceHash: z.string().trim().min(1),
  publicationRef: z.string().trim().min(1),
  publicationRevision: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(200),
})
export type SupplyWithdrawInput = z.infer<typeof supplyWithdrawInputSchema>
export const supplyWithdrawResultSchema = z.union([
  z.strictObject({
    kind: z.literal('withdrawn'),
    publicationRef: z.string(),
    revision: z.number().int().positive(),
    lifecycle: publicationLifecycleSchema,
  }),
  actionRefusalSchema,
])
export type SupplyWithdrawResult = z.infer<typeof supplyWithdrawResultSchema>

export const supplyRecheckInputSchema = supplyWithdrawInputSchema
export type SupplyRecheckInput = z.infer<typeof supplyRecheckInputSchema>
export const supplyRecheckResultSchema = z.union([
  z.strictObject({
    kind: z.literal('refreshed'),
    publicationRef: z.string(),
    revision: z.number().int().positive(),
    disposition: z.enum(['current', 'incompatible']),
    lifecycle: publicationLifecycleSchema,
  }),
  actionRefusalSchema,
])
export type SupplyRecheckResult = z.infer<typeof supplyRecheckResultSchema>

export const supplyRepublishInputSchema = supplyWithdrawInputSchema
export type SupplyRepublishInput = z.infer<typeof supplyRepublishInputSchema>
export const supplyRepublishResultSchema = z.union([
  z.strictObject({
    kind: z.literal('republished'),
    publicationRef: z.string(),
    revision: z.number().int().positive(),
    operationRef: z.string(),
    bindingId: z.string(),
    lifecycle: publicationLifecycleSchema,
  }),
  actionRefusalSchema,
])
export type SupplyRepublishResult = z.infer<typeof supplyRepublishResultSchema>

export const supplyEarningsInputSchema = z.strictObject({ currency: currencySchema })
export type SupplyEarningsInput = z.infer<typeof supplyEarningsInputSchema>
const earningsSchema = ProviderEarningsViewSchema
const payoutSchema = z.strictObject({
  businessId: z.string(),
  accountState: z.enum(['missing', 'not_started', 'onboarding_started', 'submitted', 'restricted', 'ready']),
  payoutState: z.enum(['review', 'held_kyc', 'held_threshold', 'transfer_pending', 'paid', 'reversed', 'failed', 'outcome_unknown']).optional(),
  providerNet: exactAmountSchema,
  minimumPayout: exactAmountSchema,
  transferStatus: z.enum(['pending', 'succeeded', 'failed', 'reversed', 'outcome_unknown']).optional(),
  providerRecoveryDeadlineAt: z.number().optional(),
  recoveryState: z.enum(['provider_id', 'idempotency_key', 'admin_intervention']).optional(),
  evidenceDigest: z.string().optional(),
  reversalEvidenceDigest: z.string().optional(),
  providerHeldBefore: exactAmountSchema.optional(),
  providerHeldAfter: exactAmountSchema.optional(),
  providerPaidBefore: exactAmountSchema.optional(),
  providerPaidAfter: exactAmountSchema.optional(),
  evidence: z.enum(['source', 'labelled_local_dev']),
})
const payoutProjectionSchema = z.object(payoutSchema.shape).pipe(payoutSchema)
export const supplyEarningsResultSchema = z.union([
  z.strictObject({
    kind: z.literal('available'),
    businessId: z.string(),
    currency: z.string(),
    earnings: earningsSchema,
    payout: payoutSchema,
  }),
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])
export type SupplyEarningsResult = z.infer<typeof supplyEarningsResultSchema>

export const providerConnectionLifecycleSchema = z.enum([
  'active',
  'reauthorization_required',
  'revocation_pending',
  'cleanup_required',
  'revoked',
])
export const providerConnectionProjectionSchema = z.strictObject({
  connectionRef: z.string(),
  businessId: z.string(),
  providerRef: z.string(),
  providerAccountRef: z.string(),
  adapterId: z.string(),
  grantedScopes: z.array(z.string()),
  grantedResources: z.array(z.string()),
  authorityGeneration: z.number().int().nonnegative(),
  authorityDigest: z.string(),
  lifecycle: providerConnectionLifecycleSchema,
  available: z.boolean(),
  credentialConfigured: z.boolean(),
  observedAt: z.number(),
  expiresAt: z.number().optional(),
  revokedAt: z.number().optional(),
  reasonCode: z.string().nullable(),
  evidenceRefs: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type ProviderConnectionProjection = z.infer<typeof providerConnectionProjectionSchema>

export const supplyConnectionListInputSchema = z.strictObject({
  businessId: z.string().trim().min(1),
  lifecycle: providerConnectionLifecycleSchema.optional(),
  limit: z.number().int().min(1).max(100).default(100),
})
export type SupplyConnectionListInput = z.infer<typeof supplyConnectionListInputSchema>
export const supplyConnectionListResultSchema = z.union([
  z.strictObject({
    kind: z.literal('available'),
    businessId: z.string(),
    connections: z.array(providerConnectionProjectionSchema).max(100),
  }),
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])
export type SupplyConnectionListResult = z.infer<typeof supplyConnectionListResultSchema>

export const supplyConnectionDetailInputSchema = z.strictObject({
  connectionRef: z.string().trim().min(1),
})
export type SupplyConnectionDetailInput = z.infer<typeof supplyConnectionDetailInputSchema>
export const supplyConnectionDetailResultSchema = z.union([
  z.strictObject({ kind: z.literal('found'), connection: providerConnectionProjectionSchema }),
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])
export type SupplyConnectionDetailResult = z.infer<typeof supplyConnectionDetailResultSchema>

const connectionEvidenceSchema = z.array(z.string().trim().min(1)).max(64)
const connectionIdempotencySchema = z.string().trim().min(8).max(200)
export const supplyConnectionConnectInputSchema = z.strictObject({
  businessId: z.string().trim().min(1),
  resourceUrl: z.string().url(),
  evidenceRefs: connectionEvidenceSchema.default([]),
  idempotencyKey: connectionIdempotencySchema,
})
export type SupplyConnectionConnectInput = z.infer<typeof supplyConnectionConnectInputSchema>

export const supplyConnectionTransitionInputSchema = z.strictObject({
  connectionRef: z.string().trim().min(1),
  expectedAuthorityGeneration: z.number().int().nonnegative(),
  expectedAuthorityDigest: z.string().trim().min(1),
  reasonCode: z.string().trim().min(1).max(200).optional(),
  evidenceRefs: connectionEvidenceSchema.default([]),
  idempotencyKey: connectionIdempotencySchema,
})
export type SupplyConnectionTransitionInput = z.infer<typeof supplyConnectionTransitionInputSchema>

export const supplyConnectionRetryCleanupInputSchema = z.strictObject({
  connectionRef: z.string().trim().min(1),
  idempotencyKey: connectionIdempotencySchema,
})
export type SupplyConnectionRetryCleanupInput = z.infer<typeof supplyConnectionRetryCleanupInputSchema>

const providerConnectionRefusalReasonSchema = z.enum([
  'invalid_identity',
  'invalid_time',
  'invalid_scope',
  'invalid_resource',
  'invalid_generation',
  'invalid_digest',
  'invalid_transition',
  'command_identity_conflict',
  'source_unavailable',
])
export const supplyConnectionCommandResultSchema = z.union([
  z.strictObject({
    kind: z.enum(['applied', 'duplicate']),
    connection: providerConnectionProjectionSchema,
    commandDigest: z.string(),
  }),
  z.strictObject({ kind: z.literal('refused'), reason: providerConnectionRefusalReasonSchema }),
])
export type SupplyConnectionCommandResult = z.infer<typeof supplyConnectionCommandResultSchema>

export type SupplyManagementService = Readonly<{
  status(input: Readonly<{ input: SupplyStatusInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyStatusResult>
  publish(input: Readonly<{ input: SupplyPublishInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyPublishResult>
  withdraw(input: Readonly<{ input: SupplyWithdrawInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyWithdrawResult>
  recheck(input: Readonly<{ input: SupplyRecheckInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyRecheckResult>
  republish(input: Readonly<{ input: SupplyRepublishInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyRepublishResult>
  earnings(input: Readonly<{ input: SupplyEarningsInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyEarningsResult>
  connectionList(input: Readonly<{ input: SupplyConnectionListInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyConnectionListResult>
  connectionDetail(input: Readonly<{ input: SupplyConnectionDetailInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyConnectionDetailResult>
  connectionConnect(input: Readonly<{ input: SupplyConnectionConnectInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyConnectionCommandResult>
  connectionReconnect(input: Readonly<{ input: SupplyConnectionTransitionInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyConnectionCommandResult>
  connectionRevoke(input: Readonly<{ input: SupplyConnectionTransitionInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyConnectionCommandResult>
  connectionRetryCleanup(input: Readonly<{ input: SupplyConnectionRetryCleanupInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyConnectionCommandResult>
}>

const supplyReadMutation = sourceMutation<Record<string, unknown>, OwnerSupplyFunnelReadback>('capabilitySupplyOwnerFunnel:readAgentOwnerSupplyFunnel')
type OwnerPublicationReservationResult =
  | { kind: 'reserved' }
  | { kind: 'replayed' }
  | { kind: 'refused'; reason: string }
const publishReservationMutation = sourceMutation<Record<string, unknown>, OwnerPublicationReservationResult>('capabilitySupplyOwnerFunnel:reserveOwnerCapabilityPublication')
const publishMutation = sourceMutation<Record<string, unknown>, PublishPreparedCapabilityCommandResult>('capabilitySupply:publishPreparedCapability')
const withdrawMutation = sourceMutation<Record<string, unknown>, OwnerSupplyCommandResult>('capabilitySupplyOwnerFunnel:withdrawOwnerCapability')
const recheckMutation = sourceMutation<Record<string, unknown>, OwnerSupplyCommandResult>('capabilitySupplyOwnerFunnel:refreshOwnerCapability')
const republishMutation = sourceMutation<Record<string, unknown>, OwnerSupplyCommandResult>('capabilitySupplyOwnerFunnel:republishOwnerCapability')
const earningsReadMutation = sourceMutation<Record<string, unknown>, OwnerProviderEarningsReadback>('moneyLedger:readAgentProviderEarnings')
const connectionListMutation = sourceMutation<Record<string, unknown>, SupplyConnectionListResult>('capabilityProviderConnectionAgents:list')
const connectionDetailMutation = sourceMutation<Record<string, unknown>, SupplyConnectionDetailResult>('capabilityProviderConnectionAgents:read')
type ProviderConnectionBackendCommandResult =
  | Readonly<{ kind: 'applied' | 'duplicate'; connection: ProviderConnectionProjection; commandDigest: string }>
  | Readonly<{ kind: 'refused'; code: z.infer<typeof providerConnectionRefusalReasonSchema> }>
const connectionConnectMutation = sourceMutation<Record<string, unknown>, ProviderConnectionBackendCommandResult>('capabilityProviderConnectionAgents:connectX402')
const connectionReconnectMutation = sourceMutation<Record<string, unknown>, ProviderConnectionBackendCommandResult>('capabilityProviderConnectionAgents:reconnect')
const connectionRevokeMutation = sourceMutation<Record<string, unknown>, ProviderConnectionBackendCommandResult>('capabilityProviderConnectionAgents:revoke')
const connectionRetryCleanupMutation = sourceMutation<Record<string, unknown>, ProviderConnectionBackendCommandResult>('capabilityProviderConnectionAgents:retryCleanup')

function commandKey(action: string, principal: AgentAccessPrincipal, idempotencyKey: string): string {
  return canonicalDigest({ action, ownerId: principal.ownerId, idempotencyKey })
}
function refused(reason: string): { kind: 'refused'; reason: string } {
  return { kind: 'refused', reason }
}

export function createSupplyManagementService(request: Request, bodyText: string): SupplyManagementService {
  const mutate = async <Mutation extends FunctionReference<'mutation', 'public', Record<string, unknown>>>(
    mutation: Mutation,
    command: Record<string, unknown>,
    operationKey: string,
    correlationId: string,
  ): Promise<FunctionReturnType<Mutation>> => {
    const sourceWrite = await sourceWriteAdmissionFromRequest({ request, command, body: bodyText, scope: 'catalog_publish', operationKey, correlationId })
    return await callPublicSourceMutation(mutation, {
      ...command,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    })
  }
  const status = async ({ input, principal, correlationId }: { input: SupplyStatusInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyStatusResult> => {
    const operationKey = canonicalDigest({
      action: SUPPLY_ACTION_IDS.status,
      principalId: principal.principalId,
      businessId: input.businessId,
      offeringRef: input.offeringRef ?? null,
      correlationId,
    })
    const readback = await mutate(supplyReadMutation, {
      businessId: input.businessId,
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    if (readback.kind === 'error') return { kind: 'error', code: readback.code }
    if (readback.kind === 'not_found') return { kind: 'not_found' }
    if (readback.kind === 'incomplete') return { kind: 'incomplete' }
    const selected = input.offeringRef === undefined
      ? readback.offerings
      : readback.offerings.filter((offering) => offering.offeringRef === input.offeringRef)
    if (input.offeringRef !== undefined && selected.length === 0) return { kind: 'not_found' }
    return supplyStatusResultSchema.parse({
      kind: 'available',
      businessId: readback.businessId,
      business: readback.business,
      operations: selected.map(projectSupplyStatusOperation),
      activityTruncated: readback.activityTruncated,
    })
  }
  const publish = async ({ input, principal, correlationId: _transportCorrelationId }: { input: SupplyPublishInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyPublishResult> => {
    try {
      if (new TextEncoder().encode(JSON.stringify(input.source)).byteLength > 300_000) return refused('source_too_large')
    } catch {
      return refused('source_invalid')
    }
    if (publicationMaterialContainsCredential(input.source)) return refused('source_invalid')
    const imported = ownerPublicationImport(input.source)
    if (imported === undefined || publicationMaterialContainsCredential(imported.source)) return refused('source_invalid')
    const baseKey = commandKey('supply.publish', principal, input.idempotencyKey)
    const durableCorrelationId = baseKey
    const readback = await mutate(supplyReadMutation, {
      businessId: input.businessId,
      agentPrincipal: principal,
      operationKey: `${baseKey}:read`,
      correlationId: durableCorrelationId,
    }, `${baseKey}:read`, durableCorrelationId)
    if (readback.kind !== 'available') return refused(readback.kind === 'error' ? readback.code : 'authorization_denied')
    const offering = readback.offerings.find((candidate) => candidate.offeringRef === input.offeringRef && candidate.revision === input.offeringRevision)
    if (offering === undefined || offering.sourceHash !== input.offeringSourceHash) return refused('catalog_offering_origin_changed')
    const sourced = ownerPublicationWithCatalogOrigin(imported.source, offering)
    if (sourced === undefined) return refused('catalog_offering_invalid')
    const prepared = await preparePublicationDraft({ source: sourced, sourceRevision: imported.sourceRevision, pricingConfig: imported.pricingConfig, evidenceRefs: input.evidenceRefs, derefSchema: dereferenceOpenApiSchema })
    if (prepared.kind === 'refused') return refused(prepared.reason)
    const materialDigest = canonicalDigest(input)
    const reservation = await mutate(publishReservationMutation, {
      businessId: input.businessId,
      offeringRef: input.offeringRef,
      offeringRevision: input.offeringRevision,
      offeringSourceHash: input.offeringSourceHash,
      materialDigest,
      operationKey: baseKey,
      correlationId: durableCorrelationId,
      reasonCode: 'supply.publish',
      evidenceRefs: [...input.evidenceRefs],
      agentPrincipal: principal,
    }, baseKey, durableCorrelationId)
    if (reservation.kind !== 'reserved' && reservation.kind !== 'replayed') return refused(reservation.reason ?? 'operation_key_conflict')
    const published = await mutate(publishMutation, {
      businessId: input.businessId, offeringRef: input.offeringRef, revision: input.offeringRevision, sourceHash: input.offeringSourceHash,
      runtimeEnvironment: 'production', prepared: prepared.prepared, operationKey: baseKey,
      correlationId: durableCorrelationId, reasonCode: 'supply.publish', evidenceRefs: [...input.evidenceRefs], agentPrincipal: principal,
    }, baseKey, durableCorrelationId)
    if (published.kind === 'refused') return refused(typeof published.reason === 'string' ? published.reason : 'source_unavailable')
    if ((published.kind !== 'published' && published.kind !== 'replayed') || typeof published.publicationRef !== 'string' || typeof published.operationRef !== 'string' || typeof published.publicationRevision !== 'number' || !isRecordLifecycle(published.lifecycle)) return refused('source_unavailable')
    return { kind: published.kind, publicationRef: published.publicationRef, publicationRevision: published.publicationRevision, operationRef: published.operationRef, lifecycle: published.lifecycle }
  }
  const withdraw = async ({ input, principal, correlationId: _transportCorrelationId }: { input: SupplyWithdrawInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyWithdrawResult> => {
    const baseKey = commandKey('supply.withdraw', principal, input.idempotencyKey)
    const durableCorrelationId = baseKey
    const result = await mutate(withdrawMutation, {
      businessId: input.businessId, offeringRef: input.offeringRef, offeringRevision: input.offeringRevision, offeringSourceHash: input.offeringSourceHash,
      publicationRef: input.publicationRef, publicationRevision: input.publicationRevision, operationKey: baseKey, correlationId: durableCorrelationId,
      reasonCode: 'supply.withdraw', evidenceRefs: [], agentPrincipal: principal,
    }, baseKey, durableCorrelationId)
    if (result.kind === 'refused') return refused(typeof result.reason === 'string' ? result.reason : 'source_unavailable')
    if (result.kind !== 'withdrawn' || typeof result.publicationRef !== 'string' || typeof result.revision !== 'number' || !isRecordLifecycle(result.lifecycle)) return refused('source_unavailable')
    return { kind: 'withdrawn', publicationRef: result.publicationRef, revision: result.revision, lifecycle: result.lifecycle }
  }
  const runMaintenance = async (
    action: typeof SUPPLY_ACTION_IDS.recheck | typeof SUPPLY_ACTION_IDS.republish,
    mutation: typeof recheckMutation | typeof republishMutation,
    input: SupplyRecheckInput | SupplyRepublishInput,
    principal: AgentAccessPrincipal,
  ): Promise<OwnerSupplyCommandResult> => {
    const baseKey = commandKey(action, principal, input.idempotencyKey)
    return await mutate(mutation, {
      businessId: input.businessId,
      offeringRef: input.offeringRef,
      offeringRevision: input.offeringRevision,
      offeringSourceHash: input.offeringSourceHash,
      publicationRef: input.publicationRef,
      publicationRevision: input.publicationRevision,
      operationKey: baseKey,
      correlationId: baseKey,
      reasonCode: action,
      evidenceRefs: [],
      agentPrincipal: principal,
    }, baseKey, baseKey)
  }
  const recheck = async ({ input, principal }: { input: SupplyRecheckInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyRecheckResult> => {
    const result = await runMaintenance(SUPPLY_ACTION_IDS.recheck, recheckMutation, input, principal)
    if (result.kind === 'refused') return refused(result.reason)
    if (result.kind !== 'refreshed') return refused('source_unavailable')
    return supplyRecheckResultSchema.parse(result)
  }
  const republish = async ({ input, principal }: { input: SupplyRepublishInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyRepublishResult> => {
    const result = await runMaintenance(SUPPLY_ACTION_IDS.republish, republishMutation, input, principal)
    if (result.kind === 'refused') return refused(result.reason)
    if (result.kind !== 'republished') return refused('source_unavailable')
    return supplyRepublishResultSchema.parse(result)
  }
  const earnings = async ({ input, principal, correlationId }: { input: SupplyEarningsInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyEarningsResult> => {
    const operationKey = canonicalDigest({
      action: 'supply.earnings',
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      correlationId,
      currency: input.currency,
    })
    const result = await mutate(earningsReadMutation, {
      currency: input.currency,
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    if (result.kind === 'not_found') return { kind: 'not_found' }
    if (result.kind === 'error') return { kind: 'error', code: result.code === 'unauthenticated' ? 'unauthenticated' : 'source_unavailable' }
    const account = result.accounts.find((candidate) => candidate.currency === input.currency)
    if (account === undefined) return { kind: 'not_found' }
    const { kind: _earningsKind, ...earnings } = account.earnings
    const parsedEarnings = earningsSchema.safeParse(earnings)
    const parsedPayout = payoutProjectionSchema.safeParse(account.payout)
    if (!parsedEarnings.success || !parsedPayout.success) return { kind: 'error', code: 'source_unavailable' }
    return { kind: 'available', businessId: result.businessId, currency: account.currency, earnings: parsedEarnings.data, payout: parsedPayout.data }
  }
  const connectionList = async ({ input, principal, correlationId }: { input: SupplyConnectionListInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionListResult> => {
    const operationKey = canonicalDigest({
      action: SUPPLY_ACTION_IDS.connectionList,
      principalId: principal.principalId,
      businessId: input.businessId,
      lifecycle: input.lifecycle ?? null,
      limit: input.limit,
      correlationId,
    })
    const result = await mutate(connectionListMutation, {
      businessId: input.businessId,
      ...(input.lifecycle === undefined ? {} : { lifecycle: input.lifecycle }),
      limit: input.limit,
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    const parsed = supplyConnectionListResultSchema.safeParse(result)
    return parsed.success ? parsed.data : { kind: 'error', code: 'source_unavailable' }
  }
  const connectionDetail = async ({ input, principal, correlationId }: { input: SupplyConnectionDetailInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionDetailResult> => {
    const operationKey = canonicalDigest({
      action: SUPPLY_ACTION_IDS.connectionDetail,
      principalId: principal.principalId,
      connectionRef: input.connectionRef,
      correlationId,
    })
    const result = await mutate(connectionDetailMutation, {
      connectionRef: input.connectionRef,
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    const parsed = supplyConnectionDetailResultSchema.safeParse(result)
    return parsed.success ? parsed.data : { kind: 'error', code: 'source_unavailable' }
  }
  const runConnectionCommand = async (
    action: typeof SUPPLY_ACTION_IDS.connectionConnect
      | typeof SUPPLY_ACTION_IDS.connectionReconnect
      | typeof SUPPLY_ACTION_IDS.connectionRevoke
      | typeof SUPPLY_ACTION_IDS.connectionRetryCleanup,
    mutation: typeof connectionConnectMutation,
    command: Record<string, unknown>,
    input: Readonly<{ idempotencyKey: string }>,
    principal: AgentAccessPrincipal,
  ): Promise<SupplyConnectionCommandResult> => {
    const operationKey = commandKey(action, principal, input.idempotencyKey)
    const result = await mutate(mutation, {
      ...command,
      commandId: operationKey,
      agentPrincipal: principal,
      operationKey,
      correlationId: operationKey,
    }, operationKey, operationKey)
    if (result.kind === 'refused') return { kind: 'refused', reason: result.code }
    const parsed = supplyConnectionCommandResultSchema.safeParse(result)
    return parsed.success ? parsed.data : { kind: 'refused', reason: 'source_unavailable' }
  }
  const connectionConnect = async ({ input, principal }: { input: SupplyConnectionConnectInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionCommandResult> => (
    await runConnectionCommand(SUPPLY_ACTION_IDS.connectionConnect, connectionConnectMutation, {
      businessId: input.businessId,
      resourceUrl: input.resourceUrl,
      evidenceRefs: [...input.evidenceRefs],
    }, input, principal)
  )
  const connectionReconnect = async ({ input, principal }: { input: SupplyConnectionTransitionInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionCommandResult> => (
    await runConnectionCommand(SUPPLY_ACTION_IDS.connectionReconnect, connectionReconnectMutation, {
      connectionRef: input.connectionRef,
      expectedAuthorityGeneration: input.expectedAuthorityGeneration,
      expectedAuthorityDigest: input.expectedAuthorityDigest,
      ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
      evidenceRefs: [...input.evidenceRefs],
    }, input, principal)
  )
  const connectionRevoke = async ({ input, principal }: { input: SupplyConnectionTransitionInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionCommandResult> => (
    await runConnectionCommand(SUPPLY_ACTION_IDS.connectionRevoke, connectionRevokeMutation, {
      connectionRef: input.connectionRef,
      expectedAuthorityGeneration: input.expectedAuthorityGeneration,
      expectedAuthorityDigest: input.expectedAuthorityDigest,
      ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
      evidenceRefs: [...input.evidenceRefs],
    }, input, principal)
  )
  const connectionRetryCleanup = async ({ input, principal }: { input: SupplyConnectionRetryCleanupInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionCommandResult> => (
    await runConnectionCommand(SUPPLY_ACTION_IDS.connectionRetryCleanup, connectionRetryCleanupMutation, {
      connectionRef: input.connectionRef,
    }, input, principal)
  )
  return {
    status,
    publish,
    withdraw,
    recheck,
    republish,
    earnings,
    connectionList,
    connectionDetail,
    connectionConnect,
    connectionReconnect,
    connectionRevoke,
    connectionRetryCleanup,
  }
}

function projectSupplyStatusOperation(offering: OwnerSupplyOfferingReadback): z.infer<typeof supplyStatusOperationSchema> {
  return {
    offeringRef: offering.offeringRef,
    revision: offering.revision,
    name: offering.name,
    summary: offering.summary,
    catalogStatus: offering.status,
    lifecycle: {
      state: offering.lifecycle.state,
      reasons: [...offering.lifecycle.reasons],
    },
    readiness: {
      outcome: offering.readiness.outcome,
      ...(offering.readiness.observedAt === undefined ? {} : { observedAt: offering.readiness.observedAt }),
      ...(offering.readiness.validUntil === undefined ? {} : { validUntil: offering.readiness.validUntil }),
    },
    live: {
      available: offering.live.available,
      ...(offering.live.reason === undefined ? {} : { reason: offering.live.reason }),
    },
    currentStep: offering.currentStep,
    stepStates: { ...offering.stepStates },
    ...(offering.actionableReason === undefined ? {} : { actionableReason: offering.actionableReason }),
    ...(offering.publication === undefined ? {} : {
      publication: {
        publicationRef: offering.publication.publicationRef,
        publicationRevision: offering.publication.publicationRevision,
        operationRef: offering.publication.operationRef,
        state: offering.publication.state,
      },
    }),
  }
}

function isRecordLifecycle(value: unknown): value is { state: 'inactive' | 'active' | 'withdrawn' | 'incompatible'; reasons: string[] } {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof Reflect.get(value, 'state') === 'string' && Array.isArray(Reflect.get(value, 'reasons'))
}

const publishParameters: readonly ActionParameter[] = [
  { name: 'version', type: 'string', description: 'Versioned supply artifact contract.', required: true },
  { name: 'businessId', type: 'string', description: 'Owner business selected by the authenticated principal.', required: true },
  { name: 'offeringRef', type: 'string', description: 'Existing catalog offering reference.', required: true },
  { name: 'offeringRevision', type: 'number', description: 'Current catalog offering revision.', required: true },
  { name: 'offeringSourceHash', type: 'string', description: 'Current catalog offering source hash.', required: true },
  { name: 'source', type: 'object', description: 'Admitted owner publication source union.', required: true },
  { name: 'evidenceRefs', type: 'array', description: 'Durable source evidence references.', required: true },
  { name: 'idempotencyKey', type: 'string', description: 'Stable replay/conflict command identity.', required: true },
]
const maintenanceParameters: readonly ActionParameter[] = [
  { name: 'businessId', type: 'string', description: 'Owner business selected by the authenticated principal.', required: true },
  { name: 'offeringRef', type: 'string', description: 'Current catalog offering reference.', required: true },
  { name: 'offeringRevision', type: 'number', description: 'Current catalog offering revision.', required: true },
  { name: 'offeringSourceHash', type: 'string', description: 'Current catalog offering source hash.', required: true },
  { name: 'publicationRef', type: 'string', description: 'Exact current publication reference.', required: true },
  { name: 'publicationRevision', type: 'number', description: 'Exact current publication revision.', required: true },
  { name: 'idempotencyKey', type: 'string', description: 'Stable replay/conflict command identity.', required: true },
]
const connectionTransitionParameters: readonly ActionParameter[] = [
  { name: 'connectionRef', type: 'string', description: 'Exact provider connection reference.', required: true },
  { name: 'expectedAuthorityGeneration', type: 'number', description: 'Current authority generation returned by detail.', required: true },
  { name: 'expectedAuthorityDigest', type: 'string', description: 'Current authority digest returned by detail.', required: true },
  { name: 'reasonCode', type: 'string', description: 'Optional bounded lifecycle reason.', required: false },
  { name: 'evidenceRefs', type: 'array', description: 'Durable non-secret evidence references.', required: true },
  { name: 'idempotencyKey', type: 'string', description: 'Stable replay/conflict command identity.', required: true },
]
const supplyBoundaries = [
  `Requires an authenticated owner-bound ${MARKET_SUPPLY_MANAGE_SCOPE} credential.`,
  'Business ownership, lifecycle, source admission, current publication, prices, provider authority, and payment controls are resolved server-side.',
  'Credential and wallet secret material is refused before durable storage; provider authority selectors are revalidated server-side and never returned.',
] as const
const supplySurfaces = ['http', 'mcp', 'cli'] as const
const supplyCredentialAdmission = {
  scope: MARKET_SUPPLY_MANAGE_SCOPE,
  authority: 'descriptor_classified' as const,
}

export const supplyStatusAction = defineAction<SupplyStatusInput, SupplyStatusResult>({
  id: SUPPLY_ACTION_IDS.status,
  name: 'Inspect supplier Operation lifecycle',
  summary: 'List supplier Operations or inspect one exact offering lifecycle, readiness, publication, and next actionable state.',
  boundaries: supplyBoundaries,
  schema: supplyStatusInputSchema,
  outputSchema: supplyStatusResultSchema,
  parameters: [
    { name: 'businessId', type: 'string', description: 'Owner business selected by the authenticated principal.', required: true },
    { name: 'offeringRef', type: 'string', description: 'Optional exact offering reference.', required: false },
  ],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: {
    version: SUPPLY_ACTION_ROUTE_CONTRACTS.status.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: ['businessId', 'offeringRef'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['supplier_operation_lifecycle'],
    safeContinuations: ['supply.publish', 'supply.recheck', 'supply.withdraw', 'supply.republish'],
    invalidationConditions: ['business_changed', 'offering_changed', 'publication_revision_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.status({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyPublishAction = defineAction<SupplyPublishInput, SupplyPublishResult>({
  id: SUPPLY_ACTION_IDS.publish,
  name: 'Publish supplier capability',
  summary: 'Publish one admitted supplier capability from a standard artifact.',
  boundaries: supplyBoundaries,
  schema: supplyPublishInputSchema,
  outputSchema: supplyPublishResultSchema,
  parameters: publishParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'business', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'mandate_eligible' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.publish.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['version', 'businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash', 'source', 'evidenceRefs', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['source_publication', 'publication_identity'], safeContinuations: ['supply.status'], invalidationConditions: ['source_changed', 'offering_revision_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.publish({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyWithdrawAction = defineAction<SupplyWithdrawInput, SupplyWithdrawResult>({
  id: SUPPLY_ACTION_IDS.withdraw,
  name: 'Withdraw supplier capability',
  summary: 'Withdraw one exact current supplier publication without cancelling running work.',
  boundaries: supplyBoundaries,
  schema: supplyWithdrawInputSchema,
  outputSchema: supplyWithdrawResultSchema,
  parameters: maintenanceParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'business', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'mandate_eligible' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.withdraw.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash', 'publicationRef', 'publicationRevision', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['withdrawal_identity'], safeContinuations: ['supply.status', 'supply.republish'], invalidationConditions: ['publication_ref_changed', 'publication_revision_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.withdraw({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyRecheckAction = defineAction<SupplyRecheckInput, SupplyRecheckResult>({
  id: SUPPLY_ACTION_IDS.recheck,
  name: 'Recheck supplier capability',
  summary: 'Schedule readiness revalidation for one exact current supplier publication.',
  boundaries: supplyBoundaries,
  schema: supplyRecheckInputSchema,
  outputSchema: supplyRecheckResultSchema,
  parameters: maintenanceParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'provider_system', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'mandate_eligible' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.recheck.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash', 'publicationRef', 'publicationRevision', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['readiness_recheck_scheduled'], safeContinuations: ['supply.status'], invalidationConditions: ['publication_ref_changed', 'publication_revision_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.recheck({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyRepublishAction = defineAction<SupplyRepublishInput, SupplyRepublishResult>({
  id: SUPPLY_ACTION_IDS.republish,
  name: 'Republish supplier capability',
  summary: 'Republish one exact withdrawn supplier publication from admitted durable material.',
  boundaries: supplyBoundaries,
  schema: supplyRepublishInputSchema,
  outputSchema: supplyRepublishResultSchema,
  parameters: maintenanceParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'business', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'mandate_eligible' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.republish.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash', 'publicationRef', 'publicationRevision', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['publication_identity'], safeContinuations: ['supply.status'], invalidationConditions: ['publication_ref_changed', 'publication_revision_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.republish({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyEarningsAction = defineAction<SupplyEarningsInput, SupplyEarningsResult>({
  id: SUPPLY_ACTION_IDS.earnings,
  name: 'Read supplier earnings',
  summary: 'Read exact provider earnings and payout status for one currency.',
  boundaries: supplyBoundaries,
  schema: supplyEarningsInputSchema,
  outputSchema: supplyEarningsResultSchema,
  parameters: [{ name: 'currency', type: 'string', description: 'ISO-like uppercase ledger currency.', required: true }],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.earnings.contractVersion, consequenceClass: 'read_only', materialInputPaths: ['currency'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['earnings_projection'], safeContinuations: ['supply.status'], invalidationConditions: ['currency_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.earnings({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionListAction = defineAction<SupplyConnectionListInput, SupplyConnectionListResult>({
  id: SUPPLY_ACTION_IDS.connectionList,
  name: 'List supplier provider connections',
  summary: 'List the bounded provider connections owned by one supplier business, including lifecycle and recovery state.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionListInputSchema,
  outputSchema: supplyConnectionListResultSchema,
  parameters: [
    { name: 'businessId', type: 'string', description: 'Owner business selected by the authenticated principal.', required: true },
    { name: 'lifecycle', type: 'enum', description: 'Optional exact connection lifecycle filter.', required: false, enum: providerConnectionLifecycleSchema.options },
    { name: 'limit', type: 'number', description: 'Bounded result limit from 1 through 100.', required: false },
  ],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionList.contractVersion, consequenceClass: 'read_only', materialInputPaths: ['businessId', 'lifecycle', 'limit'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['provider_connection_collection'], safeContinuations: ['supply.connection.detail', 'supply.connection.connect'], invalidationConditions: ['business_changed', 'lifecycle_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionList({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionDetailAction = defineAction<SupplyConnectionDetailInput, SupplyConnectionDetailResult>({
  id: SUPPLY_ACTION_IDS.connectionDetail,
  name: 'Inspect supplier provider connection',
  summary: 'Inspect one exact provider connection, its current concurrency identity, availability, and recovery state without exposing credentials.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionDetailInputSchema,
  outputSchema: supplyConnectionDetailResultSchema,
  parameters: [{ name: 'connectionRef', type: 'string', description: 'Exact provider connection reference.', required: true }],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionDetail.contractVersion, consequenceClass: 'read_only', materialInputPaths: ['connectionRef'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['provider_connection_state'], safeContinuations: ['supply.connection.reconnect', 'supply.connection.revoke', 'supply.connection.retryCleanup'], invalidationConditions: ['authority_generation_changed', 'authority_digest_changed', 'lifecycle_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionDetail({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionConnectAction = defineAction<SupplyConnectionConnectInput, SupplyConnectionCommandResult>({
  id: SUPPLY_ACTION_IDS.connectionConnect,
  name: 'Connect supplier x402 endpoint',
  summary: 'Create or replay one credentialless x402 provider connection for a published supplier business.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionConnectInputSchema,
  outputSchema: supplyConnectionCommandResultSchema,
  parameters: [
    { name: 'businessId', type: 'string', description: 'Owner business selected by the authenticated principal.', required: true },
    { name: 'resourceUrl', type: 'string', description: 'Public HTTPS x402 resource URL without a fragment.', required: true },
    { name: 'evidenceRefs', type: 'array', description: 'Durable non-secret evidence references.', required: true },
    { name: 'idempotencyKey', type: 'string', description: 'Stable replay/conflict command identity.', required: true },
  ],
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'provider_system', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'mandate_eligible' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionConnect.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['businessId', 'resourceUrl', 'evidenceRefs', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['provider_connection_identity'], safeContinuations: ['supply.connection.detail', 'supply.publish'], invalidationConditions: ['business_changed', 'resource_url_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionConnect({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionReconnectAction = defineAction<SupplyConnectionTransitionInput, SupplyConnectionCommandResult>({
  id: SUPPLY_ACTION_IDS.connectionReconnect,
  name: 'Reconnect supplier provider connection',
  summary: 'Refresh one exact provider connection only when its authority generation and digest are still current.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionTransitionInputSchema,
  outputSchema: supplyConnectionCommandResultSchema,
  parameters: connectionTransitionParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'provider_system', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'mandate_eligible' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionReconnect.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['connectionRef', 'expectedAuthorityGeneration', 'expectedAuthorityDigest', 'reasonCode', 'evidenceRefs', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['provider_connection_authority'], safeContinuations: ['supply.connection.detail', 'supply.recheck'], invalidationConditions: ['authority_generation_changed', 'authority_digest_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionReconnect({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionRevokeAction = defineAction<SupplyConnectionTransitionInput, SupplyConnectionCommandResult>({
  id: SUPPLY_ACTION_IDS.connectionRevoke,
  name: 'Revoke supplier provider connection',
  summary: 'Begin revocation for one exact current provider connection, invalidate active leases, and schedule cleanup.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionTransitionInputSchema,
  outputSchema: supplyConnectionCommandResultSchema,
  parameters: connectionTransitionParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: false, recipientKind: 'provider_system', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'mandate_eligible' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionRevoke.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['connectionRef', 'expectedAuthorityGeneration', 'expectedAuthorityDigest', 'reasonCode', 'evidenceRefs', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'reconcile_before_retry', expectedEvidence: ['provider_connection_revocation'], safeContinuations: ['supply.connection.detail', 'supply.connection.retryCleanup'], invalidationConditions: ['authority_generation_changed', 'authority_digest_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionRevoke({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionRetryCleanupAction = defineAction<SupplyConnectionRetryCleanupInput, SupplyConnectionCommandResult>({
  id: SUPPLY_ACTION_IDS.connectionRetryCleanup,
  name: 'Retry supplier connection cleanup',
  summary: 'Resume cleanup only for a revocation whose persisted callback grace has elapsed and no cleanup work is active.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionRetryCleanupInputSchema,
  outputSchema: supplyConnectionCommandResultSchema,
  parameters: [
    { name: 'connectionRef', type: 'string', description: 'Exact provider connection reference.', required: true },
    { name: 'idempotencyKey', type: 'string', description: 'Stable replay/conflict command identity.', required: true },
  ],
  readOnly: false,
  effect: { class: 'external_state_change', reversible: false, recipientKind: 'provider_system', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'mandate_eligible' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionRetryCleanup.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['connectionRef', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['provider_connection_cleanup_work'], safeContinuations: ['supply.connection.detail'], invalidationConditions: ['lifecycle_changed', 'cleanup_work_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionRetryCleanup({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})
