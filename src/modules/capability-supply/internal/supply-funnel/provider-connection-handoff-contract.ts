import { z } from 'zod'

import type {
  ProviderConnectionCleanupOutcome,
  ProviderConnectionOwnerProjection,
} from '../../provider-connection'

const authenticationSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('api_key'),
    location: z.enum(['header', 'query']),
    name: z.string().min(1).max(200),
  }),
  z.strictObject({ kind: z.literal('http_bearer') }),
  z.strictObject({ kind: z.literal('mcp_oauth') }),
])

export const ownerProviderConnectionAttemptSchema = z.strictObject({
  attemptRef: z.string().min(1).max(300),
  businessRef: z.string().min(1).max(500),
  sourceKind: z.enum(['http_credential', 'mcp_oauth']),
  sourceUrl: z.url().max(2_048),
  sourceOrigin: z.url().max(2_048),
  authentication: authenticationSchema,
  environment: z.enum(['sandbox', 'production']),
  state: z.enum(['pending', 'consumed', 'expired', 'cancelled']),
  connectionRef: z.string().min(1).max(300).optional(),
  draftRef: z.string().min(1).max(300).optional(),
  expiresAt: z.number().int().nonnegative(),
})

export const ownerProviderConnectionAttemptInputSchema = z.strictObject({
  attemptRef: z.string().trim().min(1).max(300),
})

export const completeOwnerHttpProviderConnectionInputSchema = z.strictObject({
  attemptRef: z.string().trim().min(1).max(300),
  credential: z.string().min(1).max(32_768),
  idempotencyKey: z.string().trim().min(8).max(200),
})

export const startOwnerMcpProviderConnectionInputSchema = z.strictObject({
  attemptRef: z.string().trim().min(1).max(300),
  idempotencyKey: z.string().trim().min(8).max(200),
  callbackUrl: z.url().max(2_048),
})

export const completeOwnerMcpProviderConnectionInputSchema = z.strictObject({
  attemptRef: z.string().trim().min(1).max(300),
  callbackParameters: z.array(z.tuple([
    z.string().min(1).max(200),
    z.string().max(8_192),
  ])).min(1).max(32),
})

export type OwnerProviderConnectionAttemptReadback =
  | Readonly<{
      kind: 'available'
      attempt: z.infer<typeof ownerProviderConnectionAttemptSchema>
    }>
  | Readonly<{ kind: 'not_found' }>

export type OwnerHttpProviderConnectionResult =
  | Readonly<{
      kind: 'connected' | 'replayed'
      connection: ProviderConnectionOwnerProjection
    }>
  | Readonly<{
      kind: 'refused'
      code:
        | 'not_found'
        | 'attempt_expired'
        | 'not_supported'
        | 'reauthentication_required'
        | 'secret_unavailable'
        | 'connection_conflict'
        | 'source_unavailable'
    }>

export type ProviderOAuthCleanupResult = Readonly<{
  outcome: ProviderConnectionCleanupOutcome
  responseDigest?: string
  reasonCode: string
  evidenceRefs: string[]
}>

export type SecretPointerInput = Readonly<{
  secretRef: string
  activeGeneration: string
  pointerRevision: number
}>

export type OwnerMcpProviderConnectionStartResult =
  | Readonly<{ kind: 'redirect'; authorizationUrl: string }>
  | Extract<OwnerHttpProviderConnectionResult, { kind: 'refused' }>
