import { v, type Infer } from 'convex/values'

import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  approvalGrantV2Digest,
  issueApprovalGrantV2,
  type ApprovalGrantV2,
} from '@/modules/customer-request/public'
import { approvalGrantV2Value } from '@/modules/customer-request/runtime'

import type { Doc } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { getEligibleExactCapabilitySupply } from './capabilitySupply'
import {
  aggregateIntegrityValid,
  preparationIntegrityValid,
  verifiedPreparationAuthority,
} from './customerRequestV2PreparationEgressState'

const actorValue = v.object({
  kind: v.literal('clerk_owner'), requestPrincipalId: v.string(), ownerId: v.string(),
  credentialId: v.string(), authenticationEvidenceRef: v.string(),
})
const resultValue = v.union(
  v.object({ kind: v.union(v.literal('issued'), v.literal('replayed')), approvalGrant: approvalGrantV2Value }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(v.literal('idempotency_key_reused'), v.literal('approval_material_changed')),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('prepared_action_not_found'), v.literal('prepared_action_expired'),
      v.literal('spend_scope_invalid'), v.literal('expiry_scope_invalid'),
      v.literal('approval_material_invalid'), v.literal('capability_authority_changed'),
    ),
  }),
)
type Result = Infer<typeof resultValue>

export const issue = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(),
    expectedRequestId: v.string(), expectedRequestRevision: v.number(),
    preparedActionRef: v.string(), maximumSpendMinor: v.number(), expiresAt: v.number(),
    actor: actorValue, now: v.number(),
  },
  returns: resultValue,
  handler: async (ctx, args): Promise<Result> => {
    const replay = await ctx.db.query('customerRequestV2ApprovalGrantCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
    if (replay !== null) {
      if (replay.commandDigest !== args.commandDigest || replay.principalId !== args.principalId
        || replay.requestId !== args.expectedRequestId || replay.requestRevision !== args.expectedRequestRevision
        || replay.preparedActionRef !== args.preparedActionRef) {
        return { kind: 'conflict', reason: 'idempotency_key_reused' }
      }
      return { kind: 'replayed', approvalGrant: await replayGrant(ctx.db, replay) }
    }

    const opened = await openExactApprovalMaterial(ctx.db, {
      preparedActionRef: args.preparedActionRef,
      principalId: args.principalId,
      expectedRequestId: args.expectedRequestId,
      expectedRequestRevision: args.expectedRequestRevision,
    })
    if (opened.kind !== 'ready') return opened
    const issued = issueApprovalGrantV2({
      preparedAction: opened.preparedAction,
      contract: opened.contract,
      preparation: {
        reviewRef: opened.preparation.disclosureReview.reviewRef,
        reviewDigest: opened.preparation.disclosureReview.reviewDigest,
        authorityScopeDigest: opened.preparation.authorityScope.authorityScopeDigest,
      },
      actor: args.actor,
      maximumSpendMinor: args.maximumSpendMinor,
      expiresAt: args.expiresAt,
      now: args.now,
    })
    if (issued.kind !== 'issued') return issued

    const existing = await ctx.db.query('customerRequestV2ApprovalGrants')
      .withIndex('by_preparedActionRef', (query) => query.eq('preparedActionRef', args.preparedActionRef)).unique()
    if (existing !== null) {
      if (!approvalGrantRowIntegrityValid(existing)
        || existing.approvalGrantDigest !== issued.approvalGrant.approvalGrantDigest) {
        return { kind: 'conflict', reason: 'approval_material_changed' }
      }
      await recordCommand(ctx.db, args, existing.approvalGrantRef, existing.approvalGrantDigest)
      return { kind: 'replayed', approvalGrant: existing.approvalGrant }
    }

    const grant = writableApprovalGrant(issued.approvalGrant)
    await ctx.db.insert('customerRequestV2ApprovalGrants', {
      approvalGrantRef: grant.approvalGrantRef,
      approvalGrantDigest: grant.approvalGrantDigest,
      preparedActionRef: grant.preparedAction.preparedActionRef,
      preparedActionDigest: grant.preparedAction.preparedActionDigest,
      requestId: grant.lineage.requestId,
      requestRevision: grant.lineage.requestRevision,
      actionId: grant.lineage.actionId,
      principalId: grant.lineage.principalId,
      approvalGrant: grant,
      recordedAt: args.now,
    })
    await recordCommand(ctx.db, args, grant.approvalGrantRef, grant.approvalGrantDigest)
    return { kind: 'issued', approvalGrant: grant }
  },
})

type OpenedApprovalMaterial =
  | Readonly<{
      kind: 'ready'
      preparedAction: Doc<'customerRequestV2PreparedActions'>['preparedAction']
      preparation: Doc<'customerRequestV2ActionPreparations'>['preparation']
      contract: ReturnType<typeof encodeCapabilityContractDocumentJson>['contract']
    }>
  | Readonly<{
      kind: 'refused'
      reason: 'prepared_action_not_found' | 'capability_authority_changed'
    }>

async function openExactApprovalMaterial(
  db: MutationCtx['db'],
  expected: Readonly<{
    preparedActionRef: string; principalId: string; expectedRequestId: string; expectedRequestRevision: number
  }>,
): Promise<OpenedApprovalMaterial> {
  const row = await db.query('customerRequestV2PreparedActions')
    .withIndex('by_preparedActionRef', (query) => query.eq('preparedActionRef', expected.preparedActionRef)).unique()
  if (row === null || row.lineage.principalId !== expected.principalId
    || row.requestId !== expected.expectedRequestId || row.requestRevision !== expected.expectedRequestRevision
    || row.lineage.requestId !== expected.expectedRequestId
    || row.lineage.requestRevision !== expected.expectedRequestRevision
    || row.preparedActionRef !== row.preparedAction.preparedActionRef
    || row.preparedActionDigest !== row.preparedAction.preparedActionDigest) {
    return { kind: 'refused', reason: 'prepared_action_not_found' }
  }
  const head = await db.query('customerRequestV2Heads')
    .withIndex('by_requestId', (query) => query.eq('requestId', row.requestId)).unique()
  const revision = head === null ? null : await db.query('customerRequestV2Revisions')
    .withIndex('by_requestId_and_requestRevision', (query) => query
      .eq('requestId', row.requestId).eq('requestRevision', row.requestRevision)).unique()
  if (head === null || revision === null || head.currentRevision !== row.requestRevision
    || head.currentAggregateDigest !== revision.aggregate.aggregateDigest
    || !aggregateIntegrityValid(revision.aggregate)
    || row.lineage.planDigest !== revision.aggregate.plan.planDigest) {
    return { kind: 'refused', reason: 'capability_authority_changed' }
  }
  const action = revision.aggregate.plan.actions.find(({ actionId }) => actionId === row.actionId)
  if (action === undefined || !sameCapabilityContractRef(action.contractRef, row.lineage.contractRef)
    || action.selectionKey !== row.lineage.selectionKey || action.semanticDigest !== row.lineage.semanticDigest) {
    return { kind: 'refused', reason: 'capability_authority_changed' }
  }
  const preparationRow = await db.query('customerRequestV2ActionPreparations')
    .withIndex('by_preparationRef', (query) => query.eq('preparationRef', row.preparationRef)).unique()
  if (preparationRow === null || preparationRow.preparation.kind !== 'ready_for_routing'
    || !preparationIntegrityValid(preparationRow.preparation)
    || !preparationApprovalMaterialIntegrityValid(preparationRow.preparation)
    || preparationRow.preparationDigest !== preparationRow.preparation.preparationDigest
    || canonicalDigest(preparationRow.lineage as StableHashValue) !== canonicalDigest(row.lineage as StableHashValue)
    || preparationRow.preparation.authorityScope.authorityScopeDigest !== row.preparedAction.disclosure.authorityScopeDigest
    || !await verifiedPreparationAuthority(db, preparationRow.preparation)) {
    return { kind: 'refused', reason: 'capability_authority_changed' }
  }
  const eligible = await getEligibleExactCapabilitySupply(db, {
    networkId: revision.aggregate.snapshot.networkId,
    businessId: row.preparedAction.business.businessId,
    offeringId: row.preparedAction.offering.offeringId,
    bindingId: row.preparedAction.binding.bindingId,
    contractRef: row.lineage.contractRef,
    expectedOfferingRegistrationHash: row.preparedAction.offering.registrationHash,
    expectedBindingRegistrationHash: row.preparedAction.binding.registrationHash,
  })
  if (eligible.kind !== 'available') {
    return { kind: 'refused', reason: 'capability_authority_changed' }
  }
  let contract: ReturnType<typeof encodeCapabilityContractDocumentJson>['contract']
  try {
    contract = encodeCapabilityContractDocumentJson(eligible.contract.documentJson).contract
  } catch {
    return { kind: 'refused', reason: 'capability_authority_changed' }
  }
  if (canonicalDigest(eligible.offering.registrationEvidenceRefs as StableHashValue)
      !== canonicalDigest(row.preparedAction.offering.registrationEvidenceRefs as StableHashValue)
    || canonicalDigest(eligible.binding.registrationEvidenceRefs as StableHashValue)
      !== canonicalDigest(row.preparedAction.binding.registrationEvidenceRefs as StableHashValue)) {
    return { kind: 'refused', reason: 'capability_authority_changed' }
  }
  return { kind: 'ready', preparedAction: row.preparedAction, preparation: preparationRow.preparation, contract }
}

async function recordCommand(
  db: MutationCtx['db'],
  args: Readonly<{
    commandKey: string; commandDigest: string; principalId: string
    expectedRequestId: string; expectedRequestRevision: number; preparedActionRef: string; now: number
  }>,
  resultRef: string,
  resultDigest: string,
): Promise<void> {
  await db.insert('customerRequestV2ApprovalGrantCommands', {
    commandKey: args.commandKey, commandDigest: args.commandDigest, principalId: args.principalId,
    requestId: args.expectedRequestId, requestRevision: args.expectedRequestRevision,
    preparedActionRef: args.preparedActionRef, resultRef, resultDigest, committedAt: args.now,
  })
}

async function replayGrant(
  db: MutationCtx['db'], command: Doc<'customerRequestV2ApprovalGrantCommands'>,
): Promise<Doc<'customerRequestV2ApprovalGrants'>['approvalGrant']> {
  const row = await db.query('customerRequestV2ApprovalGrants')
    .withIndex('by_approvalGrantRef', (query) => query.eq('approvalGrantRef', command.resultRef)).unique()
  if (row === null || row.preparedActionRef !== command.preparedActionRef
    || row.requestId !== command.requestId || row.requestRevision !== command.requestRevision
    || row.approvalGrantDigest !== command.resultDigest || !approvalGrantRowIntegrityValid(row)) {
    throw new Error('customer_request_v2_approval_grant_replay_integrity_failure')
  }
  return row.approvalGrant
}

function approvalGrantRowIntegrityValid(row: Doc<'customerRequestV2ApprovalGrants'>): boolean {
  return row.approvalGrantRef === row.approvalGrant.approvalGrantRef
    && row.approvalGrantDigest === row.approvalGrant.approvalGrantDigest
    && row.preparedActionRef === row.approvalGrant.preparedAction.preparedActionRef
    && row.preparedActionDigest === row.approvalGrant.preparedAction.preparedActionDigest
    && row.requestId === row.approvalGrant.lineage.requestId
    && row.requestRevision === row.approvalGrant.lineage.requestRevision
    && row.actionId === row.approvalGrant.lineage.actionId
    && row.principalId === row.approvalGrant.lineage.principalId
    && approvalGrantV2Digest(row.approvalGrant) === row.approvalGrantDigest
    && row.approvalGrantRef.startsWith('approval-grant:v2:')
}

function preparationApprovalMaterialIntegrityValid(
  preparation: Extract<Doc<'customerRequestV2ActionPreparations'>['preparation'], { kind: 'ready_for_routing' }>,
): boolean {
  const review = preparation.disclosureReview
  const { reviewRef: _reviewRef, reviewDigest: _reviewDigest, ...reviewMaterial } = review
  const authorityScope = preparation.authorityScope
  const { authorityScopeDigest: _authorityScopeDigest, ...authorityScopeMaterial } = authorityScope
  return canonicalDigest(reviewMaterial as StableHashValue) === review.reviewDigest
    && review.reviewRef === `action-preparation-review:${review.reviewDigest}`
    && canonicalDigest(review.lineage as StableHashValue) === canonicalDigest(preparation.lineage as StableHashValue)
    && canonicalDigest(authorityScopeMaterial as StableHashValue) === authorityScope.authorityScopeDigest
    && review.limits.maximumRecipients === authorityScope.limits.maximumRecipients
    && review.limits.maximumExposures === authorityScope.limits.maximumExposures
    && review.limits.maximumOperations === authorityScope.limits.maximumOperations
}

function writableApprovalGrant(grant: ApprovalGrantV2): Infer<typeof approvalGrantV2Value> {
  return {
    format: grant.format,
    approvalGrantRef: grant.approvalGrantRef,
    approvalGrantDigest: grant.approvalGrantDigest,
    preparedAction: { ...grant.preparedAction },
    lineage: { ...grant.lineage, contractRef: { ...grant.lineage.contractRef } },
    capability: { ...grant.capability, contractRef: { ...grant.capability.contractRef } },
    supply: {
      businessId: grant.supply.businessId,
      offering: {
        ...grant.supply.offering,
        registrationEvidenceRefs: [...grant.supply.offering.registrationEvidenceRefs],
      },
      binding: {
        ...grant.supply.binding,
        registrationEvidenceRefs: [...grant.supply.binding.registrationEvidenceRefs],
      },
    },
    providerAssertion: { ...grant.providerAssertion },
    spend: { ...grant.spend },
    disclosure: { ...grant.disclosure },
    dataScope: grant.dataScope.map((declaration) => ({
      ...declaration,
      recipient: { ...declaration.recipient },
      purposes: [...declaration.purposes],
    })),
    effectScope: grant.effectScope.map((effect) => ({ ...effect })),
    evidenceScope: grant.evidenceScope.map((evidence) => ({ ...evidence })),
    scopeDigest: grant.scopeDigest,
    recovery: {
      unknownOutcome: grant.recovery.unknownOutcome,
      automaticRetry: grant.recovery.automaticRetry,
      registeredLifecycle: { ...grant.recovery.registeredLifecycle },
    },
    actor: { ...grant.actor },
    issuedAt: grant.issuedAt,
    expiresAt: grant.expiresAt,
  }
}
