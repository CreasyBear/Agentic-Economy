import { v, type Infer } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { compareExactAmounts, exactAmountSchema } from '@/modules/money/public'
import { repeatPermissionRef } from '@/modules/customer-request/application/public'
import { compileRouteMandate } from '@/modules/customer-request/route-mandate'
import {
  routeMandateValue,
  standingRouteAuthorityUseValue,
  standingRoutePolicyValue,
} from '@/modules/customer-request/runtime'
import {
  evaluateStandingRouteAuthority,
  standingRoutePolicyDigest,
  type StandingRouteAuthorityUse,
  type StandingRoutePolicy,
} from '@/modules/customer-request/standing-route-authority'

import { internalMutation, internalQuery } from './_generated/server'
import {
  authenticateRequestOwner,
  authenticateRequestOwnerForMutation,
  authenticateRequestOwnerForServiceOperation,
  openCurrentRouteGeneration,
  persistRouteMandateIssue,
  serviceAssertion,
} from './customerRequestRouteMandate'
import { currentRoutePlanGenerationGraphStatus } from './customerRequestV2'
import { routeMandateIssueRecordIsValid } from './customerRequestRouteMandateIntegrity'

const money = v.object({ currency: v.string(), units: v.string(), exponent: v.number() })
const issueCommand = {
  requestId: v.string(),
  expectedRequestRevision: v.number(),
  expectedGenerationRef: v.string(),
  selectedRoutePlanId: v.string(),
  delegatedCredentialId: v.string(),
  perUseSpend: money,
  cumulativeSpend: money,
  perUseDataAllocations: v.number(),
  cumulativeDataAllocations: v.number(),
  occurrences: v.number(),
  validUntil: v.number(),
  idempotencyKey: v.string(),
}
const allowRepeatCommand = v.object({
  requestRef: v.string(),
  revision: v.number(),
  routeRef: v.string(),
  delegatedCredentialId: v.string(),
  occurrences: v.number(),
  cumulativeSpend: money,
  validUntil: v.number(),
  idempotencyKey: v.string(),
})
const useRepeatCommand = v.object({
  requestRef: v.string(),
  revision: v.number(),
  routeRef: v.string(),
  permissionRef: v.string(),
  delegatedCredentialId: v.string(),
  idempotencyKey: v.string(),
})
const revokeRepeatCommand = v.object({
  requestRef: v.string(),
  permissionRef: v.string(),
  routeRef: v.string(),
  idempotencyKey: v.string(),
})
const serviceAuthorization = v.union(
  v.object({
    operation: v.literal('allow_repeat'),
    command: allowRepeatCommand,
    assertion: serviceAssertion,
  }),
  v.object({
    operation: v.literal('use_repeat'),
    command: useRepeatCommand,
    assertion: serviceAssertion,
  }),
  v.object({
    operation: v.literal('revoke_repeat'),
    command: revokeRepeatCommand,
    assertion: serviceAssertion,
  }),
)
type StandingServiceAuthorization = Infer<typeof serviceAuthorization>

const issueResult = v.union(
  v.object({ kind: v.literal('issued'), policy: standingRoutePolicyValue }),
  v.object({ kind: v.literal('replayed'), policy: standingRoutePolicyValue }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(
      v.literal('command_changed'),
      v.literal('request_revision_changed'),
      v.literal('route_generation_changed'),
    ),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authentication_required'),
      v.literal('request_not_found'),
      v.literal('policy_scope_invalid'),
      v.literal('route_generation_invalid'),
      v.literal('credential_not_authorized'),
      v.literal('explicit_confirmation_required'),
    ),
  }),
)

const issueMandateCommand = {
  requestId: v.string(),
  policyRef: v.string(),
  expectedPolicyDigest: v.string(),
  expectedRequestRevision: v.number(),
  expectedGenerationRef: v.string(),
  selectedRoutePlanId: v.string(),
  delegatedCredentialId: v.string(),
  mandateExpiresAt: v.number(),
  idempotencyKey: v.string(),
}
const issueMandateResult = v.union(
  v.object({
    kind: v.literal('issued'),
    use: standingRouteAuthorityUseValue,
    mandate: routeMandateValue,
  }),
  v.object({
    kind: v.literal('replayed'),
    use: standingRouteAuthorityUseValue,
    mandate: routeMandateValue,
  }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(
      v.literal('command_changed'),
      v.literal('request_revision_changed'),
      v.literal('route_generation_changed'),
      v.literal('policy_changed'),
      v.literal('active_mandate_exists'),
    ),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authentication_required'),
      v.literal('request_not_found'),
      v.literal('policy_not_found'),
      v.literal('policy_integrity_invalid'),
      v.literal('principal_mismatch'),
      v.literal('credential_mismatch'),
      v.literal('policy_not_yet_valid'),
      v.literal('policy_expired'),
      v.literal('policy_revoked'),
      v.literal('generation_changed'),
      v.literal('route_not_allowed'),
      v.literal('capability_not_allowed'),
      v.literal('consequential_effect_requires_confirmation'),
      v.literal('spend_limit_exceeded'),
      v.literal('data_limit_exceeded'),
      v.literal('occurrence_limit_exceeded'),
      v.literal('mandate_expiry_invalid'),
      v.literal('prior_use_invalid'),
    ),
  }),
)
const getResult = v.union(
  v.object({ kind: v.literal('active'), policy: standingRoutePolicyValue }),
  v.object({ kind: v.literal('revoked'), policy: standingRoutePolicyValue }),
  v.object({ kind: v.literal('not_found') }),
)
const resolvePermissionResult = v.union(
  v.object({ kind: v.literal('found'), requestRevision: v.number(), policy: standingRoutePolicyValue }),
  v.object({ kind: v.literal('not_found') }),
)
const listPermissionsResult = v.object({
  kind: v.literal('found'),
  permissions: v.array(v.object({
    requestRevision: v.number(),
    policy: standingRoutePolicyValue,
  })),
})
const revokeResult = v.union(
  v.object({ kind: v.literal('revoked'), policy: standingRoutePolicyValue }),
  v.object({ kind: v.literal('replayed'), policy: standingRoutePolicyValue }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(v.literal('command_changed'), v.literal('policy_changed')),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authentication_required'),
      v.literal('request_not_found'),
      v.literal('policy_not_found'),
      v.literal('policy_integrity_invalid'),
    ),
  }),
)

export const issue = internalMutation({
  args: { ...issueCommand, serviceAuthorization: v.optional(serviceAuthorization) },
  returns: issueResult,
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const issueMandate = internalMutation({
  args: { ...issueMandateCommand, serviceAuthorization: v.optional(serviceAuthorization) },
  returns: issueMandateResult,
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const get = internalQuery({
  args: { requestId: v.string(), policyRef: v.string() },
  returns: getResult,
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const resolvePermission = internalQuery({
  args: { requestId: v.string(), permissionRef: v.string(), principalId: v.string() },
  returns: resolvePermissionResult,
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const listPermissions = internalQuery({
  args: { requestId: v.string(), principalId: v.string() },
  returns: listPermissionsResult,
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const revoke = internalMutation({
  args: {
    requestId: v.string(),
    policyRef: v.string(),
    expectedPolicyDigest: v.string(),
    idempotencyKey: v.string(),
    serviceAuthorization: v.optional(serviceAuthorization),
  },
  returns: revokeResult,
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')
  },
})

function domainPolicy(value: unknown): StandingRoutePolicy {
  return value as StandingRoutePolicy
}

async function authenticateStandingRequestOwner(
  ctx: Parameters<typeof authenticateRequestOwnerForMutation>[0],
  requestId: string,
  expectedOperation: StandingServiceAuthorization['operation'],
  authorization?: StandingServiceAuthorization,
) {
  if (authorization === undefined) {
    return await authenticateRequestOwnerForMutation(ctx, requestId)
  }
  if (authorization.command.requestRef !== requestId) {
    return { kind: 'unauthenticated' as const }
  }
  if (authorization.operation !== expectedOperation) {
    return { kind: 'unauthenticated' as const }
  }
  return await authenticateRequestOwnerForServiceOperation(
    ctx,
    requestId,
    authorization.operation,
    authorization.command,
    authorization.assertion,
  )
}

function domainUse(value: unknown): StandingRouteAuthorityUse {
  return value as StandingRouteAuthorityUse
}

function validUse(use: StandingRouteAuthorityUse): boolean {
  const { authorityUseRef: _ref, authorityUseDigest: _digest, ...material } = use
  return use.authorityUseRef === `standing-authority-use:v1:${use.authorityUseDigest}`
    && canonicalDigest(material) === use.authorityUseDigest
}

function writableUse(use: StandingRouteAuthorityUse) {
  return { ...use, maximumSpend: { ...use.maximumSpend } }
}

function writablePolicy(policy: StandingRoutePolicy) {
  return {
    ...policy,
    routes: policy.routes.map((route) => ({ ...route })),
    capabilityContracts: policy.capabilityContracts.map((contract) => ({ ...contract })),
    allowedEffectClasses: [...policy.allowedEffectClasses],
    limits: {
      ...policy.limits,
      perUseSpend: { ...policy.limits.perUseSpend },
      cumulativeSpend: { ...policy.limits.cumulativeSpend },
    },
    fallback: { ...policy.fallback },
  }
}

function policyMaterial(
  policy: StandingRoutePolicy,
): Omit<StandingRoutePolicy, 'policyRef' | 'policyDigest'> {
  const { policyRef: _policyRef, policyDigest: _policyDigest, ...material } = policy
  return material
}

function validStoredPolicy(
  issueRow: Readonly<{
    policyRef: string
    policyDigest: string
    principalId: string
    requestId: string
    policy: unknown
  }>,
  policy: StandingRoutePolicy,
  requestId: string,
): boolean {
  return standingRoutePolicyDigest(policyMaterial(policy)) === policy.policyDigest
    && policy.policyRef === issueRow.policyRef
    && policy.policyDigest === issueRow.policyDigest
    && policy.principalId === issueRow.principalId
    && issueRow.requestId === requestId
}

function validPolicyRevocation(
  revocation: Readonly<{
    revocationRef: string
    revocationDigest: string
    policyRef: string
    policyDigest: string
    principalId: string
    requestId: string
    revokedAt: number
  }>,
  policy: StandingRoutePolicy,
  requestId: string,
): boolean {
  const material = {
    policyRef: revocation.policyRef,
    policyDigest: revocation.policyDigest,
    principalId: revocation.principalId,
    requestId: revocation.requestId,
    revokedAt: revocation.revokedAt,
  }
  return revocation.policyRef === policy.policyRef
    && revocation.policyDigest === policy.policyDigest
    && revocation.principalId === policy.principalId
    && revocation.requestId === requestId
    && revocation.revocationDigest === canonicalDigest(material)
    && revocation.revocationRef === `standing-route-policy-revocation:v1:${revocation.revocationDigest}`
}

function validIdentifier(value: string): boolean {
  return value.trim().length > 0
}

function validPositiveCount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}


function credentialBelongsToAuthenticatedRequest(
  credential: Readonly<{
    principalId: string
    credentialId: string
    ownerTokenIdentifier?: string
  }>,
  authenticated: Readonly<{
    principalId: string
    identity: Readonly<{ tokenIdentifier: string }>
  }>,
): boolean {
  return credential.ownerTokenIdentifier === authenticated.identity.tokenIdentifier
    || (credential.principalId === authenticated.principalId
      && credential.credentialId === authenticated.identity.tokenIdentifier)
}
