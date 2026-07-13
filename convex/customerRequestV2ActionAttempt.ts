import { v, type Infer } from 'convex/values'

import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  actionAttemptV2Digest,
  actionAuthorityBudgetV2Digest,
  actionAuthorityBudgetV2Ref,
  admitActionAttemptV2,
  approvalGrantV2Digest,
  type ActionAttemptAdmissionBundleV2,
  type ActionAttemptV2,
  type ActionAuthorityBudgetV2,
} from '@/modules/customer-request/public'
import { actionAttemptV2Value } from '@/modules/customer-request/runtime'

import type { Doc } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { openExactApprovalGrantForAdmission } from './customerRequestV2ApprovalGrant'

const resultValue = v.union(
  v.object({ kind: v.union(v.literal('admitted'), v.literal('replayed')), actionAttempt: actionAttemptV2Value }),
  v.object({ kind: v.literal('conflict'), reason: v.literal('idempotency_key_reused') }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('approval_grant_not_found'), v.literal('approval_grant_expired'),
      v.literal('approval_authority_changed'), v.literal('approval_grant_consumed'),
      v.literal('cumulative_authority_changed'), v.literal('cumulative_authority_exhausted'),
      v.literal('admission_material_invalid'),
    ),
  }),
)
type Result = Infer<typeof resultValue>
export type ActionAttemptAdmissionCommand = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  expectedRequestId: string
  expectedRequestRevision: number
  approvalGrantRef: string
  now: number
}>

export const admit = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(),
    expectedRequestId: v.string(), expectedRequestRevision: v.number(), approvalGrantRef: v.string(), now: v.number(),
  },
  returns: resultValue,
  handler: async (ctx, args): Promise<Result> => await admitActionAttemptTransaction(ctx.db, args),
})

export async function admitActionAttemptTransaction(
  db: MutationCtx['db'], args: ActionAttemptAdmissionCommand,
): Promise<Result> {
  if (!validCommand(args)) return { kind: 'refused', reason: 'admission_material_invalid' }
  const replay = await db.query('customerRequestV2ActionAttemptAdmissionCommands')
    .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
  if (replay !== null) {
    if (replay.commandDigest !== args.commandDigest || replay.principalId !== args.principalId
      || replay.requestId !== args.expectedRequestId || replay.requestRevision !== args.expectedRequestRevision
      || replay.approvalGrantRef !== args.approvalGrantRef) {
      return { kind: 'conflict', reason: 'idempotency_key_reused' }
    }
    return { kind: 'replayed', actionAttempt: await replayAttempt(db, replay) }
  }
  const opened = await openExactApprovalGrantForAdmission(db, {
    approvalGrantRef: args.approvalGrantRef, principalId: args.principalId, now: args.now,
  })
  if (opened.kind !== 'ready') return opened
  if (opened.approvalGrant.lineage.requestId !== args.expectedRequestId
    || opened.approvalGrant.lineage.requestRevision !== args.expectedRequestRevision) {
    return { kind: 'refused', reason: 'approval_grant_not_found' }
  }
  const consumed = await db.query('customerRequestV2ApprovalGrantConsumptions')
    .withIndex('by_approvalGrantRef', (query) => query.eq('approvalGrantRef', args.approvalGrantRef)).unique()
  if (consumed !== null) return { kind: 'refused', reason: 'approval_grant_consumed' }
  const authorityBudgetRef = actionAuthorityBudgetV2Ref(opened.approvalGrant)
  const currentBudget = await db.query('customerRequestV2ActionAuthorityBudgets')
    .withIndex('by_authorityBudgetRef', (query) => query.eq('authorityBudgetRef', authorityBudgetRef)).unique()
  const admitted = admitActionAttemptV2({
    approvalGrant: opened.approvalGrant,
    admissionKey: args.commandKey,
    admittedAt: args.now,
    currentAuthorityBudget: currentBudget?.budget as ActionAuthorityBudgetV2 | undefined ?? null,
  })
  if (admitted.kind !== 'admitted') return {
    kind: 'refused',
    reason: admitted.reason === 'approval_grant_expired' ? 'approval_grant_expired'
      : admitted.reason === 'cumulative_authority_changed' ? 'cumulative_authority_changed'
        : admitted.reason === 'cumulative_authority_exhausted' ? 'cumulative_authority_exhausted'
          : 'admission_material_invalid',
  }
  await persistActionAttemptAdmissionBundle(db, args, admitted.bundle)
  return { kind: 'admitted', actionAttempt: writableAttempt(admitted.bundle.attempt) }
}

export async function persistActionAttemptAdmissionBundle(
  db: MutationCtx['db'], args: ActionAttemptAdmissionCommand, bundle: ActionAttemptAdmissionBundleV2,
): Promise<void> {
  const attempt = writableAttempt(bundle.attempt)
  const budget = writableValue<Doc<'customerRequestV2ActionAuthorityBudgets'>['budget']>(bundle.authorityBudget)
  const consumption = writableValue<Doc<'customerRequestV2ApprovalGrantConsumptions'>['consumption']>(bundle.consumption)
  const claim = writableValue<Doc<'customerRequestV2ActionAttemptIdempotencyClaims'>['idempotencyClaim']>(bundle.idempotencyClaim)
  const spend = writableValue<Doc<'customerRequestV2ActionAttemptSpendReservations'>['reservation']>(bundle.spendReservation)
  const data = writableValue<Doc<'customerRequestV2ActionAttemptDataReservations'>['reservation']>(bundle.dataReservation)
  const release = writableValue<Doc<'customerRequestV2ProviderReleaseGrants'>['grant']>(bundle.providerReleaseGrant)
  const disclosure = writableValue<Doc<'customerRequestV2ActionDisclosureGrants'>['grant']>(bundle.disclosureGrant)
  const currentBudget = await db.query('customerRequestV2ActionAuthorityBudgets')
    .withIndex('by_authorityBudgetRef', (query) => query.eq('authorityBudgetRef', budget.authorityBudgetRef)).unique()
  if ((currentBudget === null && (spend.reservedBeforeMinor !== 0 || data.reservedExposureBefore !== 0))
    || (currentBudget !== null && (
      currentBudget.authorityBudgetDigest !== actionAuthorityBudgetV2Digest(currentBudget.budget as ActionAuthorityBudgetV2)
      || currentBudget.budget.reservedSpendMinor !== spend.reservedBeforeMinor
      || currentBudget.budget.reservedExposureCount !== data.reservedExposureBefore
    ))) throw new Error('customer_request_v2_action_authority_budget_integrity_failure')
  if (currentBudget === null) {
    await db.insert('customerRequestV2ActionAuthorityBudgets', {
      authorityBudgetRef: budget.authorityBudgetRef, authorityBudgetDigest: budget.authorityBudgetDigest,
      approvalGrantRef: budget.approvalGrantRef,
      requestId: attempt.lineage.requestId, requestRevision: attempt.lineage.requestRevision,
      actionId: attempt.lineage.actionId, authorityLineageDigest: budget.authorityLineageDigest,
      budget, recordedAt: args.now,
    })
  } else {
    await db.patch(currentBudget._id, {
      authorityBudgetDigest: budget.authorityBudgetDigest,
      authorityLineageDigest: budget.authorityLineageDigest,
      budget, recordedAt: args.now,
    })
  }
  await db.insert('customerRequestV2ActionAttempts', {
    actionAttemptRef: attempt.actionAttemptRef, actionAttemptDigest: attempt.actionAttemptDigest,
    approvalGrantRef: attempt.approvalGrantRef,
    requestId: attempt.lineage.requestId, requestRevision: attempt.lineage.requestRevision,
    actionId: attempt.lineage.actionId, principalId: attempt.lineage.principalId,
    actionAttempt: attempt, recordedAt: args.now,
  })
  await db.insert('customerRequestV2ApprovalGrantConsumptions', {
    consumptionRef: consumption.consumptionRef, consumptionDigest: consumption.consumptionDigest,
    approvalGrantRef: consumption.approvalGrantRef, actionAttemptRef: attempt.actionAttemptRef,
    authorityLineageDigest: consumption.authorityLineageDigest, consumption, recordedAt: args.now,
  })
  await db.insert('customerRequestV2ActionAttemptIdempotencyClaims', {
    idempotencyClaimRef: claim.idempotencyClaimRef, idempotencyClaimDigest: claim.idempotencyClaimDigest,
    admissionKeyDigest: claim.admissionKeyDigest, actionAttemptRef: attempt.actionAttemptRef,
    authorityLineageDigest: claim.authorityLineageDigest, idempotencyClaim: claim, recordedAt: args.now,
  })
  await db.insert('customerRequestV2ActionAttemptSpendReservations', {
    spendReservationRef: spend.spendReservationRef, spendReservationDigest: spend.spendReservationDigest,
    actionAttemptRef: attempt.actionAttemptRef, authorityLineageDigest: spend.authorityLineageDigest,
    reservation: spend, recordedAt: args.now,
  })
  await db.insert('customerRequestV2ActionAttemptDataReservations', {
    dataReservationRef: data.dataReservationRef, dataReservationDigest: data.dataReservationDigest,
    actionAttemptRef: attempt.actionAttemptRef, authorityLineageDigest: data.authorityLineageDigest,
    reservation: data, recordedAt: args.now,
  })
  await db.insert('customerRequestV2ProviderReleaseGrants', {
    providerReleaseGrantRef: release.providerReleaseGrantRef,
    providerReleaseGrantDigest: release.providerReleaseGrantDigest,
    actionAttemptRef: attempt.actionAttemptRef, authorityLineageDigest: release.authorityLineageDigest,
    grant: release, recordedAt: args.now,
  })
  await db.insert('customerRequestV2ActionDisclosureGrants', {
    disclosureGrantRef: disclosure.disclosureGrantRef, disclosureGrantDigest: disclosure.disclosureGrantDigest,
    actionAttemptRef: attempt.actionAttemptRef, authorityLineageDigest: disclosure.authorityLineageDigest,
    grant: disclosure, recordedAt: args.now,
  })
  await db.insert('customerRequestV2ActionAttemptAdmissionCommands', {
    commandKey: args.commandKey, commandDigest: args.commandDigest, principalId: args.principalId,
    requestId: args.expectedRequestId, requestRevision: args.expectedRequestRevision,
    approvalGrantRef: args.approvalGrantRef, authorityLineageDigest: attempt.authorityLineageDigest,
    resultRef: attempt.actionAttemptRef, resultDigest: attempt.actionAttemptDigest, committedAt: args.now,
  })
}

async function replayAttempt(
  db: MutationCtx['db'], command: Doc<'customerRequestV2ActionAttemptAdmissionCommands'>,
): Promise<Doc<'customerRequestV2ActionAttempts'>['actionAttempt']> {
  const row = await db.query('customerRequestV2ActionAttempts')
    .withIndex('by_actionAttemptRef', (query) => query.eq('actionAttemptRef', command.resultRef)).unique()
  if (row === null || row.approvalGrantRef !== command.approvalGrantRef
    || row.principalId !== command.principalId || row.actionAttemptDigest !== command.resultDigest
    || row.actionAttemptRef !== row.actionAttempt.actionAttemptRef
    || row.actionAttemptDigest !== row.actionAttempt.actionAttemptDigest
    || actionAttemptV2Digest(row.actionAttempt as ActionAttemptV2) !== row.actionAttemptDigest
    || row.actionAttempt.authority.approvalGrantRef !== row.actionAttempt.approvalGrantRef
    || approvalGrantV2Digest(row.actionAttempt.authority) !== row.actionAttempt.approvalGrantDigest
    || canonicalDigest(row.actionAttempt.authority as StableHashValue) !== command.authorityLineageDigest) {
    throw replayIntegrityFailure()
  }
  const attempt = row.actionAttempt
  const expectedAdmission = admitActionAttemptV2({
    approvalGrant: attempt.authority,
    admissionKey: command.commandKey,
    admittedAt: attempt.admittedAt,
    currentAuthorityBudget: null,
  })
  if (expectedAdmission.kind !== 'admitted'
    || !sameStableValue(attempt, expectedAdmission.bundle.attempt)) throw replayIntegrityFailure()
  const expected = expectedAdmission.bundle
  const [budget, consumption, claim, spend, data, release, disclosure] = await Promise.all([
    db.query('customerRequestV2ActionAuthorityBudgets')
      .withIndex('by_authorityBudgetRef', (query) => query.eq('authorityBudgetRef', attempt.authorityBudgetRef)).unique(),
    db.query('customerRequestV2ApprovalGrantConsumptions')
      .withIndex('by_approvalGrantRef', (query) => query.eq('approvalGrantRef', attempt.approvalGrantRef)).unique(),
    db.query('customerRequestV2ActionAttemptIdempotencyClaims')
      .withIndex('by_idempotencyClaimRef', (query) => query.eq('idempotencyClaimRef', attempt.idempotencyClaimRef)).unique(),
    db.query('customerRequestV2ActionAttemptSpendReservations')
      .withIndex('by_actionAttemptRef', (query) => query.eq('actionAttemptRef', attempt.actionAttemptRef)).unique(),
    db.query('customerRequestV2ActionAttemptDataReservations')
      .withIndex('by_actionAttemptRef', (query) => query.eq('actionAttemptRef', attempt.actionAttemptRef)).unique(),
    db.query('customerRequestV2ProviderReleaseGrants')
      .withIndex('by_actionAttemptRef', (query) => query.eq('actionAttemptRef', attempt.actionAttemptRef)).unique(),
    db.query('customerRequestV2ActionDisclosureGrants')
      .withIndex('by_actionAttemptRef', (query) => query.eq('actionAttemptRef', attempt.actionAttemptRef)).unique(),
  ])
  if (budget === null || consumption === null || claim === null || spend === null || data === null
    || release === null || disclosure === null
    || !sameStableValue(budget.budget, expected.authorityBudget)
    || !sameStableValue(consumption.consumption, expected.consumption)
    || !sameStableValue(claim.idempotencyClaim, expected.idempotencyClaim)
    || !sameStableValue(spend.reservation, expected.spendReservation)
    || !sameStableValue(data.reservation, expected.dataReservation)
    || !sameStableValue(release.grant, expected.providerReleaseGrant)
    || !sameStableValue(disclosure.grant, expected.disclosureGrant)
    || budget.authorityBudgetDigest !== actionAuthorityBudgetV2Digest(budget.budget as ActionAuthorityBudgetV2)
    || budget.budget.authorityBudgetRef !== attempt.authorityBudgetRef
    || budget.approvalGrantRef !== attempt.approvalGrantRef
    || budget.requestId !== attempt.lineage.requestId
    || budget.requestRevision !== attempt.lineage.requestRevision
    || budget.actionId !== attempt.lineage.actionId
    || budget.authorityLineageDigest !== attempt.authorityLineageDigest
    || budget.budget.approvalGrantRef !== attempt.approvalGrantRef
    || budget.budget.approvalGrantDigest !== attempt.approvalGrantDigest
    || budget.budget.authorityLineageDigest !== attempt.authorityLineageDigest
    || budget.budget.currency !== attempt.maximumSpend.currency
    || budget.budget.maximumSpendMinor !== attempt.maximumSpend.amountMinor
    || budget.budget.expiresAt !== attempt.expiresAt
    || budget.budget.reservedSpendMinor !== spend.reservation.reservedAfterMinor
    || budget.budget.reservedExposureCount !== data.reservation.reservedExposureAfter
    || !validLinkedRecord(consumption, consumption.consumption, 'consumptionDigest', attempt)
    || !validLinkedRecord(claim, claim.idempotencyClaim, 'idempotencyClaimDigest', attempt)
    || !validLinkedRecord(spend, spend.reservation, 'spendReservationDigest', attempt)
    || !validLinkedRecord(data, data.reservation, 'dataReservationDigest', attempt)
    || !validLinkedRecord(release, release.grant, 'providerReleaseGrantDigest', attempt)
    || !validLinkedRecord(disclosure, disclosure.grant, 'disclosureGrantDigest', attempt)
    || consumption.consumption.consumptionRef !== `approval-grant-consumption:v2:${attempt.approvalGrantDigest}`
    || spend.reservation.spendReservationRef !== attempt.spendReservationRef
    || data.reservation.dataReservationRef !== attempt.dataReservationRef
    || release.grant.providerReleaseGrantRef !== attempt.providerReleaseGrantRef
    || disclosure.grant.disclosureGrantRef !== attempt.disclosureGrantRef
    || claim.idempotencyClaim.idempotencyClaimRef !== attempt.idempotencyClaimRef
    || consumption.consumption.consumedAt !== attempt.admittedAt
    || claim.idempotencyClaim.admissionKeyDigest !== attempt.admissionKeyDigest
    || claim.idempotencyClaim.claimedAt !== attempt.admittedAt
    || spend.reservation.authorityBudgetRef !== attempt.authorityBudgetRef
    || spend.reservation.state !== 'reserved'
    || spend.reservation.currency !== attempt.maximumSpend.currency
    || spend.reservation.amountMinor !== attempt.maximumSpend.amountMinor
    || spend.reservation.expiresAt !== attempt.expiresAt
    || data.reservation.authorityBudgetRef !== attempt.authorityBudgetRef
    || data.reservation.state !== 'reserved'
    || data.reservation.expiresAt !== attempt.expiresAt
    || data.reservation.scopeDigest !== canonicalDigest(data.reservation.scope as StableHashValue)
    || data.reservation.declarationCount !== data.reservation.scope.length
    || data.reservation.exposureCount !== data.reservation.scope.reduce(
      (count, declaration) => count + declaration.purposes.length, 0,
    )
    || data.reservation.exposureDigest !== canonicalDigest(data.reservation.scope.flatMap(
      (declaration) => declaration.purposes.map((purpose) => ({
        effectId: declaration.effectId,
        inputPointer: declaration.inputPointer,
        recipient: declaration.recipient,
        purpose,
      })),
    ) as StableHashValue)
    || disclosure.grant.state !== 'unreleased'
    || disclosure.grant.bindingId !== attempt.authority.supply.binding.bindingId
    || disclosure.grant.scopeDigest !== data.reservation.scopeDigest
    || disclosure.grant.exposureDigest !== data.reservation.exposureDigest
    || canonicalDigest(disclosure.grant.scope as StableHashValue) !== data.reservation.scopeDigest
    || disclosure.grant.expiresAt !== attempt.expiresAt
    || release.grant.state !== 'unreleased'
    || release.grant.businessId !== attempt.authority.supply.businessId
    || release.grant.offeringId !== attempt.authority.supply.offering.offeringId
    || release.grant.bindingId !== attempt.authority.supply.binding.bindingId
    || release.grant.expiresAt !== attempt.expiresAt
    || release.grant.issuedAt !== attempt.admittedAt
    || disclosure.grant.issuedAt !== attempt.admittedAt) {
    throw replayIntegrityFailure()
  }
  return attempt
}

function sameStableValue(left: unknown, right: unknown): boolean {
  return canonicalDigest(left as StableHashValue) === canonicalDigest(right as StableHashValue)
}

function validLinkedRecord(
  row: Record<string, unknown> & { actionAttemptRef: string; authorityLineageDigest: string },
  record: Record<string, unknown> & {
    attempt: { actionAttemptRef: string; actionAttemptDigest: string }
    approvalGrantRef: string
    approvalGrantDigest: string
    authorityLineageDigest: string
  },
  digestKey: string,
  attempt: Doc<'customerRequestV2ActionAttempts'>['actionAttempt'],
): boolean {
  const storedDigest = record[digestKey]
  const material = Object.fromEntries(Object.entries(record).filter(([key]) => key !== digestKey))
  return typeof storedDigest === 'string' && canonicalDigest(material as StableHashValue) === storedDigest
    && row[digestKey] === storedDigest
    && row.actionAttemptRef === attempt.actionAttemptRef
    && row.authorityLineageDigest === attempt.authorityLineageDigest
    && record.attempt.actionAttemptRef === attempt.actionAttemptRef
    && record.attempt.actionAttemptDigest === attempt.actionAttemptDigest
    && record.approvalGrantRef === attempt.approvalGrantRef
    && record.approvalGrantDigest === attempt.approvalGrantDigest
    && record.authorityLineageDigest === attempt.authorityLineageDigest
}

function replayIntegrityFailure(): Error {
  return new Error('customer_request_v2_action_attempt_replay_integrity_failure')
}

function writableAttempt(attempt: ActionAttemptV2): Infer<typeof actionAttemptV2Value> {
  return writableValue<Infer<typeof actionAttemptV2Value>>(attempt)
}

function writableValue<T>(value: unknown): T {
  return structuredClone(value) as T
}

function validCommand(args: ActionAttemptAdmissionCommand): boolean {
  return args.commandKey.trim().length > 0 && args.commandKey.length <= 500
    && isCanonicalDigest(args.commandDigest)
    && args.principalId.trim().length > 0 && args.principalId.length <= 500
    && args.expectedRequestId.trim().length > 0 && args.expectedRequestId.length <= 500
    && Number.isSafeInteger(args.expectedRequestRevision) && args.expectedRequestRevision >= 1
    && args.approvalGrantRef.startsWith('approval-grant:v2:') && args.approvalGrantRef.length <= 500
    && Number.isSafeInteger(args.now) && args.now >= 0
}
