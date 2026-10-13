import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { TRIAL_AMOUNT_UNITS, TRIAL_DURATION_MS, COLOSSEUM_TRIAL_CLAIM_BY } from '@/modules/money/public'
import { ADMIN_ACTION_PERMISSION, type AdminActionInput } from '@/lib/operator/admin-console/contracts'
import { parseAdminOperationReceipt } from '../../adminConsole/commands/idempotency'
import { financialEnvironmentMatches } from '../formance/contracts'

export function trialOfferRef(input: AdminActionInput['issue_trial']): string {
  return `trial:${canonicalDigest({ format: 'ae.trial-offer:v1', ...input })}`
}

/** Requires the original approved offer. Ensures a hash-bound Admin receipt and
 * audit authorize exactly its recipient and fixed terms. Invariant: recipient
 * claims cannot manufacture an Admin grant. Missing/conflicting facts refuse. */
export async function trialOfferHasAuthority(ctx: Pick<QueryCtx, 'db'>, offer: Doc<'moneyTrialOffers'>): Promise<boolean> {
  const campaign = offer.codeCampaign
  if (campaign?.kind === 'claim') {
    const approval = await ctx.db.query('moneyTrialOffers').withIndex('by_offerRef', q => q.eq('offerRef', campaign.approvalRef)).unique()
    if (approval?.recipient.kind !== 'code' || approval.codeCampaign?.kind !== 'approval'
      || offer.recipient.kind !== 'account' || offer.activation.kind !== 'granted'
      || offer.activation.accountRef !== offer.recipient.accountRef
      || !Number.isSafeInteger(campaign.position) || campaign.position < 1 || campaign.position > approval.codeCampaign.claimedCount
      || offer.environment !== approval.environment || offer.actorRef !== approval.actorRef
      || offer.operationKey !== approval.operationKey || offer.correlationId !== approval.correlationId
      || offer.commandDigest !== approval.commandDigest || offer.auditEventRef !== approval.auditEventRef
      || offer.reasonCode !== approval.reasonCode || canonicalDigest(offer.evidenceRefs) !== canonicalDigest(approval.evidenceRefs)
      || offer.expectedStateDigest !== approval.expectedStateDigest
      || offer.createdAt < approval.createdAt || offer.createdAt >= approval.recipient.claimBy
      || offer.activation.activatedAt !== offer.createdAt
      || offer.offerRef !== trialOfferRef({ environment: offer.environment, recipient: offer.recipient })) return false
    const slot = await ctx.db.query('moneyTrialOffers').withIndex('by_codeCampaign_approvalRef_and_codeCampaign_position', q => q
      .eq('codeCampaign.approvalRef', approval.offerRef).eq('codeCampaign.position', campaign.position)).unique()
    return slot?._id === offer._id && await trialOfferHasAuthority(ctx, approval)
  }
  if (offer.recipient.kind === 'code') {
    if (campaign?.kind !== 'approval' || !Number.isSafeInteger(campaign.claimedCount)
      || campaign.claimedCount < 0 || campaign.claimedCount > offer.recipient.maxClaims
      || offer.recipient.claimBy !== COLOSSEUM_TRIAL_CLAIM_BY
      || offer.activation.kind !== 'unclaimed' || offer.activation.claimBy !== offer.recipient.claimBy) return false
  } else if (campaign !== undefined) return false
  const input = { environment: offer.environment, recipient: offer.recipient }
  if (!financialEnvironmentMatches(offer.environment) || offer.offerRef !== trialOfferRef(input)
    || offer.commandDigest !== canonicalDigest({ scope: 'admin_operator', action: 'issue_trial', input,
      reasonCode: offer.reasonCode, evidenceRefs: offer.evidenceRefs,
      ...(offer.expectedStateDigest === undefined ? {} : { expectedStateDigest: offer.expectedStateDigest }),
    })) return false
  const operationName = 'admin:issue_trial'
  const operation = await ctx.db.query('operationKeys').withIndex('by_actor_operation_key', q => q
    .eq('actorRef', offer.actorRef).eq('operationName', operationName).eq('key', offer.operationKey)).unique()
  if (operation?.scope !== 'admin_operator' || operation.actorKind !== 'admin' || operation.status !== 'succeeded'
    || operation.resultJson === undefined || operation.resultHash === undefined || !isCanonicalDigest(operation.requestHash)) return false
  const auditRef = `audit:money.trial_approved:${canonicalDigest({ actorRef: offer.actorRef, operationName,
    key: offer.operationKey, requestHash: operation.requestHash })}`
  if (offer.auditEventRef !== auditRef) return false
  const audit = await ctx.db.query('auditEvents').withIndex('by_eventId', q => q.eq('eventId', auditRef)).unique()
  if (audit?.eventType !== 'money.trial_approved' || audit.actorKind !== 'admin' || audit.actorRef !== offer.actorRef
    || audit.targetType !== 'protected_action' || audit.targetRef !== offer.offerRef
    || audit.idempotencyKey !== offer.operationKey || audit.correlationId !== offer.correlationId
    || audit.reasonCode !== offer.reasonCode || audit.beforeState !== 'absent' || audit.afterState !== 'approved'
    || canonicalDigest(audit.evidenceRefs) !== canonicalDigest(offer.evidenceRefs)) return false
  try {
    const receipt = parseAdminOperationReceipt(operation.resultJson, operation.resultHash, 'issue_trial')
    if (receipt.kind !== 'completed' || receipt.code !== 'trial_approved' || receipt.auditEventRef !== auditRef
      || receipt.correlationId !== offer.correlationId || receipt.effectRefs.length !== 1 || receipt.effectRefs[0] !== offer.offerRef) return false
    const payload: unknown = JSON.parse(audit.redactedPayloadJson)
    return isRecord(payload) && audit.payloadHash === canonicalDigest(payload)
      && payload.commandDigest === offer.commandDigest && payload.permission === ADMIN_ACTION_PERMISSION.issue_trial
      && payload.reasonCode === offer.reasonCode && canonicalDigest(payload.evidenceRefs) === canonicalDigest(offer.evidenceRefs)
  } catch {
    return false
  }
}

export async function trialGrantHasAuthority(ctx: Pick<QueryCtx, 'db'>, grant: Doc<'moneyPromotionalGrants'>): Promise<boolean> {
  const offerRef = grant.trialOfferRef
  if (offerRef === undefined) return false
  const offer = await ctx.db.query('moneyTrialOffers').withIndex('by_offerRef', q => q.eq('offerRef', offerRef)).unique()
  if (offer === null || offer.activation.kind !== 'granted') return false
  const activation = offer.activation
  return grant.grantRef === canonicalDigest({ format: 'ae.trial-credit-grant:v1', offerRef: offer.offerRef, accountRef: activation.accountRef })
    && Number.isSafeInteger(activation.activatedAt) && activation.activatedAt >= offer.createdAt
    && Number.isSafeInteger(activation.expiresAt)
    && activation.grantRef === grant.grantRef && activation.accountRef === grant.accountRef
    && activation.expiresAt === grant.expiresAt && activation.expiresAt === activation.activatedAt + TRIAL_DURATION_MS
    && grant.amountUnits === TRIAL_AMOUNT_UNITS && grant.createdAt === activation.activatedAt
    && grant.environment === offer.environment && grant.commandDigest === offer.commandDigest
    && grant.actorRef === offer.actorRef && grant.operationKey === offer.operationKey
    && grant.auditEventRef === offer.auditEventRef && grant.correlationId === offer.correlationId
    && grant.reasonCode === offer.reasonCode && canonicalDigest(grant.evidenceRefs) === canonicalDigest(offer.evidenceRefs)
    && await trialOfferHasAuthority(ctx, offer)
}

export async function accountHasTrialAccess(ctx: Pick<QueryCtx, 'db'>, input: {
  environment: 'sandbox' | 'production'; accountRef: string; ownerPrincipalRef: string; now: number
}): Promise<boolean> {
  if (!Number.isSafeInteger(input.now) || input.now < 0) return false
  const offer = await ctx.db.query('moneyTrialOffers').withIndex('by_environment_and_activation_accountRef', q => q
    .eq('environment', input.environment).eq('activation.accountRef', input.accountRef)).unique()
  if (offer === null || offer.activation.kind !== 'granted'
    || offer.activation.ownerPrincipalRef !== input.ownerPrincipalRef || offer.activation.expiresAt <= input.now
    || offer.activation.expiresAt !== offer.activation.activatedAt + TRIAL_DURATION_MS) return false
  const grantRef = offer.activation.grantRef
  const grant = await ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', grantRef)).unique()
  return grant !== null && await trialGrantHasAuthority(ctx, grant)
}
