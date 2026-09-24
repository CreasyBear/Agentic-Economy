import { v } from 'convex/values'
import type { Id } from '../../../_generated/dataModel'
import type { BusinessActor } from '../../../../src/modules/business/public'
import { serviceAssertion } from '../../../serviceAssertion'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import { lifecycle } from '../providerConnections/contracts'

export const ownerProjection = v.object({
  connectionRef: v.string(),
  businessId: v.string(),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  sourceOrigin: v.optional(v.string()),
  sourceEnvironment: v.optional(v.union(v.literal('sandbox'), v.literal('production'))),
  sourceAuthentication: v.optional(v.union(
    v.object({
      kind: v.literal('api_key'),
      location: v.union(v.literal('header'), v.literal('query')),
      name: v.string(),
    }),
    v.object({ kind: v.literal('http_bearer') }),
    v.object({ kind: v.literal('mcp_oauth') }),
  )),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
  lifecycle,
  available: v.boolean(),
  credentialConfigured: v.boolean(),
  x402Method: v.optional(v.union(v.literal('GET'), v.literal('POST'))),
  x402Payee: v.optional(v.string()),
  healthStatus: v.optional(v.union(v.literal('healthy'), v.literal('unhealthy'))),
  healthCheckedAt: v.optional(v.number()),
  healthSubject: v.optional(v.string()),
  healthReasonCode: v.optional(v.string()),
  observedAt: v.number(),
  expiresAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  reasonCode: v.union(v.string(), v.null()),
  evidenceRefs: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
export const ownerCommandResult = v.union(
  v.object({ kind: v.literal('applied'), connection: ownerProjection, commandDigest: v.string() }),
  v.object({ kind: v.literal('duplicate'), connection: ownerProjection, commandDigest: v.string() }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('invalid_identity'), v.literal('invalid_time'), v.literal('invalid_scope'),
      v.literal('invalid_resource'), v.literal('invalid_generation'), v.literal('invalid_digest'),
      v.literal('invalid_transition'), v.literal('command_identity_conflict'),
      v.literal('reauthentication_required'), v.literal('proof_stale'),
      v.literal('proof_replayed'), v.literal('command_changed'), v.literal('rate_limited'),
      v.literal('security_control_unavailable'),
    ),
    correlationRef: v.optional(v.string()),
  }),
)

export const readOwnerArgs = {
  connectionRef: v.string(),
} as const
export const listOwnerArgs = {} as const
export const prepareOwnerMcpRuntimeArgsValue = v.object({
  connectionRef: v.string(),
  correlationRef: v.string(),
  serviceAuth: serviceAssertion,
})
export const prepareOwnerMcpRuntimeArgs = prepareOwnerMcpRuntimeArgsValue.fields
export const prepareOwnerHttpRuntimeArgs = prepareOwnerMcpRuntimeArgsValue.fields
export const ownerHttpRuntimeResult = v.union(
  v.object({
    kind: v.literal('available'),
    connection: v.object({
      connectionRef: v.string(),
      businessRef: v.string(),
      sourceUrl: v.string(),
      sourceOrigin: v.string(),
      environment: v.union(v.literal('sandbox'), v.literal('production')),
      authentication: v.union(
        v.object({
          kind: v.literal('api_key'),
          location: v.union(v.literal('header'), v.literal('query')),
          name: v.string(),
        }),
        v.object({ kind: v.literal('http_bearer') }),
      ),
      secretRef: v.string(),
      activeGeneration: v.string(),
      pointerRevision: v.number(),
    }),
  }),
  v.object({ kind: v.literal('not_found') }),
)
export const ownerMcpRuntimeResult = v.union(
  v.object({
    kind: v.literal('available'),
    connection: v.object({
      connectionRef: v.string(),
      businessRef: v.string(),
      sourceUrl: v.string(),
      secretRef: v.string(),
      activeGeneration: v.string(),
      pointerRevision: v.number(),
      rotationAuthority: v.object({
        operation: v.literal('rotate'),
        snapshotRef: v.string(),
        accountRef: v.string(),
        actorPrincipalRef: v.string(),
        grantRef: v.string(),
        grantGeneration: v.number(),
        correlationRef: v.string(),
        idempotencyRef: v.string(),
        occurredAt: v.number(),
      }),
    }),
  }),
  v.object({ kind: v.literal('not_found') }),
)
export const revokeOwnerArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
} as const
export const retryOwnerCleanupArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
} as const
export const reauthorizeOwnerArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
} as const
export const connectX402OwnerArgs = {
  businessId: v.id('businesses'),
  resourceUrl: v.string(),
  commandId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  method: v.union(v.literal('GET'), v.literal('POST')),
  observationDigest: v.string(),
  payTo: v.string(),
  claimExpiresAt: v.number(),
  claimDigest: v.string(),
  claimSignature: v.string(),
  proof: v.optional(v.object({
    reverificationId: v.string(),
    firstFactorAgeMinutes: v.number(),
    secondFactorAgeMinutes: v.number(),
  })),
  evidenceRefs: v.array(v.string()),
  ...sourceWriteArgs,
} as const
export const checkX402OwnerArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  method: v.union(v.literal('GET'), v.literal('POST')),
  resourceUrl: v.string(),
  payee: v.string(),
  status: v.union(v.literal('healthy'), v.literal('unhealthy')),
  checkedAt: v.number(),
  observationDigest: v.string(),
  reasonCode: v.optional(v.string()),
  ...sourceWriteArgs,
} as const

export type ReauthorizeOwnerArgs = {
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  reasonCode?: string
  evidenceRefs: string[]
}

export type RevokeOwnerArgs = ReauthorizeOwnerArgs

export type RetryOwnerCleanupArgs = {
  connectionRef: string
  commandId: string
}

export type ConnectX402OwnerArgs = {
  businessId: Id<'businesses'>
  resourceUrl: string
  commandId: string
  operationKey: string
  correlationId: string
  method: 'GET' | 'POST'
  observationDigest: string
  payTo: string
  claimExpiresAt: number
  claimDigest: string
  claimSignature: string
  proof?: {
    reverificationId: string
    firstFactorAgeMinutes: number
    secondFactorAgeMinutes: number
  }
  evidenceRefs: string[]
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}

export type CheckX402OwnerArgs = {
  connectionRef: string
  commandId: string
  operationKey: string
  correlationId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  method: 'GET' | 'POST'
  resourceUrl: string
  payee: string
  status: 'healthy' | 'unhealthy'
  checkedAt: number
  observationDigest: string
  reasonCode?: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}

type AuthenticatedBusinessActor = Extract<BusinessActor, { kind: 'authenticated_owner' }>

export type ProviderConnectionActor = Readonly<{
  canonicalPrincipalRef: string
  canonicalAccountRef: string
  authorityRevision?: AuthenticatedBusinessActor['authorityRevision']
  authorityProvenance?: AuthenticatedBusinessActor['authorityProvenance']
  authorityGrantRef?: string
}>
