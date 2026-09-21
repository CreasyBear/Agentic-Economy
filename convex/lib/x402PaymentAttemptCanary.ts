import { type Infer } from 'convex/values'

import { compareExactAmounts } from '@/modules/money/public'
import { X402_MANAGED_CUSTODY_REF } from '@/modules/capability-execution/convex'
import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  parsePublishedToolSnapshot,
} from '@/modules/capability-supply/public'
import type { MutationCtx } from '../_generated/server'
import { callAttemptIdentityDigest } from '../capabilityCallIdentity'
import {
  PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC,
  readExactSellerOnboardingCanaryPlatformGrantHandler,
  SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC,
} from '../capabilitySupplyCanaryFunding'
import { prepareX402PaymentAuthorizationHandler } from './x402PaymentAttempt'
import {
  type PrepareArgs,
  prepareX402PaymentAuthorizationReturns,
} from './x402PaymentAttemptSchema'

export async function prepareSellerOnboardingCanaryPaymentAuthorizationHandler(
  ctx: MutationCtx,
  args: PrepareArgs,
): Promise<Infer<typeof prepareX402PaymentAuthorizationReturns>> {
  const call = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.dispatchRef))
    .unique()
  const canary = call?.sellerOnboardingCanary
  const now = Date.now()
  if (call === null || canary === undefined
    || call.state !== 'pending'
    || call.dispatchState !== 'running' || call.attemptRef !== args.attemptRef
    || (call.environment !== 'sandbox' && call.environment !== 'production')
    || canary.executionPurpose !== 'seller_onboarding_canary'
    || canary.callRef !== call.callRef
    || canary.toolRef !== call.toolRef || args.toolRef !== call.toolRef
    || canary.inputDigest !== call.inputDigest || args.inputDigest !== call.inputDigest
    || canary.idempotencyKey !== call.idempotencyKey
    || !(canary.expiresAt > now) || !(canary.readinessValidUntil > now)
    || canary.funding.kind !== 'ae_owned'
    || canary.funding.ledgerEffects !== 'external_spend_only'
    || canary.accountingPolicy.recordBuyerUsage !== false
    || canary.accountingPolicy.accrueProviderEarnings !== false
    || canary.accountingPolicy.accruePlatformRake !== false
    || canary.accountingPolicy.recordQualifiedUse !== false
    || canary.funding.ownerId !== call.ownerId
    || canary.funding.principalId !== call.principalId
    || canary.funding.credentialId !== call.credentialId
    || canary.funding.applicationRef !== call.applicationRef
    || canary.funding.grantRef !== call.grantRef
    || canary.funding.grantGeneration !== call.grantGeneration
    || canary.funding.policyDigest !== call.policyDigest
    || (args.aeEnvironment !== undefined && args.aeEnvironment !== call.environment)
    || args.reservationRef !== undefined
    || args.credentialRef !== X402_MANAGED_CUSTODY_REF
    || args.scheme !== 'exact'
    || args.network !== (call.environment === 'production' ? BASE_MAINNET_NETWORK : BASE_SEPOLIA_NETWORK)
    || args.asset.toLowerCase() !== (call.environment === 'production'
      ? BASE_MAINNET_USDC_ADDRESS
      : BASE_SEPOLIA_USDC_ADDRESS).toLowerCase()
    || args.payTo.toLowerCase() !== canary.sellerPayTo.toLowerCase()
    || args.currency !== canary.funding.requestedSpend.currency || args.exponent !== 6
    || !/^[1-9][0-9]{0,77}$/.test(args.amountUnits)
    || args.amountUnits !== canary.funding.requestedSpend.units
    || canary.funding.requestedSpend.exponent !== 6
    || args.custodyBudgetRef === undefined || args.custodyGeneration === undefined
    || args.custodyDailyMaximumUnits !== (call.environment === 'production'
      ? PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC
      : SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC)
    || args.requestFingerprint === undefined
  ) throw new Error('seller_canary_payment_authority_invalid')

  const operation = call.toolJson === undefined ? undefined : parsePublishedToolSnapshot(call.toolJson)
  const control = await ctx.db.query('actionExecutionControls')
    .withIndex('by_executionRef', (query) => query.eq('executionRef', call.callRef))
    .unique()
  const lease = control?.control.control
  if (control?.currentAttemptRef !== args.attemptRef
    || control.currentEffectGeneration !== args.effectGeneration
    || lease?.state !== 'leased' || lease.attemptRef !== args.attemptRef
    || lease.effectGeneration !== args.effectGeneration
    || !(Date.parse(lease.leaseExpiresAt) > now)
  ) throw new Error('seller_canary_payment_attempt_invalid')
  const paymentIdentifier = callAttemptIdentityDigest({
    callRef: call.callRef, principalId: call.principalId, credentialId: call.credentialId,
    applicationRef: call.applicationRef, environment: call.environment,
    toolRef: call.toolRef, idempotencyKey: call.idempotencyKey, inputDigest: call.inputDigest,
    attemptRef: args.attemptRef, effectGeneration: args.effectGeneration,
  })
  if (operation === undefined
    || operation.runtimeEnvironment !== call.environment
    || operation.pricingConfig.kind !== 'managed_x402'
    || operation.pricingConfig.sourceRequirement.atomicUnits !== args.amountUnits
    || operation.identity.payment.kind !== 'x402'
    || operation.identity.payment.network !== args.network
    || operation.identity.payment.asset.toLowerCase() !== args.asset.toLowerCase()
    || operation.identity.payment.payTo.toLowerCase() !== args.payTo.toLowerCase()
    || operation.materialDigest !== canary.toolMaterialDigest
    || operation.identity.contractDigest !== canary.contractDigest
    || operation.identity.bindingDigest !== canary.bindingDigest
    || operation.priceDigest !== canary.priceDigest
    || operation.binding.endpointUrl !== args.providerEndpoint
    || args.paymentIdentifier !== paymentIdentifier || args.operationKeyDigest !== paymentIdentifier
  ) throw new Error('seller_canary_payment_material_invalid')

  const grant = await readExactSellerOnboardingCanaryPlatformGrantHandler(ctx, {
    sellerOwnerId: canary.ownerId,
    expected: {
      kind: 'persisted_dispatch', grantRef: call.grantRef, principalId: call.principalId,
      ownerId: call.ownerId, credentialId: call.credentialId, applicationRef: call.applicationRef,
      environment: call.environment, generation: call.grantGeneration,
      spendingPolicyDigest: call.policyDigest, expiresAt: call.grantExpiresAt,
    },
    now,
  })
  const withinSealedLimit = compareExactAmounts(canary.funding.requestedSpend, canary.funding.maximumSpend)
  if (grant === null || (withinSealedLimit !== -1 && withinSealedLimit !== 0)
    || canary.funding.budgetRef !== grant.budgetPolicyRef
    || args.currency !== grant.spendingPolicy.budget.maximumSpendPerCall.currency
    || args.exponent !== grant.spendingPolicy.budget.maximumSpendPerCall.exponent
    || BigInt(args.amountUnits) > BigInt(grant.spendingPolicy.budget.maximumSpendPerCall.units)
  ) throw new Error('seller_canary_payment_grant_invalid')

  return await prepareX402PaymentAuthorizationHandler(ctx, {
    ...args,
    aeEnvironment: call.environment,
  })
}
