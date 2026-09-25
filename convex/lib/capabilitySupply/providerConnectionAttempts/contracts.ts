import { v } from 'convex/values'

import { agentAccessPrincipalValue } from '../../../agentAccessPrincipals'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import { ownerProjection } from '../providerConnectionOwner/owner'

export const authenticationValue = v.union(
  v.object({
    kind: v.literal('api_key'),
    location: v.union(v.literal('header'), v.literal('query')),
    name: v.string(),
  }),
  v.object({ kind: v.literal('http_bearer') }),
  v.object({ kind: v.literal('mcp_oauth') }),
)

const reserveAttemptFields = {
  businessId: v.id('businesses'),
  sourceKind: v.union(v.literal('http_credential'), v.literal('mcp_oauth')),
  sourceUrl: v.string(),
  sourceDescriptorJson: v.optional(v.string()),
  authentication: authenticationValue,
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  inputDigest: v.string(),
  commandId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  candidateDraftRef: v.optional(v.string()),
  candidateSourceDigest: v.optional(v.string()),
} as const

export const reserveAgentArgsValue = v.object({
  ...reserveAttemptFields,
  agentPrincipal: agentAccessPrincipalValue,
  ...sourceWriteArgs,
})

export const reserveOwnerArgsValue = v.object({
  ...reserveAttemptFields,
  ...sourceWriteArgs,
})

export const reservationResultValue = v.union(
  v.object({
    kind: v.union(v.literal('reserved'), v.literal('replayed')),
    attemptRef: v.string(),
    expiresAt: v.number(),
    draftRef: v.optional(v.string()),
    candidateDraftRef: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('invalid_identity'),
      v.literal('invalid_environment'),
      v.literal('invalid_source'),
      v.literal('command_identity_conflict'),
    ),
  }),
)

export const ownerAttemptValue = v.object({
  attemptRef: v.string(),
  businessRef: v.string(),
  sourceKind: v.union(v.literal('http_credential'), v.literal('mcp_oauth')),
  sourceUrl: v.string(),
  sourceOrigin: v.string(),
  authentication: authenticationValue,
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  state: v.union(
    v.literal('pending'),
    v.literal('consumed'),
    v.literal('expired'),
    v.literal('cancelled'),
  ),
  connectionRef: v.optional(v.string()),
  expiresAt: v.number(),
  draftRef: v.optional(v.string()),
  candidateDraftRef: v.optional(v.string()),
})

export const readOwnerResultValue = v.union(
  v.object({ kind: v.literal('available'), attempt: ownerAttemptValue }),
  v.object({ kind: v.literal('not_found') }),
)

export const readOwnerSourceDraftResultValue = v.union(
  v.object({ kind: v.literal('not_found') }),
  v.object({
    kind: v.literal('available'),
    draft: v.object({
      draftRef: v.string(),
      businessRef: v.string(),
      sourceKind: v.union(v.literal('mcp'), v.literal('agent_plugin')),
      sourceDescriptorJson: v.string(),
      expectedSourceDigest: v.string(),
      sourceRevision: v.string(),
      sourceUrl: v.string(),
      remoteRef: v.optional(v.string()),
      environment: v.union(v.literal('sandbox'), v.literal('production')),
      state: v.union(
        v.literal('pending'),
        v.literal('connected'),
        v.literal('consumed'),
        v.literal('expired'),
        v.literal('cancelled'),
      ),
      connectionRef: v.optional(v.string()),
      expiresAt: v.number(),
    }),
  }),
)

const strictProofValue = v.object({
  reverificationId: v.string(),
  firstFactorAgeMinutes: v.number(),
  secondFactorAgeMinutes: v.number(),
})

export const prepareOwnerArgsValue = v.object({
  attemptRef: v.string(),
  commandId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  proof: strictProofValue,
  ...sourceWriteArgs,
})

export const cancelOwnerResultValue = v.union(
  v.object({ kind: v.literal('cancelled'), state: v.literal('cancelled') }),
  v.object({ kind: v.literal('unchanged'), state: v.union(v.literal('cancelled'), v.literal('consumed'), v.literal('expired')) }),
  v.object({ kind: v.literal('refused'), code: v.literal('not_found') }),
)

export const secretAuthorityValue = v.object({
  operation: v.union(v.literal('provision'), v.literal('rotate')),
  snapshotRef: v.string(),
  accountRef: v.string(),
  actorPrincipalRef: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  correlationRef: v.string(),
  idempotencyRef: v.string(),
  occurredAt: v.number(),
})

export const prepareOAuthOwnerResultValue = v.union(
  v.object({
    kind: v.literal('prepared'),
    attemptRef: v.string(),
    secretRef: v.string(),
    provisionAuthority: secretAuthorityValue,
    rotationAuthority: secretAuthorityValue,
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('not_found'),
      v.literal('attempt_expired'),
      v.literal('reauthentication_required'),
      v.literal('proof_stale'),
      v.literal('proof_replayed'),
      v.literal('command_changed'),
      v.literal('rate_limited'),
      v.literal('security_control_unavailable'),
      v.literal('authority_mismatch'),
      v.literal('connection_conflict'),
    ),
  }),
)

export const bindOAuthOwnerResultValue = v.union(
  v.object({ kind: v.union(v.literal('bound'), v.literal('replayed')) }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('not_found'),
      v.literal('attempt_expired'),
      v.literal('secret_unavailable'),
      v.literal('connection_conflict'),
    ),
  }),
)

export const oauthCallbackResultValue = v.union(
  v.object({
    kind: v.literal('available'),
    attempt: v.object({
      attemptRef: v.string(),
      sourceUrl: v.string(),
      environment: v.union(v.literal('sandbox'), v.literal('production')),
      secretRef: v.string(),
      activeGeneration: v.string(),
      pointerRevision: v.number(),
    }),
  }),
  v.object({ kind: v.literal('not_found') }),
)

export const prepareOwnerResultValue = v.union(
  v.object({
    kind: v.literal('prepared'),
    attemptRef: v.string(),
    secretRef: v.string(),
    authority: secretAuthorityValue,
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('not_found'),
      v.literal('attempt_expired'),
      v.literal('reauthentication_required'),
      v.literal('proof_stale'),
      v.literal('proof_replayed'),
      v.literal('command_changed'),
      v.literal('rate_limited'),
      v.literal('security_control_unavailable'),
      v.literal('authority_mismatch'),
      v.literal('connection_conflict'),
    ),
  }),
)

export const finalizeOwnerArgsValue = v.object({
  attemptRef: v.string(),
  secretRef: v.string(),
  provisionCommandId: v.string(),
  commandId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})

export const finalizeOwnerResultValue = v.union(
  v.object({
    kind: v.union(v.literal('connected'), v.literal('replayed')),
    connection: ownerProjection,
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('not_found'),
      v.literal('attempt_expired'),
      v.literal('secret_unavailable'),
      v.literal('connection_conflict'),
    ),
  }),
)

export const reserveAgentArgs = reserveAgentArgsValue.fields
export const reserveOwnerArgs = reserveOwnerArgsValue.fields
export const reserveAgentResult = reservationResultValue
export const reserveOwnerResult = reservationResultValue

export const readOwnerArgs = { attemptRef: v.string() }
export const readOwnerResult = readOwnerResultValue

export const readOwnerSourceDraftArgs = { draftRef: v.string() }
export const readOwnerSourceDraftResult = readOwnerSourceDraftResultValue

export const prepareOwnerArgs = prepareOwnerArgsValue.fields
export const prepareOwnerResult = prepareOwnerResultValue
export const cancelOwnerResult = cancelOwnerResultValue

export const prepareOAuthOwnerArgs = prepareOwnerArgsValue.fields
export const prepareOAuthOwnerResult = prepareOAuthOwnerResultValue

export const bindOAuthOwnerArgsValue = v.object({
  attemptRef: v.string(),
  stateHash: v.string(),
  secretRef: v.string(),
  provisionCommandId: v.string(),
  commandId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})

export const bindOAuthOwnerArgs = bindOAuthOwnerArgsValue.fields

export const bindOAuthOwnerResult = bindOAuthOwnerResultValue

export const readOAuthCallbackOwnerArgs = {
  attemptRef: v.string(),
  stateHash: v.string(),
  observedAt: v.number(),
}
export const readOAuthCallbackOwnerResult = oauthCallbackResultValue

export const finalizeOwnerArgs = finalizeOwnerArgsValue.fields
export const finalizeOwnerResult = finalizeOwnerResultValue
