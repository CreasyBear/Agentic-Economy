import { resolveServiceMode, serviceModeAllowsEnvironment } from '@/lib/deployment/service-mode'
import { v, type Infer } from 'convex/values'

import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { env } from '../../_generated/server'
import {
  verifyMarketAgentPrincipal,
  type AgentAccessPrincipalValue,
} from '../../agentAccessPrincipals'
import { readCommercialPolicyGate } from '../../moneyCommercialPolicy'
import { resolveAndBindLegalCustomer } from '../moneyLegalCustomer'
import { requireSourceRead, requireSourceWrite } from '../../sourceWriteAdmission'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import {
  AUD_EXPONENT,
  audFundingPolicyFromCommercialControls,
  compareExactAmounts,
  quoteAudAccountFunding,
} from '../../../src/modules/money/public'

import {
  bindAgentHandoffArgsValue,
  fundingCommandView,
  fundingResultValue,
  POSITIVE_UNITS,
  publicFundingHandoffValue,
  readAgentHandoffArgsValue,
  refused,
  reserveAgentHandoffArgsValue,
  type FundingResult,
} from './accountFundingValidators'

export const reserveAgentHandoffArgs = reserveAgentHandoffArgsValue
export const reserveAgentHandoffResult = fundingResultValue
export const bindAgentHandoffArgs = bindAgentHandoffArgsValue
export const bindAgentHandoffResult = fundingResultValue
export const readAgentHandoffArgs = readAgentHandoffArgsValue
export const readAgentHandoffResult = fundingResultValue
export const readPayerSafeHandoffResult = publicFundingHandoffValue
export const readPayerSafeHandoffArgs = { externalRef: v.string() }

function agentHandoffIdempotencyRef(
  admission: Readonly<{ ownerId: string; principalId: string }>,
  environment: 'sandbox' | 'production',
  callerKey: string,
): string {
  return canonicalDigest({
    format: 'ae.agent-funding-idempotency:v1',
    accountRef: admission.ownerId,
    principalRef: admission.principalId,
    environment,
    callerKey,
  })
}

function agentHandoffCommandRef(idempotencyRef: string): string {
  return canonicalDigest({ format: 'ae.agent-funding-command:v1', idempotencyRef })
}

async function admitAgentHandoff(
  ctx: MutationCtx,
  args: Readonly<{
    agentPrincipal: AgentAccessPrincipalValue
    operationKey: string
    correlationId: string
  }>,
) {
  const source = await requireSourceWrite(ctx, args as never, 'billing')
  if (source.kind === 'rejected') return null
  const admission = await verifyMarketAgentPrincipal(ctx, args.agentPrincipal)
  return admission.kind === 'allowed' ? admission : null
}

async function admitAgentHandoffForRead(
  ctx: QueryCtx,
  args: Readonly<{
    agentPrincipal: AgentAccessPrincipalValue
    operationKey: string
    correlationId: string
  }>,
) {
  if ((await requireSourceRead(args as never, 'billing')).kind === 'rejected') return null
  const admission = await verifyMarketAgentPrincipal(ctx, args.agentPrincipal)
  return admission.kind === 'allowed' ? admission : null
}

function handoffState(command: Doc<'moneyFundingCommands'>) {
  if (command.state === 'succeeded') return 'ready' as const
  if (command.terminalReason === 'expired' || command.providerCheckoutStatus === 'expired') {
    return 'expired' as const
  }
  if (command.terminalReason === 'async_payment_failed' || command.state === 'failed') return 'failed' as const
  if (command.providerCheckoutStatus === 'complete') return 'processing' as const
  return 'awaiting_payment' as const
}

export async function reserveAgentHandoffHandler(
  ctx: MutationCtx,
  args: Infer<typeof reserveAgentHandoffArgsValue>,
): Promise<FundingResult> {
  if (!serviceModeAllowsEnvironment(resolveServiceMode(env), args.environment)) {
    return refused('environment_mismatch')
  }
  const admission = await admitAgentHandoff(ctx, args)
  const callerKey = args.idempotencyKey.trim()
  if (admission === null) return refused('billing_identity_missing')
  if (!POSITIVE_UNITS.test(args.principalAmountUnits)
    || callerKey.length < 1 || callerKey.length > 255
    || !Number.isSafeInteger(args.checkoutExpiresAt)) return refused('funding_amount_invalid')
  const idempotencyRef = agentHandoffIdempotencyRef(admission, args.environment, callerKey)
  const commandRef = agentHandoffCommandRef(idempotencyRef)
  const inputDigest = canonicalDigest({
    format: 'ae.agent-funding-input:v1',
    idempotencyRef,
    principalAmount: { currency: 'AUD', exponent: AUD_EXPONENT, units: args.principalAmountUnits },
  })
  const prior = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_idempotencyKey', (builder) => builder.eq('idempotencyKey', idempotencyRef))
    .unique()
  if (prior !== null) {
    return prior.commandRef === commandRef
      && prior.accountRef === admission.ownerId
      && prior.actorPrincipalRef === admission.principalId
      && prior.inputDigest === inputDigest
      && prior.principalUnits === args.principalAmountUnits
      && prior.environment === args.environment
      && prior.initiationKind === 'agent_handoff'
      ? { kind: 'accepted', command: fundingCommandView(prior) }
      : refused('funding_idempotency_conflict')
  }
  const now = Date.now()
  if (args.checkoutExpiresAt < now + 30 * 60_000 || args.checkoutExpiresAt > now + 60 * 60_000 + 5_000) {
    return refused('funding_amount_invalid')
  }
  const policy = await readCommercialPolicyGate(ctx.db, {
    environment: args.environment,
    now,
    ...(args.environment === 'sandbox'
      ? { sandboxFixture: 'managed_x402_deterministic_v1' as const }
      : {}),
  })
  if (policy.kind === 'refused') return refused('commercial_policy_required')
  const quote = quoteAudAccountFunding(BigInt(args.principalAmountUnits), audFundingPolicyFromCommercialControls(policy.controls))
  if (quote === undefined) return refused('funding_amount_invalid')
  const legalCustomer = await resolveAndBindLegalCustomer(ctx, admission.ownerId, now)
  if (legalCustomer.kind === 'refused') return refused(legalCustomer.code)
  const principal = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', admission.principalId))
    .unique()
  if (principal === null || principal.lifecycle !== 'active') return refused('billing_identity_missing')
  const row = {
    commandRef,
    accountRef: admission.ownerId,
    legalCustomerRef: legalCustomer.legalCustomerRef,
    actorPrincipalRef: admission.principalId,
    environment: args.environment,
    currency: 'AUD' as const,
    exponent: AUD_EXPONENT,
    principalUnits: quote.principalUnits.toString(),
    serviceFeeUnits: quote.serviceFeeUnits.toString(),
    taxUnits: quote.taxUnits.toString(),
    totalUnits: quote.totalUnits.toString(),
    commercialPolicyDigest: policy.policyDigest,
    commercialPolicyRefs: [...policy.policyRefs],
    idempotencyKey: idempotencyRef,
    inputDigest,
    successReturnRef: args.successReturnRef,
    cancelReturnRef: args.cancelReturnRef,
    providerRecoveryDeadlineAt: args.checkoutExpiresAt,
    initiationKind: 'agent_handoff' as const,
    checkoutMode: 'hosted_page' as const,
    checkoutExpiresAt: args.checkoutExpiresAt,
    requesterDisplayName: principal.displayName,
    state: 'pending' as const,
    providerStatus: 'pending' as const,
    metadataDigest: canonicalDigest({ ae_command_ref: commandRef, ae_contract: 'account_funding_v2' }),
    createdAt: now,
    updatedAt: now,
  }
  await ctx.db.insert('moneyFundingCommands', row)
  return { kind: 'accepted', command: row }
}

export async function bindAgentHandoffHandler(
  ctx: MutationCtx,
  args: Infer<typeof bindAgentHandoffArgsValue>,
): Promise<FundingResult> {
  const admission = await admitAgentHandoff(ctx, args)
  if (admission === null) return refused('billing_identity_missing')
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_commandRef', (builder) => builder.eq('commandRef', args.commandRef))
    .unique()
  if (command === null || command.initiationKind !== 'agent_handoff'
    || command.accountRef !== admission.ownerId || command.actorPrincipalRef !== admission.principalId) {
    return refused('funding_pending', true)
  }
  if (args.evidence.checkoutMode !== 'hosted_page'
    || compareExactAmounts(args.evidence.amount, { currency: 'AUD', exponent: AUD_EXPONENT, units: command.totalUnits }) !== 0
    || (command.externalRef !== undefined && command.externalRef !== args.evidence.externalRef)
    || command.metadataDigest !== args.evidence.metadataDigest
    || command.checkoutExpiresAt !== args.evidence.checkoutExpiresAt) {
    return refused('payment_binding_invalid')
  }
  await ctx.db.patch(command._id, {
    externalRef: args.evidence.externalRef,
    providerStatus: args.evidence.status,
    providerEvidenceRef: args.evidence.evidenceRef,
    requestDigest: args.evidence.requestDigest,
    metadataDigest: args.evidence.metadataDigest,
    checkoutSessionDigest: args.evidence.checkoutSessionDigest,
    evidenceDigest: args.evidence.evidenceDigest,
    ...(args.evidence.paymentIntentDigest === undefined ? {} : { paymentIntentDigest: args.evidence.paymentIntentDigest }),
    ...(args.evidence.paymentId === undefined ? {} : { paymentId: args.evidence.paymentId }),
    ...(args.evidence.checkoutStatus === undefined ? {} : { providerCheckoutStatus: args.evidence.checkoutStatus }),
    ...(args.evidence.paymentStatus === undefined ? {} : { providerPaymentStatus: args.evidence.paymentStatus }),
    updatedAt: Date.now(),
  })
  const updated = await ctx.db.get(command._id)
  return updated === null ? refused('funding_pending', true) : { kind: 'accepted', command: fundingCommandView(updated) }
}

export async function readAgentHandoffHandler(
  ctx: QueryCtx,
  args: Infer<typeof readAgentHandoffArgsValue>,
): Promise<FundingResult> {
  const admission = await admitAgentHandoffForRead(ctx, args)
  if (admission === null) return refused('billing_identity_missing')
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_externalRef', (builder) => builder.eq('externalRef', args.externalRef))
    .unique()
  return command === null || command.initiationKind !== 'agent_handoff'
    || command.accountRef !== admission.ownerId || command.actorPrincipalRef !== admission.principalId
    ? refused('funding_pending', false)
    : { kind: 'accepted', command: fundingCommandView(command) }
}

export async function readPayerSafeHandoffHandler(
  ctx: QueryCtx,
  args: Readonly<{ externalRef: string }>,
): Promise<Infer<typeof publicFundingHandoffValue>> {
  if (!/^cs_[A-Za-z0-9_]+$/u.test(args.externalRef)) return { kind: 'not_found' }
  const command = await ctx.db.query('moneyFundingCommands')
    .withIndex('by_externalRef', (builder) => builder.eq('externalRef', args.externalRef))
    .unique()
  if (command === null || command.initiationKind !== 'agent_handoff' || command.requesterDisplayName === undefined) {
    return { kind: 'not_found' }
  }
  return {
    kind: 'found',
    funding: {
      state: handoffState(command),
      agentName: command.requesterDisplayName,
      creditAmount: { currency: 'AUD', exponent: AUD_EXPONENT, units: command.principalUnits },
    },
  }
}
