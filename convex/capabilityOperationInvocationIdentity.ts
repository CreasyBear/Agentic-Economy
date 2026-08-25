import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { OperationInvokePersistedAuthority } from '@/modules/capability-execution/convex'
import { exactAmountSchema, type ExactAmount } from '@/modules/money/public'
import type {
  PublishedOperation,
  RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'

export type OperationInvocationAttemptIdentityInput = Readonly<{
  invocationRef: string
  principalId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  operationRef: string
  idempotencyKey: string
  inputDigest: string
  attemptRef: string
  effectGeneration: number
}>

export function operationInvocationAttemptIdentityMaterial(
  input: OperationInvocationAttemptIdentityInput,
): StableHashValue {
  return {
    format: 'operation-invocation-attempt:v1',
    invocationRef: input.invocationRef,
    principalId: input.principalId,
    credentialId: input.credentialId,
    applicationRef: input.applicationRef,
    environment: input.environment,
    operationRef: input.operationRef,
    idempotencyKey: input.idempotencyKey,
    inputDigest: input.inputDigest,
    attemptRef: input.attemptRef,
    effectGeneration: input.effectGeneration,
  }
}

export function operationInvocationAttemptIdentityDigest(
  input: OperationInvocationAttemptIdentityInput,
): string {
  return canonicalDigest(operationInvocationAttemptIdentityMaterial(input))
}

export function validateOperationInvokeAuthority(input: Readonly<{
  authority: OperationInvokePersistedAuthority | undefined
  dispatch: Readonly<{
    invocationRef: string
    operationRef: string
    inputDigest: string
    grantGeneration: number
  }>
  grant: Readonly<{ grantRef: string; generation: number; policyDigest: string; expiresAt: number }>
  principal: AgentAccessPrincipal
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  now: number
}>): ExactAmount | undefined {
  const authority = input.authority
  if (authority === undefined || input.descriptor.price.kind !== 'fixed') return undefined
  try {
    const authorityExpiresAt = Date.parse(authority.expiresAt)
    const amount = exactAmountSchema.safeParse(authority.limits.amount)
    if (
      !amount.success
      || !Number.isFinite(authorityExpiresAt)
      || !Number.isSafeInteger(authority.grantGeneration)
      || authority.grantGeneration < 1
      || authorityExpiresAt <= input.now
      || authorityExpiresAt > input.operation.readiness.validUntil
      || authorityExpiresAt > input.grant.expiresAt
      || authority.invocationRef !== input.dispatch.invocationRef
      || authority.operationRef !== input.dispatch.operationRef
      || authority.inputDigest !== input.dispatch.inputDigest
      || authority.grantRef !== input.grant.grantRef
      || authority.grantGeneration !== input.dispatch.grantGeneration
      || authority.grantGeneration !== input.grant.generation
      || authority.grantDigest !== input.grant.policyDigest
      || authority.consequence !== input.descriptor.consequenceClass
      || authority.targetDigest !== canonicalDigest(input.operation.identity as StableHashValue)
      || canonicalDigest(authority.limits as StableHashValue)
        !== canonicalDigest({ amount: input.descriptor.price.amount } as StableHashValue)
      || canonicalDigest(amount.data as StableHashValue)
        !== canonicalDigest(input.descriptor.price.amount as StableHashValue)
    ) return undefined
    const basis = authority.acceptedBasis
    switch (basis.kind) {
      case 'approve_each': {
        if (basis.authorityRef.trim().length === 0 || authority.reference !== basis.authorityRef) return undefined
        break
      }
      case 'standing_mandate_use': {
        if (
          basis.mandateRef.trim().length === 0
          || basis.authorityUseRef.trim().length === 0
          || basis.grantEvidenceRef.trim().length === 0
          || !Number.isSafeInteger(basis.mandateVersion)
          || basis.mandateVersion < 1
          || !Number.isSafeInteger(basis.mandateGeneration)
          || basis.mandateGeneration !== input.grant.generation
          || authority.reference !== `operation-authority:${input.dispatch.invocationRef}`
        ) return undefined
        if (input.principal.authorityMode === 'full_yolo' && (
          basis.mandateRef !== `agent-access-grant:${input.grant.grantRef}`
          || basis.mandateVersion !== 1
          || basis.authorityUseRef !== `operation-authority-use:${input.dispatch.invocationRef}`
          || basis.grantEvidenceRef !== `agent-access-grant-evidence:${input.grant.policyDigest}`
        )) return undefined
        break
      }
      case 'customer_request_mandate_use':
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
      invocationRef: authority.invocationRef,
      operationRef: authority.operationRef,
      inputDigest: authority.inputDigest,
      grantRef: authority.grantRef,
      grantGeneration: authority.grantGeneration,
      grantDigest: authority.grantDigest,
      reference: authority.reference,
      targetDigest: authority.targetDigest,
      consequence: authority.consequence,
      limits: authority.limits,
      expiresAt: authority.expiresAt,
      acceptedBasis: authority.acceptedBasis,
    } as StableHashValue)
    return expectedDecisionDigest === authority.decisionDigest ? amount.data : undefined
  } catch {
    return undefined
  }
}
