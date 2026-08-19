import { z } from 'zod'
import type { FunctionReference, FunctionReturnType } from 'convex/server'

import {
  callPublicSourceMutation,
  sourceMutation,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
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

export type SupplyManagementService = Readonly<{
  publish(input: Readonly<{ input: SupplyPublishInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyPublishResult>
  withdraw(input: Readonly<{ input: SupplyWithdrawInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyWithdrawResult>
  earnings(input: Readonly<{ input: SupplyEarningsInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyEarningsResult>
}>

const supplyReadMutation = sourceMutation<Record<string, unknown>, OwnerSupplyFunnelReadback>('capabilitySupplyOwnerFunnel:readAgentOwnerSupplyFunnel')
type OwnerPublicationReservationResult =
  | { kind: 'reserved' }
  | { kind: 'replayed' }
  | { kind: 'refused'; reason: string }
const publishReservationMutation = sourceMutation<Record<string, unknown>, OwnerPublicationReservationResult>('capabilitySupplyOwnerFunnel:reserveOwnerCapabilityPublication')
const publishMutation = sourceMutation<Record<string, unknown>, PublishPreparedCapabilityCommandResult>('capabilitySupply:publishPreparedCapability')
const withdrawMutation = sourceMutation<Record<string, unknown>, OwnerSupplyCommandResult>('capabilitySupplyOwnerFunnel:withdrawOwnerCapability')
const earningsReadMutation = sourceMutation<Record<string, unknown>, OwnerProviderEarningsReadback>('moneyLedger:readAgentProviderEarnings')

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
  return { publish, withdraw, earnings }
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
const supplyBoundaries = ['Requires the authenticated owner-bound market_supply:manage scope.', 'Business ownership, lifecycle, source admission, current publication, prices, provider authority, and payment controls are resolved server-side.', 'Credential and wallet secret material is refused before durable storage; provider authority selectors are revalidated server-side and never returned.'] as const

export const supplyPublishAction = defineAction<SupplyPublishInput, SupplyPublishResult>({ id: 'supply.publish', name: 'Publish supplier capability', summary: 'Publish one admitted supplier capability from a standard artifact.', boundaries: supplyBoundaries, schema: supplyPublishInputSchema, outputSchema: supplyPublishResultSchema, parameters: publishParameters, readOnly: false, effect: { class: 'external_state_change', reversible: true, recipientKind: 'business', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'mandate_eligible' }, surfaces: ['mcp', 'cli'], credentialAdmission: { scope: 'market_supply:manage', authority: 'descriptor_classified' }, invocationContract: { version: 'supply-publication:v1', consequenceClass: 'external_effect', materialInputPaths: ['version', 'businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash', 'source', 'evidenceRefs', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['source_publication', 'publication_identity'], safeContinuations: [], invalidationConditions: ['source_changed', 'offering_revision_changed', 'idempotency_key_changed'] }, run: async ({ data, context }) => { if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing'); if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable'); return await context.supplyManagementService.publish({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() }) } })
export const supplyWithdrawAction = defineAction<SupplyWithdrawInput, SupplyWithdrawResult>({ id: 'supply.withdraw', name: 'Withdraw supplier capability', summary: 'Withdraw one exact current supplier publication without cancelling running work.', boundaries: supplyBoundaries, schema: supplyWithdrawInputSchema, outputSchema: supplyWithdrawResultSchema, parameters: maintenanceParameters, readOnly: false, effect: { class: 'external_state_change', reversible: true, recipientKind: 'business', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'mandate_eligible' }, surfaces: ['mcp', 'cli'], credentialAdmission: { scope: 'market_supply:manage', authority: 'descriptor_classified' }, invocationContract: { version: 'supply-withdrawal:v1', consequenceClass: 'external_effect', materialInputPaths: ['businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash', 'publicationRef', 'publicationRevision', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['withdrawal_identity'], safeContinuations: [], invalidationConditions: ['publication_ref_changed', 'publication_revision_changed', 'idempotency_key_changed'] }, run: async ({ data, context }) => { if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing'); if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable'); return await context.supplyManagementService.withdraw({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() }) } })
export const supplyEarningsAction = defineAction<SupplyEarningsInput, SupplyEarningsResult>({ id: 'supply.earnings', name: 'Read supplier earnings', summary: 'Read exact provider earnings and payout status for one currency.', boundaries: supplyBoundaries, schema: supplyEarningsInputSchema, outputSchema: supplyEarningsResultSchema, parameters: [{ name: 'currency', type: 'string', description: 'ISO-like uppercase ledger currency.', required: true }], readOnly: true, effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' }, surfaces: ['mcp', 'cli'], credentialAdmission: { scope: 'market_supply:manage', authority: 'descriptor_classified' }, invocationContract: { version: 'supply-earnings:v1', consequenceClass: 'read_only', materialInputPaths: ['currency'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['earnings_projection'], safeContinuations: [], invalidationConditions: ['currency_changed'] }, run: async ({ data, context }) => { if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing'); if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable'); return await context.supplyManagementService.earnings({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() }) } })
