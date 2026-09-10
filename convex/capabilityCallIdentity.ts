import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { canonicalAuthorityBasisMaterial } from '@/modules/action-execution/runtime'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { CallPersistedAuthority } from '@/modules/capability-execution/convex'
import { exactAmountSchema, pricingConfigDecisionAmount, type ExactAmount } from '@/modules/money/public'
import {
  publishedToolIdentityDigest,
  type PublishedTool,
  type RuntimePublishedToolDescriptor,
} from '@/modules/capability-supply/public'

export type CallAttemptIdentityInput = Readonly<{
  callRef: string
  principalId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  toolRef: string
  idempotencyKey: string
  inputDigest: string
  attemptRef: string
  effectGeneration: number
}>

export function callAttemptIdentityMaterial(
  input: CallAttemptIdentityInput,
): StableHashValue {
  return {
    format: 'operation-invocation-attempt:v1',
    invocationRef: input.callRef,
    principalId: input.principalId,
    credentialId: input.credentialId,
    applicationRef: input.applicationRef,
    environment: input.environment,
    operationRef: input.toolRef,
    idempotencyKey: input.idempotencyKey,
    inputDigest: input.inputDigest,
    attemptRef: input.attemptRef,
    effectGeneration: input.effectGeneration,
  }
}

export function callAttemptIdentityDigest(
  input: CallAttemptIdentityInput,
): string {
  return canonicalDigest(callAttemptIdentityMaterial(input))
}

export function validateCallAuthority(input: Readonly<{
  authority: CallPersistedAuthority | undefined
  dispatch: Readonly<{
    callRef: string
    toolRef: string
    inputDigest: string
    grantGeneration: number
  }>
  grant: Readonly<{ grantRef: string; generation: number; policyDigest: string; expiresAt: number }>
  principal: AgentAccessPrincipal
  operation: PublishedTool
  descriptor: RuntimePublishedToolDescriptor
  now: number
}>): ExactAmount | undefined {
  const authority = input.authority
  if (authority === undefined) return undefined
  try {
    const authorityExpiresAt = Date.parse(authority.expiresAt)
    const amount = exactAmountSchema.safeParse(authority.limits.amount)
    const fixedPriceAmount = pricingConfigDecisionAmount(input.operation.pricingConfig)
    if (
      !amount.success
      || !Number.isFinite(authorityExpiresAt)
      || !Number.isSafeInteger(authority.grantGeneration)
      || authority.grantGeneration < 1
      || authorityExpiresAt <= input.now
      || authorityExpiresAt > input.operation.readiness.validUntil
      || authorityExpiresAt > input.grant.expiresAt
      || authority.callRef !== input.dispatch.callRef
      || authority.toolRef !== input.dispatch.toolRef
      || authority.inputDigest !== input.dispatch.inputDigest
      || authority.grantRef !== input.grant.grantRef
      || authority.grantGeneration !== input.dispatch.grantGeneration
      || authority.grantGeneration !== input.grant.generation
      || authority.grantDigest !== input.grant.policyDigest
      || authority.consequence !== input.descriptor.consequenceClass
      || authority.targetDigest !== publishedToolIdentityDigest(input.operation.identity)
      || (fixedPriceAmount !== undefined && (
        canonicalDigest(authority.limits as StableHashValue)
          !== canonicalDigest({ amount: fixedPriceAmount } as StableHashValue)
        || canonicalDigest(amount.data as StableHashValue)
          !== canonicalDigest(fixedPriceAmount as StableHashValue)
      ))
    ) return undefined
    const basis = authority.acceptedBasis
    switch (basis.kind) {
      case 'approval_required': {
        if (basis.authorityRef.trim().length === 0 || authority.reference !== basis.authorityRef) return undefined
        break
      }
      case 'spending_policy_use': {
        if (
          basis.spendingPolicyRef.trim().length === 0
          || basis.authorityUseRef.trim().length === 0
          || basis.grantEvidenceRef.trim().length === 0
          || !Number.isSafeInteger(basis.spendingPolicyVersion)
          || basis.spendingPolicyVersion < 1
          || !Number.isSafeInteger(basis.spendingPolicyGeneration)
          || basis.spendingPolicyGeneration !== input.grant.generation
          || authority.reference !== `operation-authority:${input.dispatch.callRef}`
        ) return undefined
        if (input.principal.authorityMode === 'unrestricted_test_only' && (
          basis.spendingPolicyRef !== `agent-access-grant:${input.grant.grantRef}`
          || basis.spendingPolicyVersion !== 1
          || basis.authorityUseRef !== `operation-authority-use:${input.dispatch.callRef}`
          || basis.grantEvidenceRef !== `agent-access-grant-evidence:${input.grant.policyDigest}`
        )) return undefined
        break
      }
      case 'customer_request_authorization_use':
      case 'public_capability_use':
        return undefined
      default: {
        const exhaustive: never = basis
        void exhaustive
        return undefined
      }
    }
    const expectedDecisionDigest = canonicalDigest({
      format: 'operation-invoke-authority:v1',
      invocationRef: authority.callRef,
      operationRef: authority.toolRef,
      inputDigest: authority.inputDigest,
      grantRef: authority.grantRef,
      grantGeneration: authority.grantGeneration,
      grantDigest: authority.grantDigest,
      reference: authority.reference,
      targetDigest: authority.targetDigest,
      consequence: authority.consequence,
      limits: authority.limits,
      expiresAt: authority.expiresAt,
      acceptedBasis: canonicalAuthorityBasisMaterial(authority.acceptedBasis),
    } as StableHashValue)
    return expectedDecisionDigest === authority.decisionDigest ? amount.data : undefined
  } catch {
    return undefined
  }
}
