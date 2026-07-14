import { v, type Infer } from 'convex/values'

import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import { openCapabilityDecisionModel, sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  compilePreparedActionOptions,
  type PreparedActionOptionCandidate,
  type PreparedActionV2,
} from '@/modules/customer-request/public'
import {
  actionPreparationLineageV2Value, preparedActionRecoveryReasonV2Value, preparedActionV2Value,
} from '@/modules/customer-request/runtime'

import type { Doc } from './_generated/dataModel'
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'
import {
  aggregateIntegrityValid,
  allocationIntegrityValid,
  operationIntegrityValid,
  preparationIntegrityValid,
  verifiedPreparationAuthority,
} from './customerRequestV2PreparationEgressState'

const resultValue = v.union(
  v.object({ kind: v.literal('prepared'), preparedAction: preparedActionV2Value }),
  v.object({
    kind: v.literal('not_prepared'), reason: preparedActionRecoveryReasonV2Value, recoveryRef: v.string(),
  }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(v.literal('idempotency_key_reused'), v.literal('prepared_action_material_changed')),
  }),
)
type Result = Infer<typeof resultValue>

export const preparationMaterialDigest = internalQuery({
  args: { preparationRef: v.string(), principalId: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const preparation = await ctx.db.query('customerRequestV2ActionPreparations')
      .withIndex('by_preparationRef', (query) => query.eq('preparationRef', args.preparationRef)).unique()
    if (preparation === null || preparation.lineage.principalId !== args.principalId) {
      throw new Error('customer_request_v2_prepared_action_preparation_not_found')
    }
    const operations = await ctx.db.query('customerRequestV2PreparationEgressOperations')
      .withIndex('by_preparationRef', (query) => query.eq('preparationRef', args.preparationRef)).take(65)
    if (operations.length > 64) throw new Error('customer_request_v2_prepared_action_operation_limit_exceeded')
    return terminalMaterialDigest(preparation.preparationDigest, operations)
  },
})

export const prepare = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(),
    preparationRef: v.string(), preparationMaterialDigest: v.string(), now: v.number(),
  },
  returns: resultValue,
  handler: async (ctx, args): Promise<Result> => {
    const replay = await ctx.db.query('customerRequestV2PreparedActionCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
    let preparedReplay: Doc<'customerRequestV2PreparedActionCommands'> | null = null
    if (replay !== null) {
      if (replay.commandDigest !== args.commandDigest || replay.principalId !== args.principalId
        || replay.preparationRef !== args.preparationRef) {
        return { kind: 'conflict', reason: 'idempotency_key_reused' }
      }
      if (replay.resultKind === 'not_prepared') return await replayResult(ctx.db, replay)
      preparedReplay = replay
    }

    const opened = await openExactPreparation(ctx.db, args.preparationRef, args.principalId)
    if (opened.kind !== 'ready') {
      return await recordRecovery(
        ctx.db, args, opened.lineage, opened.reason, opened.operationRefs, opened.evidenceRefs,
        preparedReplay === null,
      )
    }
    const { preparation, aggregate, operations, model } = opened
    if (terminalMaterialDigest(preparation.preparationDigest, operations) !== args.preparationMaterialDigest) {
      return { kind: 'conflict', reason: 'prepared_action_material_changed' }
    }
    const existing = await ctx.db.query('customerRequestV2PreparedActions')
      .withIndex('by_preparationRef', (query) => query.eq('preparationRef', args.preparationRef)).unique()
    if (existing !== null && existing.preparedAction.expiresAt <= args.now) {
      return await recordRecovery(
        ctx.db, args, preparation.lineage, 'provider_assertion_expired',
        operations.map(({ operationRef }) => operationRef),
        operations.flatMap(({ evidenceRef }) => evidenceRef === undefined ? [] : [evidenceRef]),
        preparedReplay === null,
      )
    }

    const candidates: PreparedActionOptionCandidate[] = []
    for (const operation of operations) {
      const candidate = await openCandidate(ctx.db, operation, preparation.lineage, model)
      if (candidate.kind !== 'ready') {
        return await recordRecovery(
          ctx.db, args, preparation.lineage, candidate.reason,
          operations.map(({ operationRef }) => operationRef), candidate.evidenceRefs, preparedReplay === null,
        )
      }
      candidates.push(candidate.candidate)
    }
    const preference = aggregate.evaluation.decisionPreference
    const selection = preference?.objective === 'lowest_maximum_price'
        ? {
            kind: 'lowest_maximum_price' as const,
            basis: 'customer_request' as const,
            evidenceRef: preference.evidenceRef,
          }
        : { kind: 'single_option' as const }
    const compiled = compilePreparedActionOptions({
      lineage: preparation.lineage,
      candidates,
      selection,
      now: existing?.preparedAction.preparedAt ?? args.now,
    })
    if (compiled.kind !== 'prepared') {
      return await recordRecovery(
        ctx.db, args, preparation.lineage, domainRecoveryReason(compiled.reason),
        operations.map(({ operationRef }) => operationRef),
        operations.flatMap(({ evidenceRef }) => evidenceRef === undefined ? [] : [evidenceRef]),
        preparedReplay === null,
      )
    }
    if (existing !== null) {
      if (existing.preparationRef !== args.preparationRef
        || existing.preparedActionRef !== existing.preparedAction.preparedActionRef
        || existing.preparedActionDigest !== existing.preparedAction.preparedActionDigest
        || !preparedActionIntegrityValid(existing.preparedAction)
        || existing.preparedActionDigest !== compiled.preparedAction.preparedActionDigest) {
        return { kind: 'conflict', reason: 'prepared_action_material_changed' }
      }
      if (preparedReplay === null) {
        await recordCommand(ctx.db, args, 'prepared', existing.preparedActionRef, existing.preparedActionDigest)
      }
      return { kind: 'prepared', preparedAction: existing.preparedAction }
    }
    if (preparedReplay !== null) throw new Error('customer_request_v2_prepared_action_replay_integrity_failure')
    const storedPreparedAction = writablePreparedAction(compiled.preparedAction)
    await ctx.db.insert('customerRequestV2PreparedActions', {
      preparedActionRef: compiled.preparedAction.preparedActionRef,
      preparedActionDigest: compiled.preparedAction.preparedActionDigest,
      preparationRef: preparation.preparationRef,
      requestId: preparation.lineage.requestId,
      requestRevision: preparation.lineage.requestRevision,
      actionId: preparation.lineage.actionId,
      lineage: preparation.lineage,
      preparedAction: storedPreparedAction,
      recordedAt: args.now,
    })
    await recordCommand(
      ctx.db, args, 'prepared', compiled.preparedAction.preparedActionRef, compiled.preparedAction.preparedActionDigest,
    )
    return { kind: 'prepared', preparedAction: storedPreparedAction }
  },
})

type OpenedPreparation =
  | Readonly<{
      kind: 'ready'
      preparation: Extract<Doc<'customerRequestV2ActionPreparations'>['preparation'], { kind: 'ready_for_routing' }>
      aggregate: Doc<'customerRequestV2Revisions'>['aggregate']
      operations: readonly Doc<'customerRequestV2PreparationEgressOperations'>[]
      model: ReturnType<typeof openCapabilityDecisionModel>
    }>
  | Readonly<{
      kind: 'not_ready'
      lineage: Doc<'customerRequestV2ActionPreparations'>['lineage']
      reason: 'options_pending' | 'disclosure_not_released' | 'disclosure_uncertain'
        | 'capability_authority_changed' | 'capability_graph_changed'
      operationRefs: readonly string[]
      evidenceRefs: readonly string[]
    }>

async function openExactPreparation(
  db: MutationCtx['db'], preparationRef: string, principalId: string,
): Promise<OpenedPreparation> {
  const row = await db.query('customerRequestV2ActionPreparations')
    .withIndex('by_preparationRef', (query) => query.eq('preparationRef', preparationRef)).unique()
  if (row === null || row.lineage.principalId !== principalId) {
    throw new Error('customer_request_v2_prepared_action_preparation_not_found')
  }
  const empty = { lineage: row.lineage, operationRefs: [] as string[], evidenceRefs: [] as string[] }
  if (row.preparation.kind !== 'ready_for_routing' || !preparationIntegrityValid(row.preparation)
    || row.preparationDigest !== row.preparation.preparationDigest) {
    return { kind: 'not_ready', reason: 'capability_authority_changed', ...empty }
  }
  if (!await verifiedPreparationAuthority(db, row.preparation)) {
    return { kind: 'not_ready', reason: 'capability_authority_changed', ...empty }
  }
  const head = await db.query('customerRequestV2Heads')
    .withIndex('by_requestId', (query) => query.eq('requestId', row.lineage.requestId)).unique()
  const revision = head === null ? null : await db.query('customerRequestV2Revisions')
    .withIndex('by_requestId_and_requestRevision', (query) => query
      .eq('requestId', row.lineage.requestId).eq('requestRevision', row.lineage.requestRevision)).unique()
  if (head === null || revision === null || head.currentRevision !== row.lineage.requestRevision
    || head.currentAggregateDigest !== revision.aggregate.aggregateDigest
    || !aggregateIntegrityValid(revision.aggregate)
    || revision.aggregate.plan.planDigest !== row.lineage.planDigest) {
    return { kind: 'not_ready', reason: 'capability_graph_changed', ...empty }
  }
  const action = revision.aggregate.plan.actions.find(({ actionId }) => actionId === row.lineage.actionId)
  if (action === undefined || !sameCapabilityContractRef(action.contractRef, row.lineage.contractRef)
    || action.selectionKey !== row.lineage.selectionKey || action.semanticDigest !== row.lineage.semanticDigest) {
    return { kind: 'not_ready', reason: 'capability_graph_changed', ...empty }
  }
  const operations = await db.query('customerRequestV2PreparationEgressOperations')
    .withIndex('by_preparationRef', (query) => query.eq('preparationRef', preparationRef)).take(65)
  if (operations.length > 64) throw new Error('customer_request_v2_prepared_action_operation_limit_exceeded')
  const operationRefs = operations.map(({ operationRef }) => operationRef).sort()
  const evidenceRefs = operations.flatMap(({ evidenceRef }) => evidenceRef === undefined ? [] : [evidenceRef]).sort()
  if (operations.some((operation) => !operationIntegrityValid(operation)
    || operation.preparationRef !== preparationRef
    || canonicalDigest(operation.lineage as StableHashValue) !== canonicalDigest(row.lineage as StableHashValue))) {
    throw new Error('customer_request_v2_prepared_action_operation_integrity_failure')
  }
  if (operations.length === 0 || operations.some(({ state }) => state === 'allocated' || state === 'dispatching')) {
    return { kind: 'not_ready', reason: 'options_pending', lineage: row.lineage, operationRefs, evidenceRefs }
  }
  if (operations.some(({ state }) => state === 'uncertain')) {
    return { kind: 'not_ready', reason: 'disclosure_uncertain', lineage: row.lineage, operationRefs, evidenceRefs }
  }
  const stored = await getActiveExactCapabilityContract(db, row.lineage.contractRef)
  if (stored.kind !== 'found') {
    return { kind: 'not_ready', reason: 'capability_authority_changed', lineage: row.lineage, operationRefs, evidenceRefs }
  }
  try {
    const model = openCapabilityDecisionModel(encodeCapabilityContractDocumentJson(stored.documentJson).contract)
    if (!sameCapabilityContractRef(model.contractRef, row.lineage.contractRef)
      || model.selectionKey !== row.lineage.selectionKey || model.semanticDigest !== row.lineage.semanticDigest) {
      return { kind: 'not_ready', reason: 'capability_authority_changed', lineage: row.lineage, operationRefs, evidenceRefs }
    }
    return { kind: 'ready', preparation: row.preparation, aggregate: revision.aggregate, operations, model }
  } catch {
    return { kind: 'not_ready', reason: 'capability_authority_changed', lineage: row.lineage, operationRefs, evidenceRefs }
  }
}

type CandidateResult =
  | Readonly<{ kind: 'ready'; candidate: PreparedActionOptionCandidate }>
  | Readonly<{
      kind: 'not_ready'
      reason: 'capability_graph_changed'
      evidenceRefs: readonly string[]
    }>

async function openCandidate(
  db: MutationCtx['db'],
  operation: Doc<'customerRequestV2PreparationEgressOperations'>,
  lineage: Doc<'customerRequestV2ActionPreparations'>['lineage'],
  model: ReturnType<typeof openCapabilityDecisionModel>,
): Promise<CandidateResult> {
  const evidenceRefs = operation.evidenceRef === undefined ? [] : [operation.evidenceRef]
  const [offering, binding, business] = await Promise.all([
    db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', operation.offeringId)).unique(),
    db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', operation.bindingId)).unique(),
    db.get(operation.businessId),
  ])
  if (offering === null || binding === null || business === null
    || business.publicStatus !== 'published' || business.claimStatus !== 'published'
    || offering.status !== 'active' || binding.admission !== 'admitted' || binding.conformance !== 'conformant'
    || offering.businessId !== operation.businessId || binding.offeringId !== offering.offeringId
    || offering.registrationHash !== operation.offeringRegistrationHash
    || binding.registrationHash !== operation.bindingRegistrationHash
    || !sameCapabilityContractRef(rowContractRef(offering), lineage.contractRef)
    || !sameCapabilityContractRef(rowContractRef(binding), lineage.contractRef)) {
    return { kind: 'not_ready', reason: 'capability_graph_changed', evidenceRefs }
  }
  const allocations = await db.query('customerRequestV2PreparationDisclosureAllocations')
    .withIndex('by_operationRef', (query) => query.eq('operationRef', operation.operationRef)).take(257)
  if (allocations.length > 256 || allocations.some((allocation) => !allocationIntegrityValid(allocation)
    || allocation.preparationRef !== operation.preparationRef
    || allocation.offeringRegistrationHash !== operation.offeringRegistrationHash
    || allocation.bindingRegistrationHash !== operation.bindingRegistrationHash)) {
    throw new Error('customer_request_v2_prepared_action_allocation_integrity_failure')
  }
  return {
    kind: 'ready',
    candidate: {
      operation: {
        operationRef: operation.operationRef,
        state: operation.state === 'released' ? 'released'
          : operation.state === 'uncertain' ? 'uncertain' : 'not_released',
        lineage: operation.lineage,
        authorityReference: operation.authorityReference, authorityScopeDigest: operation.authorityScopeDigest,
        ...(operation.responseStatus === undefined ? {} : { responseStatus: operation.responseStatus }),
        ...(operation.responseContentType === undefined ? {} : { responseContentType: operation.responseContentType }),
        ...(operation.responseBodyText === undefined ? {} : { responseBodyText: operation.responseBodyText }),
        ...(operation.responseBodyDigest === undefined ? {} : { responseBodyDigest: operation.responseBodyDigest }),
        ...(operation.evidenceRef === undefined ? {} : { releaseEvidenceRef: operation.evidenceRef }),
      },
      model,
      business: { businessId: String(operation.businessId), name: business.name },
      offering: {
        offeringId: offering.offeringId, registrationHash: offering.registrationHash,
        registrationEvidenceRefs: offering.registrationEvidenceRefs, presentation: offering.presentation,
      },
      binding: {
        bindingId: binding.bindingId, registrationHash: binding.registrationHash,
        registrationEvidenceRefs: binding.registrationEvidenceRefs, cancellation: binding.cancellation,
      },
      disclosure: {
        outcome: operation.state === 'released' ? 'released'
          : operation.state === 'uncertain' ? 'uncertain' : 'not_released',
        allocationRefs: allocations.map(({ allocationRef }) => allocationRef).sort(),
      },
    },
  }
}

async function recordRecovery(
  db: MutationCtx['db'],
  args: Readonly<{ commandKey: string; commandDigest: string; principalId: string; preparationRef: string; now: number }>,
  lineage: Infer<typeof actionPreparationLineageV2Value>,
  reason: Infer<typeof preparedActionRecoveryReasonV2Value>,
  operationRefs: readonly string[],
  evidenceRefs: readonly string[],
  persistCommand = true,
): Promise<Result> {
  const material = {
    preparationRef: args.preparationRef, lineage,
    reason, operationRefs: [...operationRefs].sort(), evidenceRefs: [...new Set(evidenceRefs)].sort(),
  }
  const recoveryDigest = canonicalDigest(material as StableHashValue)
  const recoveryRef = `prepared-action-recovery:${recoveryDigest}`
  const existing = await db.query('customerRequestV2PreparedActionRecoveries')
    .withIndex('by_recoveryRef', (query) => query.eq('recoveryRef', recoveryRef)).unique()
  if (existing === null) await db.insert('customerRequestV2PreparedActionRecoveries', {
    recoveryRef, recoveryDigest, ...material, observedAt: args.now,
  })
  else if (existing.recoveryDigest !== recoveryDigest || !recoveryIntegrityValid(existing)) {
    throw new Error('customer_request_v2_recovery_integrity_failure')
  }
  if (persistCommand) await recordCommand(db, args, 'not_prepared', recoveryRef, recoveryDigest)
  return { kind: 'not_prepared', reason, recoveryRef }
}

async function recordCommand(
  db: MutationCtx['db'],
  args: Readonly<{ commandKey: string; commandDigest: string; principalId: string; preparationRef: string; now: number }>,
  resultKind: 'prepared' | 'not_prepared', resultRef: string, resultDigest: string,
): Promise<void> {
  await db.insert('customerRequestV2PreparedActionCommands', {
    commandKey: args.commandKey, commandDigest: args.commandDigest, principalId: args.principalId,
    preparationRef: args.preparationRef, resultKind, resultRef, resultDigest, committedAt: args.now,
  })
}

async function replayResult(
  db: MutationCtx['db'], command: Doc<'customerRequestV2PreparedActionCommands'>,
): Promise<Result> {
  if (command.resultKind === 'prepared') {
    const row = await db.query('customerRequestV2PreparedActions')
      .withIndex('by_preparedActionRef', (query) => query.eq('preparedActionRef', command.resultRef)).unique()
    if (row === null || row.preparationRef !== command.preparationRef
      || row.preparedActionRef !== row.preparedAction.preparedActionRef
      || row.preparedActionDigest !== row.preparedAction.preparedActionDigest
      || row.preparedActionDigest !== command.resultDigest
      || !preparedActionIntegrityValid(row.preparedAction)) {
      throw new Error('customer_request_v2_prepared_action_replay_integrity_failure')
    }
    return { kind: 'prepared', preparedAction: row.preparedAction }
  }
  const recovery = await db.query('customerRequestV2PreparedActionRecoveries')
    .withIndex('by_recoveryRef', (query) => query.eq('recoveryRef', command.resultRef)).unique()
  if (recovery === null || recovery.preparationRef !== command.preparationRef
    || recovery.recoveryDigest !== command.resultDigest
    || !recoveryIntegrityValid(recovery)) {
    throw new Error('customer_request_v2_prepared_action_replay_integrity_failure')
  }
  return { kind: 'not_prepared', reason: recovery.reason, recoveryRef: recovery.recoveryRef }
}

function recoveryIntegrityValid(recovery: Doc<'customerRequestV2PreparedActionRecoveries'>): boolean {
  const material = {
    preparationRef: recovery.preparationRef,
    lineage: recovery.lineage,
    reason: recovery.reason,
    operationRefs: recovery.operationRefs,
    evidenceRefs: recovery.evidenceRefs,
  }
  return canonicalDigest(material as StableHashValue) === recovery.recoveryDigest
    && recovery.recoveryRef === `prepared-action-recovery:${recovery.recoveryDigest}`
}

function preparedActionIntegrityValid(action: Infer<typeof preparedActionV2Value>): boolean {
  const { preparedActionDigest, ...material } = action
  return new TextEncoder().encode(JSON.stringify(action)).byteLength <= 512 * 1024
    && canonicalDigest(material as StableHashValue) === preparedActionDigest
    && action.preparedActionRef.startsWith('prepared-action:v2:')
}

function writablePreparedAction(action: PreparedActionV2): Infer<typeof preparedActionV2Value> {
  return {
    format: action.format,
    preparedActionRef: action.preparedActionRef,
    preparedActionDigest: action.preparedActionDigest,
    lineage: { ...action.lineage, contractRef: { ...action.lineage.contractRef } },
    business: { ...action.business },
    offering: {
      ...action.offering,
      registrationEvidenceRefs: [...action.offering.registrationEvidenceRefs],
    },
    binding: {
      ...action.binding,
      registrationEvidenceRefs: [...action.binding.registrationEvidenceRefs],
    },
    providerAssertion: {
      ...action.providerAssertion,
      evidence: action.providerAssertion.evidence.map((evidence) => ({ ...evidence })),
    },
    price: {
      ...action.price,
      components: action.price.components.map((component) => ({
        ...component, evidenceRefs: [...component.evidenceRefs],
      })),
    },
    materialTerms: action.materialTerms.map((term) => ({ ...term })),
    commercialRelationship: {
      ...action.commercialRelationship,
      evidenceRefs: [...action.commercialRelationship.evidenceRefs],
    },
    cancellation: { ...action.cancellation, evidenceRefs: [...action.cancellation.evidenceRefs] },
    disclosure: { ...action.disclosure, allocationRefs: [...action.disclosure.allocationRefs] },
    comparison: action.comparison.kind === 'single_option'
      ? { ...action.comparison }
      : { ...action.comparison, comparedAssertionRefs: [...action.comparison.comparedAssertionRefs] },
    alternatives: action.alternatives.map((alternative) => ({
      ...alternative,
      evidence: alternative.evidence.map((evidence) => ({ ...evidence })),
      business: { ...alternative.business },
      offeringRegistrationEvidenceRefs: [...alternative.offeringRegistrationEvidenceRefs],
      bindingRegistrationEvidenceRefs: [...alternative.bindingRegistrationEvidenceRefs],
      price: {
        ...alternative.price,
        components: alternative.price.components.map((component) => ({
          ...component, evidenceRefs: [...component.evidenceRefs],
        })),
      },
      materialTerms: alternative.materialTerms.map((term) => ({ ...term })),
      commercialRelationship: {
        ...alternative.commercialRelationship,
        evidenceRefs: [...alternative.commercialRelationship.evidenceRefs],
      },
      cancellation: {
        ...alternative.cancellation,
        evidenceRefs: [...alternative.cancellation.evidenceRefs],
      },
      disclosure: { ...alternative.disclosure, allocationRefs: [...alternative.disclosure.allocationRefs] },
    })),
    fallbacks: action.fallbacks.map((fallback) => ({
      ...fallback,
      business: { ...fallback.business },
      offeringRegistrationEvidenceRefs: [...fallback.offeringRegistrationEvidenceRefs],
      bindingRegistrationEvidenceRefs: [...fallback.bindingRegistrationEvidenceRefs],
      commercialRelationship: {
        ...fallback.commercialRelationship,
        evidenceRefs: [...fallback.commercialRelationship.evidenceRefs],
      },
      allocationRefs: [...fallback.allocationRefs],
      evidenceRefs: [...fallback.evidenceRefs],
    })),
    preparedAt: action.preparedAt,
    expiresAt: action.expiresAt,
  }
}

function domainRecoveryReason(
  reason: Exclude<ReturnType<typeof compilePreparedActionOptions>, { kind: 'prepared' }>['reason'],
): Infer<typeof preparedActionRecoveryReasonV2Value> {
  return reason
}

function rowContractRef(row: Readonly<{
  capabilityId: string; version: number; contractDigest: string
}>) {
  return { capabilityId: row.capabilityId, version: row.version, contractDigest: row.contractDigest }
}

function terminalMaterialDigest(
  preparationDigest: string,
  operations: readonly Doc<'customerRequestV2PreparationEgressOperations'>[],
): string {
  return canonicalDigest({
    preparationDigest,
    operations: operations.map((operation) => ({
      operationRef: operation.operationRef,
      state: operation.state,
      ...(operation.evidenceRef === undefined ? {} : { evidenceRef: operation.evidenceRef }),
      ...(operation.responseStatus === undefined ? {} : { responseStatus: operation.responseStatus }),
      ...(operation.responseContentType === undefined ? {} : { responseContentType: operation.responseContentType }),
      ...(operation.responseBodyDigest === undefined ? {} : { responseBodyDigest: operation.responseBodyDigest }),
      offeringRegistrationHash: operation.offeringRegistrationHash,
      bindingRegistrationHash: operation.bindingRegistrationHash,
    })).sort((left, right) => left.operationRef.localeCompare(right.operationRef)),
  } as StableHashValue)
}
