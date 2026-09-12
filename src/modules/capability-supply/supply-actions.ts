import { z } from 'zod'
import type { FunctionReference, FunctionReturnType } from 'convex/server'

import { isRecord } from '@/modules/common/is-record'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  callPublicSourceMutation,
  sourceMutation,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'
import { defineAction, idempotencyKeySchema, type ActionParameter } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { currencySchema, exactAmountSchema, ProviderEarningsViewSchema } from '@/modules/money/public'
import { base64Codec, tryDecodeBase64Url } from '@/modules/common/base64-codec'
import type { OwnerProviderEarningsReadback } from './internal/supply-funnel/earnings-readback'
import type {
  OwnerSupplyCommandResult,
  OwnerSupplyFunnelReadback,
} from './internal/supply-funnel/types'
import type { PublishPreparedCapabilityCommandResult } from './internal/publication'
import { inspectX402SellerEndpoint } from './internal/x402-seller-endpoint-inspector'
import {
  validX402SellerClaimTime,
  x402SellerClaimDigest,
  x402SellerClaimMessage,
} from './internal/x402-seller-claim'
import {
  canonicalEvmAddress,
  evmAddressEquals,
  verifyEip191Message,
} from './internal/x402-evm-protocol'
import {
  previewSupplySource,
  supplySourceInputSchema,
  supplySourcePreviewSchema,
  type SupplySourceInput,
  type SupplySourcePreview,
} from './source-preview'
import {
  prepareSupplyPublicationV2,
  publishSupplyToolV2InputSchema,
  type PublishSupplyToolV2Input,
} from './supply-publication-v2'
import { providerToolStatusSchema } from './provider-tool-status'
import {
  providerOffboardingStatusSchema,
} from './provider-offboarding'

const publicationLifecycleSchema = z.strictObject({
  state: z.enum(['inactive', 'active', 'withdrawn', 'incompatible']),
  reasons: z.array(z.string()),
})
const actionRefusalSchema = z.strictObject({
  kind: z.literal('refused'),
  reason: z.string(),
})

export const SUPPLY_ACTION_IDS = Object.freeze({
  sourcePreview: 'supply.source.preview',
  toolsList: 'supply.tools.list',
  status: 'supply.status',
  publish: 'supply.publish',
  withdraw: 'supply.withdraw',
  recheck: 'supply.recheck',
  republish: 'supply.republish',
  earnings: 'supply.earnings',
  calls: 'supply.calls',
  connectionList: 'supply.connection.list',
  connectionDetail: 'supply.connection.detail',
  connectionConnect: 'supply.connection.connect',
  connectionReconnect: 'supply.connection.reconnect',
  connectionRevoke: 'supply.connection.revoke',
  offboardingStatus: 'supply.offboarding.status',
} as const)

export const SUPPLY_ACTION_ROUTE_CONTRACTS = Object.freeze({
  sourcePreview: Object.freeze({ actionId: SUPPLY_ACTION_IDS.sourcePreview, contractVersion: 'supply.source.preview:v1', method: 'POST' as const, path: '/api/v1/supply/sources/preview', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  toolsList: Object.freeze({ actionId: SUPPLY_ACTION_IDS.toolsList, contractVersion: 'supply.tools.list:v1', method: 'POST' as const, path: '/api/v1/supply/tools/list', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  status: Object.freeze({ actionId: SUPPLY_ACTION_IDS.status, contractVersion: 'supply.status:v2', method: 'POST' as const, path: '/api/v1/supply/status', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  publish: Object.freeze({ actionId: SUPPLY_ACTION_IDS.publish, contractVersion: 'supply.publish:v2', method: 'POST' as const, path: '/api/v1/supply/publish', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  withdraw: Object.freeze({ actionId: SUPPLY_ACTION_IDS.withdraw, contractVersion: 'supply-withdrawal:v1', method: 'POST' as const, path: '/api/v1/supply/withdraw', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  recheck: Object.freeze({ actionId: SUPPLY_ACTION_IDS.recheck, contractVersion: 'supply-recheck:v1', method: 'POST' as const, path: '/api/v1/supply/recheck', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  republish: Object.freeze({ actionId: SUPPLY_ACTION_IDS.republish, contractVersion: 'supply-republish:v1', method: 'POST' as const, path: '/api/v1/supply/republish', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  earnings: Object.freeze({ actionId: SUPPLY_ACTION_IDS.earnings, contractVersion: 'supply-earnings:v1', method: 'POST' as const, path: '/api/v1/supply/earnings', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  calls: Object.freeze({ actionId: SUPPLY_ACTION_IDS.calls, contractVersion: 'supply-calls:v1', method: 'POST' as const, path: '/api/v1/supply/calls', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionList: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionList, contractVersion: 'supply.connection.list:v2', method: 'POST' as const, path: '/api/v1/supply/connections/list', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionDetail: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionDetail, contractVersion: 'supply.connection.detail:v2', method: 'POST' as const, path: '/api/v1/supply/connections/detail', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionConnect: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionConnect, contractVersion: 'supply.connection.connect:v3', method: 'POST' as const, path: '/api/v1/supply/connections/connect', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionReconnect: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionReconnect, contractVersion: 'supply.connection.reconnect:v2', method: 'POST' as const, path: '/api/v1/supply/connections/reconnect', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionRevoke: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionRevoke, contractVersion: 'supply.connection.revoke:v2', method: 'POST' as const, path: '/api/v1/supply/connections/revoke', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  offboardingStatus: Object.freeze({ actionId: SUPPLY_ACTION_IDS.offboardingStatus, contractVersion: 'supply.offboarding.status:v1', method: 'POST' as const, path: '/api/v1/supply/offboarding/status', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
})

export const supplyToolsListInputSchema = z.strictObject({
  businessRef: z.string().trim().min(1),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).optional(),
})
export type SupplyToolsListInput = z.infer<typeof supplyToolsListInputSchema>
export const supplyToolsListResultSchema = z.union([
  z.strictObject({
    kind: z.literal('available'),
    schemaVersion: z.literal('provider_tools:v1'),
    businessRef: z.string(),
    page: z.array(providerToolStatusSchema),
    isDone: z.boolean(),
    continueCursor: z.string().nullable(),
  }),
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({ kind: z.literal('incomplete') }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])
export type SupplyToolsListResult = z.infer<typeof supplyToolsListResultSchema>

export const supplyStatusInputSchema = z.strictObject({
  businessRef: z.string().trim().min(1),
  toolRef: z.string().trim().min(1),
})
export type SupplyStatusInput = z.infer<typeof supplyStatusInputSchema>
export const supplyStatusResultSchema = z.union([
  z.strictObject({
    kind: z.literal('available'),
    schemaVersion: z.literal('provider_tools:v1'),
    businessRef: z.string(),
    status: providerToolStatusSchema,
  }),
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({ kind: z.literal('incomplete') }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])
export type SupplyStatusResult = z.infer<typeof supplyStatusResultSchema>

export const supplyPublishInputSchema = publishSupplyToolV2InputSchema
export type SupplyPublishInput = PublishSupplyToolV2Input
export const supplyPublishResultSchema = z.union([
  z.strictObject({
    kind: z.enum(['submitted', 'replayed']),
    publicationRef: z.string(),
    publicationRevision: z.number().int().positive(),
    toolRef: z.string(),
    state: z.literal('Submitted'),
  }),
  actionRefusalSchema,
])
export type SupplyPublishResult = z.infer<typeof supplyPublishResultSchema>

export const supplyWithdrawInputSchema = z.strictObject({
  businessId: z.string().trim().min(1),
  offeringRef: z.string().trim().min(1),
  offeringRevision: z.number().int().positive(),
  offeringSourceHash: z.string().trim().min(1),
  publicationRef: z.string().trim().min(1),
  publicationRevision: z.number().int().positive(),
  idempotencyKey: idempotencyKeySchema,
})
export type SupplyWithdrawInput = z.infer<typeof supplyWithdrawInputSchema>
export const supplyWithdrawResultSchema = z.union([
  z.strictObject({
    kind: z.literal('withdrawn'),
    publicationRef: z.string(),
    revision: z.number().int().positive(),
    lifecycle: publicationLifecycleSchema,
  }),
  actionRefusalSchema,
])
export type SupplyWithdrawResult = z.infer<typeof supplyWithdrawResultSchema>

export type SupplyRecheckInput = SupplyWithdrawInput
export const supplyRecheckResultSchema = z.union([
  z.strictObject({
    kind: z.literal('refreshed'),
    publicationRef: z.string(),
    revision: z.number().int().positive(),
    disposition: z.enum(['current', 'incompatible']),
    lifecycle: publicationLifecycleSchema,
  }),
  actionRefusalSchema,
])
export type SupplyRecheckResult = z.infer<typeof supplyRecheckResultSchema>

export type SupplyRepublishInput = SupplyWithdrawInput
export const supplyRepublishResultSchema = z.union([
  z.strictObject({
    kind: z.literal('republished'),
    publicationRef: z.string(),
    revision: z.number().int().positive(),
    toolRef: z.string(),
    bindingId: z.string(),
    lifecycle: publicationLifecycleSchema,
  }),
  actionRefusalSchema,
])
export type SupplyRepublishResult = z.infer<typeof supplyRepublishResultSchema>

export const supplyEarningsInputSchema = z.strictObject({ currency: currencySchema })
export type SupplyEarningsInput = z.infer<typeof supplyEarningsInputSchema>
const earningsSchema = ProviderEarningsViewSchema
const payoutSchema = z.strictObject({
  businessId: z.string(),
  accountState: z.enum(['missing', 'not_started', 'onboarding_started', 'submitted', 'restricted', 'ready']),
  payoutState: z.enum(['review', 'held_kyc', 'held_threshold', 'transfer_pending', 'paid', 'reversed', 'failed', 'outcome_unknown']).optional(),
  providerNet: exactAmountSchema,
  minimumPayout: exactAmountSchema,
  transferStatus: z.enum(['pending', 'succeeded', 'failed', 'reversed', 'outcome_unknown']).optional(),
  providerRecoveryDeadlineAt: z.number().optional(),
  recoveryState: z.enum(['provider_id', 'idempotency_key', 'admin_intervention']).optional(),
  evidenceDigest: z.string().optional(),
  reversalEvidenceDigest: z.string().optional(),
  providerHeldBefore: exactAmountSchema.optional(),
  providerHeldAfter: exactAmountSchema.optional(),
  providerPaidBefore: exactAmountSchema.optional(),
  providerPaidAfter: exactAmountSchema.optional(),
  evidence: z.enum(['source', 'labelled_local_dev']),
})
const payoutProjectionSchema = z.object(payoutSchema.shape).pipe(payoutSchema)
export const supplyEarningsResultSchema = z.union([
  z.strictObject({
    kind: z.literal('available'),
    businessId: z.string(),
    currency: z.string(),
    earnings: earningsSchema,
    payout: payoutSchema,
  }),
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])
export type SupplyEarningsResult = z.infer<typeof supplyEarningsResultSchema>

// `capability-supply` may not depend on `capability-execution` or `registry`
// (see `src/modules/module-boundaries.ts`), so the canonical Call state
// vocabulary and the opaque-cursor envelope are re-declared locally rather
// than imported across that boundary.
export const callStateValues = ['pending', 'completed', 'refused', 'reconciliation_required', 'cancelled'] as const
export const callStateSchema = z.enum(callStateValues)

const SUPPLY_CALLS_CURSOR_KIND = 'supply-calls'
const MAX_SUPPLY_CALLS_CURSOR_LENGTH = 512
const supplyCallsCursorEnvelopeSchema = z.strictObject({
  kind: z.literal(SUPPLY_CALLS_CURSOR_KIND),
  scope: z.string(),
  cursor: z.string(),
})
/** Opaque, scope-bound continuation token (same envelope shape as `@/modules/registry/opaque-cursor`, kept local to respect the module boundary). */
function encodeSupplyCallsCursor(input: Readonly<{ scope: string; cursor: string }>): string {
  return base64Codec.toBase64Url(new TextEncoder().encode(JSON.stringify({ kind: SUPPLY_CALLS_CURSOR_KIND, ...input })))
}
function decodeSupplyCallsCursor(token: string, scope: string): string | undefined {
  if (token.length === 0 || token.length > MAX_SUPPLY_CALLS_CURSOR_LENGTH) return undefined
  const bytes = tryDecodeBase64Url(token)
  if (bytes === undefined) return undefined
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(bytes))
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'decodeSupplyCallsCursor', reason: 'invalid_response' })
  }
  const parsed = supplyCallsCursorEnvelopeSchema.safeParse(json)
  if (!parsed.success || parsed.data.scope !== scope) return undefined
  return parsed.data.cursor
}

export const supplyCallsInputSchema = z.strictObject({
  state: callStateSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().min(1).max(512).optional(),
})
export type SupplyCallsInput = z.infer<typeof supplyCallsInputSchema>
export const supplyCallOutcomeSchema = z.enum(['completed', 'pending', 'needs_authority', 'reconciliation_required', 'refused'])
export const supplyCallSummarySchema = z.strictObject({
  callRef: z.string(),
  toolRef: z.string(),
  state: callStateSchema,
  outcome: supplyCallOutcomeSchema.optional(),
  settledAmount: exactAmountSchema.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export const supplyCallsResultSchema = z.union([
  z.strictObject({
    kind: z.literal('available'),
    items: z.array(supplyCallSummarySchema).max(100),
    limit: z.number(),
    hasMore: z.boolean(),
    nextCursor: z.string().min(1).max(512).optional(),
  }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])
export type SupplyCallsResult = z.infer<typeof supplyCallsResultSchema>

export const providerConnectionLifecycleSchema = z.enum([
  'active',
  'reauthorization_required',
  'revocation_pending',
  'cleanup_required',
  'revoked',
])
export const providerConnectionProjectionSchema = z.strictObject({
  connectionRef: z.string(),
  businessId: z.string(),
  providerRef: z.string(),
  providerAccountRef: z.string(),
  adapterId: z.string(),
  grantedScopes: z.array(z.string()),
  grantedResources: z.array(z.string()),
  authorityGeneration: z.number().int().nonnegative(),
  authorityDigest: z.string(),
  lifecycle: providerConnectionLifecycleSchema,
  available: z.boolean(),
  credentialConfigured: z.boolean(),
  observedAt: z.number(),
  expiresAt: z.number().optional(),
  revokedAt: z.number().optional(),
  reasonCode: z.string().nullable(),
  evidenceRefs: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type ProviderConnectionProjection = z.infer<typeof providerConnectionProjectionSchema>

export const supplyConnectionListInputSchema = z.strictObject({
  businessId: z.string().trim().min(1),
  lifecycle: providerConnectionLifecycleSchema.optional(),
  limit: z.number().int().min(1).max(100).default(100),
})
export type SupplyConnectionListInput = z.infer<typeof supplyConnectionListInputSchema>
export const supplyConnectionListResultSchema = z.union([
  z.strictObject({
    kind: z.literal('available'),
    businessId: z.string(),
    connections: z.array(providerConnectionProjectionSchema).max(100),
  }),
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])
export type SupplyConnectionListResult = z.infer<typeof supplyConnectionListResultSchema>

export const supplyConnectionDetailInputSchema = z.strictObject({
  connectionRef: z.string().trim().min(1),
})
export type SupplyConnectionDetailInput = z.infer<typeof supplyConnectionDetailInputSchema>
export const supplyConnectionDetailResultSchema = z.union([
  z.strictObject({ kind: z.literal('found'), connection: providerConnectionProjectionSchema }),
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])
export type SupplyConnectionDetailResult = z.infer<typeof supplyConnectionDetailResultSchema>

const connectionEvidenceSchema = z.array(z.string().trim().min(1)).max(64)
const connectionIdempotencySchema = idempotencyKeySchema
export type SupplyConnectionConnectInput =
  | Readonly<{
      kind: 'http_credential'
      businessRef: string
      sourceUrl: string
      authentication:
        | Readonly<{ kind: 'api_key'; location: 'header' | 'query'; name: string }>
        | Readonly<{ kind: 'http_bearer' }>
      environment: 'sandbox' | 'production'
      idempotencyKey: string
    }>
  | Readonly<{
      kind: 'mcp_oauth'
      businessRef: string
      serverUrl: string
      environment: 'sandbox' | 'production'
      idempotencyKey: string
    }>
  | Readonly<{
      kind: 'x402'
      businessRef: string
      resourceUrl: string
      method: 'GET' | 'POST'
      environment: 'sandbox' | 'production'
      observationDigest: string
      payTo: string
      claimExpiresAt: number
      claimSignature: string
      evidenceRefs?: readonly string[]
      idempotencyKey: string
    }>

const supplyConnectionConnectTransportSchema = z.strictObject({
  kind: z.enum(['http_credential', 'mcp_oauth', 'x402']),
  businessRef: z.string().trim().min(1),
  sourceUrl: z.string().url().max(2_048).optional(),
  authentication: z.union([
    z.strictObject({
      kind: z.literal('api_key'),
      location: z.enum(['header', 'query']),
      name: z.string().trim().min(1).max(200),
    }),
    z.strictObject({ kind: z.literal('http_bearer') }),
  ]).optional(),
  serverUrl: z.string().url().max(2_048).optional(),
  resourceUrl: z.string().url().max(2_048).optional(),
  method: z.enum(['GET', 'POST']).optional(),
  environment: z.enum(['sandbox', 'production']),
  observationDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u).optional(),
  payTo: z.string().regex(/^0x[0-9a-fA-F]{40}$/u).optional(),
  claimExpiresAt: z.number().int().nonnegative().optional(),
  claimSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/u).optional(),
  evidenceRefs: connectionEvidenceSchema.optional(),
  idempotencyKey: connectionIdempotencySchema,
}).superRefine((input, context) => {
  const exact = input.kind === 'http_credential'
    ? ['sourceUrl', 'authentication'] as const
    : input.kind === 'mcp_oauth'
      ? ['serverUrl'] as const
      : ['resourceUrl', 'method', 'observationDigest', 'payTo', 'claimExpiresAt', 'claimSignature'] as const
  const laneFields = [
    'sourceUrl', 'authentication', 'serverUrl', 'resourceUrl', 'method', 'observationDigest',
    'payTo', 'claimExpiresAt', 'claimSignature', 'evidenceRefs',
  ] as const
  const permittedFields = new Set<string>(exact)
  if (input.kind === 'x402') permittedFields.add('evidenceRefs')
  for (const field of exact) {
    if (input[field] === undefined) context.addIssue({ code: 'custom', path: [field], message: `${field} is required for ${input.kind}.` })
  }
  for (const field of laneFields) {
    if (!permittedFields.has(field) && input[field] !== undefined) {
      context.addIssue({ code: 'custom', path: [field], message: `${field} is not accepted for ${input.kind}.` })
    }
  }
})

export const supplyConnectionConnectInputSchema = supplyConnectionConnectTransportSchema as z.ZodType<SupplyConnectionConnectInput>

export const supplyConnectionTransitionInputSchema = z.strictObject({
  connectionRef: z.string().trim().min(1),
  expectedAuthorityGeneration: z.number().int().nonnegative(),
  expectedAuthorityDigest: z.string().trim().min(1),
  reasonCode: z.string().trim().min(1).max(200).optional(),
  evidenceRefs: connectionEvidenceSchema.default([]),
  idempotencyKey: connectionIdempotencySchema,
})
export type SupplyConnectionTransitionInput = z.infer<typeof supplyConnectionTransitionInputSchema>

const providerConnectionRefusalReasonSchema = z.enum([
  'invalid_identity',
  'invalid_time',
  'invalid_scope',
  'invalid_resource',
  'invalid_generation',
  'invalid_digest',
  'invalid_transition',
  'command_identity_conflict',
  'claim_invalid',
  'inspection_target_invalid',
  'inspection_target_not_public',
  'inspection_request_invalid',
  'inspection_request_failed',
  'inspection_redirect_refused',
  'inspection_payment_not_required',
  'inspection_challenge_missing',
  'inspection_challenge_too_large',
  'inspection_challenge_malformed',
  'inspection_challenge_conflict',
  'inspection_challenge_resource_mismatch',
  'inspection_unsupported',
  'inspection_ambiguous',
  'inspection_schema_missing',
  'inspection_selector_invalid',
  'inspection_transport_unsupported',
  'source_unavailable',
])
export const supplyConnectionCommandResultSchema = z.union([
  z.strictObject({
    kind: z.enum(['applied', 'duplicate']),
    connection: providerConnectionProjectionSchema,
    commandDigest: z.string(),
  }),
  z.strictObject({
    kind: z.literal('action_required'),
    attemptRef: z.string(),
    expiresAt: z.number().int().nonnegative(),
    requiredAction: z.strictObject({
      action: z.literal('supply.connection.connect'),
      blockedCapabilities: z.tuple([z.literal('supply.publish')]),
      cta: z.string(),
      ctaLabel: z.string(),
      description: z.string(),
      iconUrl: z.null(),
      status: z.literal('required'),
      title: z.string(),
    }),
  }),
  z.strictObject({ kind: z.literal('refused'), reason: providerConnectionRefusalReasonSchema }),
])
export type SupplyConnectionCommandResult = z.infer<typeof supplyConnectionCommandResultSchema>
export const supplyOffboardingStatusInputSchema = z.strictObject({
  businessRef: z.string().trim().min(1),
})
export type SupplyOffboardingStatusInput = z.infer<typeof supplyOffboardingStatusInputSchema>
export const supplyOffboardingStatusResultSchema = z.union([
  z.strictObject({ kind: z.literal('available'), status: providerOffboardingStatusSchema }),
  z.strictObject({ kind: z.literal('not_found') }),
])
export type SupplyOffboardingStatusResult = z.infer<typeof supplyOffboardingStatusResultSchema>
type SupplyConnectionRefusalReason = Extract<
  SupplyConnectionCommandResult,
  Readonly<{ kind: 'refused' }>
>['reason']

function connectionRefused(reason: SupplyConnectionRefusalReason): SupplyConnectionCommandResult {
  return { kind: 'refused', reason }
}

export type SupplyManagementService = Readonly<{
  sourcePreview(input: Readonly<{ input: SupplySourceInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplySourcePreview>
  toolsList(input: Readonly<{ input: SupplyToolsListInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyToolsListResult>
  status(input: Readonly<{ input: SupplyStatusInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyStatusResult>
  publish(input: Readonly<{ input: SupplyPublishInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyPublishResult>
  withdraw(input: Readonly<{ input: SupplyWithdrawInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyWithdrawResult>
  recheck(input: Readonly<{ input: SupplyRecheckInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyRecheckResult>
  republish(input: Readonly<{ input: SupplyRepublishInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyRepublishResult>
  earnings(input: Readonly<{ input: SupplyEarningsInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyEarningsResult>
  calls(input: Readonly<{ input: SupplyCallsInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyCallsResult>
  connectionList(input: Readonly<{ input: SupplyConnectionListInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyConnectionListResult>
  connectionDetail(input: Readonly<{ input: SupplyConnectionDetailInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyConnectionDetailResult>
  connectionConnect(input: Readonly<{ input: SupplyConnectionConnectInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyConnectionCommandResult>
  connectionReconnect(input: Readonly<{ input: SupplyConnectionTransitionInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyConnectionCommandResult>
  connectionRevoke(input: Readonly<{ input: SupplyConnectionTransitionInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyConnectionCommandResult>
  offboardingStatus(input: Readonly<{ input: SupplyOffboardingStatusInput; principal: AgentAccessPrincipal; correlationId: string }>): Promise<SupplyOffboardingStatusResult>
}>

const supplyReadMutation = sourceMutation<Record<string, unknown>, OwnerSupplyFunnelReadback>('capabilitySupplyOwnerFunnel:readAgentOwnerSupplyFunnel')
type ProviderToolAgentRead = Readonly<{ kind: 'available'; statusJson: string }> | Readonly<{ kind: 'not_found' }>
type ProviderToolAgentList = Readonly<{
  kind: 'available'
  page: readonly Readonly<{ statusJson: string }>[]
  isDone: boolean
  continueCursor: string
}> | Readonly<{ kind: 'not_found' }>
const providerToolReadMutation = sourceMutation<Record<string, unknown>, ProviderToolAgentRead>('capabilityProviderTools:readAgent')
const providerToolListMutation = sourceMutation<Record<string, unknown>, ProviderToolAgentList>('capabilityProviderTools:listAgent')
type OwnerPublicationReservationResult =
  | { kind: 'reserved' }
  | { kind: 'replayed' }
  | { kind: 'refused'; reason: string }
const publishReservationMutation = sourceMutation<Record<string, unknown>, OwnerPublicationReservationResult>('capabilitySupplyOwnerFunnel:reserveOwnerCapabilityPublication')
type SupplyIntegrationDraftSaveResult =
  | Readonly<{ kind: 'saved' | 'replayed'; offeringRef: string; accessPathRef: string; candidateRef: string; sourceDigest: string }>
  | Readonly<{ kind: 'refused'; reason: string }>
const integrationDraftSaveMutation = sourceMutation<Record<string, unknown>, SupplyIntegrationDraftSaveResult>('capabilitySupplyOwnerFunnel:saveAgentSupplyIntegrationDraft')
const publishMutation = sourceMutation<Record<string, unknown>, PublishPreparedCapabilityCommandResult>('capabilitySupply:publishPreparedCapability')
const withdrawMutation = sourceMutation<Record<string, unknown>, OwnerSupplyCommandResult>('capabilitySupplyOwnerFunnel:withdrawOwnerCapability')
const recheckMutation = sourceMutation<Record<string, unknown>, OwnerSupplyCommandResult>('capabilitySupplyOwnerFunnel:refreshOwnerCapability')
const republishMutation = sourceMutation<Record<string, unknown>, OwnerSupplyCommandResult>('capabilitySupplyOwnerFunnel:republishOwnerCapability')
const earningsReadMutation = sourceMutation<Record<string, unknown>, OwnerProviderEarningsReadback>('moneyLedger:readAgentProviderEarnings')
type SupplyCallsCursor = Readonly<{ createdAt: number; callRef: string }>
type SupplyCallsBackendResult =
  | Readonly<{
      kind: 'available'
      items: readonly z.infer<typeof supplyCallSummarySchema>[]
      limit: number
      hasMore: boolean
      nextCursor?: SupplyCallsCursor
    }>
  | Readonly<{ kind: 'error'; code: 'unauthenticated' | 'source_unavailable' }>
const callsListMutation = sourceMutation<Record<string, unknown>, SupplyCallsBackendResult>('capabilityCallProjection:listAgentSupplyCalls')
const connectionListMutation = sourceMutation<Record<string, unknown>, SupplyConnectionListResult>('capabilityProviderConnectionAgents:list')
const connectionDetailMutation = sourceMutation<Record<string, unknown>, SupplyConnectionDetailResult>('capabilityProviderConnectionAgents:read')
type ProviderConnectionBackendCommandResult =
  | Readonly<{ kind: 'applied' | 'duplicate'; connection: ProviderConnectionProjection; commandDigest: string }>
  | Readonly<{ kind: 'refused'; code: z.infer<typeof providerConnectionRefusalReasonSchema> }>
const connectionConnectMutation = sourceMutation<Record<string, unknown>, ProviderConnectionBackendCommandResult>('capabilityProviderConnectionAgents:connectX402')
type ProviderConnectionAttemptReservationResult =
  | Readonly<{ kind: 'reserved' | 'replayed'; attemptRef: string; expiresAt: number }>
  | Readonly<{ kind: 'refused'; code: 'invalid_identity' | 'invalid_environment' | 'invalid_source' | 'command_identity_conflict' }>
const connectionAttemptReservationMutation = sourceMutation<Record<string, unknown>, ProviderConnectionAttemptReservationResult>('capabilityProviderConnectionAttempts:reserveAgent')
const connectionReconnectMutation = sourceMutation<Record<string, unknown>, ProviderConnectionBackendCommandResult>('capabilityProviderConnectionAgents:reconnect')
const connectionRevokeMutation = sourceMutation<Record<string, unknown>, ProviderConnectionBackendCommandResult>('capabilityProviderConnectionAgents:revoke')
const offboardingStatusMutation = sourceMutation<Record<string, unknown>, SupplyOffboardingStatusResult>('capabilityProviderOffboarding:readAgentStatus')

function commandKey(action: string, principal: AgentAccessPrincipal, idempotencyKey: string): string {
  return canonicalDigest({ action, ownerId: principal.ownerId, idempotencyKey })
}
function refused(reason: string): { kind: 'refused'; reason: string } {
  return { kind: 'refused', reason }
}

export function createSupplyManagementService(request: Request, bodyText: string): SupplyManagementService {
  const mutate = async <Mutation extends FunctionReference<'mutation', 'public', Record<string, unknown>>>(
    mutation: Mutation,
    command: Record<string, unknown>,
    operationKey: string,
    correlationId: string,
  ): Promise<FunctionReturnType<Mutation>> => {
    const sourceWrite = await sourceWriteAdmissionFromRequest({ request, command, body: bodyText, scope: 'catalog_publish', operationKey, correlationId })
    return await callPublicSourceMutation(mutation, {
      ...command,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    })
  }
  const status = async ({ input, principal, correlationId }: { input: SupplyStatusInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyStatusResult> => {
    const operationKey = canonicalDigest({
      action: SUPPLY_ACTION_IDS.status,
      principalId: principal.principalId,
      businessRef: input.businessRef,
      toolRef: input.toolRef,
      correlationId,
    })
    const readback = await mutate(providerToolReadMutation, {
      businessId: input.businessRef,
      toolRef: input.toolRef,
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    if (readback.kind === 'not_found') return { kind: 'not_found' }
    const projected = providerToolStatusSchema.safeParse(JSON.parse(readback.statusJson) as unknown)
    if (!projected.success) return { kind: 'error', code: 'source_unavailable' }
    return supplyStatusResultSchema.parse({
      kind: 'available',
      schemaVersion: 'provider_tools:v1',
      businessRef: input.businessRef,
      status: projected.data,
    })
  }
  const toolsList = async ({ input, principal, correlationId }: { input: SupplyToolsListInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyToolsListResult> => {
    const operationKey = canonicalDigest({
      action: SUPPLY_ACTION_IDS.toolsList,
      principalId: principal.principalId,
      businessRef: input.businessRef,
      limit: input.limit,
      cursor: input.cursor ?? null,
      correlationId,
    })
    const readback = await mutate(providerToolListMutation, {
      businessId: input.businessRef,
      paginationOpts: { numItems: input.limit, cursor: input.cursor ?? null },
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    if (readback.kind === 'not_found') return { kind: 'not_found' }
    const page = readback.page.map(({ statusJson }) => providerToolStatusSchema.safeParse(JSON.parse(statusJson) as unknown))
    if (page.some((item) => !item.success)) return { kind: 'error', code: 'source_unavailable' }
    return supplyToolsListResultSchema.parse({
      kind: 'available',
      schemaVersion: 'provider_tools:v1',
      businessRef: input.businessRef,
      page: page.flatMap((item) => item.success ? [item.data] : []),
      isDone: readback.isDone,
      continueCursor: readback.isDone ? null : readback.continueCursor,
    })
  }
  const sourcePreview = async ({ input }: { input: SupplySourceInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplySourcePreview> => (
    await previewSupplySource(input)
  )
  const publish = async ({ input, principal, correlationId: _transportCorrelationId }: { input: SupplyPublishInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyPublishResult> => {
    const baseKey = commandKey('supply.publish', principal, input.idempotencyKey)
    const durableCorrelationId = baseKey
    let providerAuthority: { kind: 'provider_connection'; connectionRef: string; providerRef: string } | undefined
    if (input.connectionRef !== undefined) {
      const connection = await mutate(connectionDetailMutation, {
        connectionRef: input.connectionRef,
        agentPrincipal: principal,
        operationKey: `${baseKey}:connection`,
        correlationId: durableCorrelationId,
      }, `${baseKey}:connection`, durableCorrelationId)
      if (connection.kind !== 'found'
        || connection.connection.businessId !== input.businessRef
        || connection.connection.lifecycle !== 'active'
        || !connection.connection.available) return refused('connection_unavailable')
      providerAuthority = {
        kind: 'provider_connection',
        connectionRef: connection.connection.connectionRef,
        providerRef: connection.connection.providerRef,
      }
    }
    const preparation = await prepareSupplyPublicationV2(input, {
      ...(providerAuthority === undefined ? {} : { providerAuthority }),
    })
    if (preparation.kind === 'refused') return refused(preparation.reason)
    const saved = await mutate(integrationDraftSaveMutation, {
      businessId: input.businessRef,
      title: input.presentation.name,
      description: input.presentation.description,
      category: input.presentation.category,
      sourceKind: input.source.kind,
      sourceDescriptorJson: preparation.sourceDescriptorJson,
      sourceDigest: preparation.sourceDigest,
      sourceRevision: preparation.sourceRevision,
      candidateRef: input.candidateRef,
      sourceSelectorJson: preparation.sourceSelectorJson,
      ...(input.connectionRef === undefined ? {} : { connectionRef: input.connectionRef }),
      ...(preparation.validationInputJson === undefined ? {} : { validationInputJson: preparation.validationInputJson }),
      operationKey: `${baseKey}:draft`,
      correlationId: durableCorrelationId,
      agentPrincipal: principal,
    }, `${baseKey}:draft`, durableCorrelationId)
    if (saved.kind === 'refused') return refused(saved.reason)
    const readback = await mutate(supplyReadMutation, {
      businessId: input.businessRef,
      agentPrincipal: principal,
      operationKey: `${baseKey}:read`,
      correlationId: durableCorrelationId,
    }, `${baseKey}:read`, durableCorrelationId)
    if (readback.kind !== 'available') return refused(readback.kind === 'error' ? readback.code : 'authorization_denied')
    const offering = readback.offerings.find((candidate) => candidate.offeringRef === saved.offeringRef)
    const accessPath = offering?.accessPaths.find((candidate) => candidate.accessPathRef === saved.accessPathRef)
    if (offering === undefined || offering.sourceHash === undefined || accessPath === undefined) return refused('catalog_offering_origin_changed')
    const prepared = {
      ...preparation.prepared.prepared,
      sourceAuthorityState: preparation.sourceAuthorityState,
      offering: {
        ...preparation.prepared.prepared.offering,
        origin: {
          kind: 'catalog_offering' as const,
          offeringRef: offering.offeringRef,
          offeringRevision: offering.revision,
          offeringSourceHash: offering.sourceHash,
          declaredAccessPathRef: accessPath.accessPathRef,
          accessPathSourceHash: accessPath.sourceHash,
        },
      },
    }
    const materialDigest = canonicalDigest(input)
    const reservation = await mutate(publishReservationMutation, {
      businessId: input.businessRef,
      offeringRef: offering.offeringRef,
      offeringRevision: offering.revision,
      offeringSourceHash: offering.sourceHash,
      materialDigest,
      operationKey: baseKey,
      correlationId: durableCorrelationId,
      reasonCode: 'supply.publish',
      evidenceRefs: [preparation.sourceDigest, input.candidateRef],
      agentPrincipal: principal,
    }, baseKey, durableCorrelationId)
    if (reservation.kind !== 'reserved' && reservation.kind !== 'replayed') return refused(reservation.reason ?? 'operation_key_conflict')
    const published = await mutate(publishMutation, {
      businessId: input.businessRef, offeringRef: offering.offeringRef, revision: offering.revision, sourceHash: offering.sourceHash,
      runtimeEnvironment: input.environment, prepared, operationKey: baseKey,
      correlationId: durableCorrelationId, reasonCode: 'supply.publish', evidenceRefs: [preparation.sourceDigest, input.candidateRef], agentPrincipal: principal,
    }, baseKey, durableCorrelationId)
    if (published.kind === 'refused') return refused(typeof published.reason === 'string' ? published.reason : 'source_unavailable')
    if ((published.kind !== 'published' && published.kind !== 'replayed') || typeof published.publicationRef !== 'string' || typeof published.toolRef !== 'string' || typeof published.publicationRevision !== 'number') return refused('source_unavailable')
    return { kind: published.kind === 'replayed' ? 'replayed' : 'submitted', publicationRef: published.publicationRef, publicationRevision: published.publicationRevision, toolRef: published.toolRef, state: 'Submitted' }
  }
  const withdraw = async ({ input, principal, correlationId: _transportCorrelationId }: { input: SupplyWithdrawInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyWithdrawResult> => {
    const baseKey = commandKey('supply.withdraw', principal, input.idempotencyKey)
    const durableCorrelationId = baseKey
    const result = await mutate(withdrawMutation, {
      businessId: input.businessId, offeringRef: input.offeringRef, offeringRevision: input.offeringRevision, offeringSourceHash: input.offeringSourceHash,
      publicationRef: input.publicationRef, publicationRevision: input.publicationRevision, operationKey: baseKey, correlationId: durableCorrelationId,
      reasonCode: 'supply.withdraw', evidenceRefs: [], agentPrincipal: principal,
    }, baseKey, durableCorrelationId)
    if (result.kind === 'refused') return refused(typeof result.reason === 'string' ? result.reason : 'source_unavailable')
    if (result.kind !== 'withdrawn' || typeof result.publicationRef !== 'string' || typeof result.revision !== 'number' || !isRecordLifecycle(result.lifecycle)) return refused('source_unavailable')
    return { kind: 'withdrawn', publicationRef: result.publicationRef, revision: result.revision, lifecycle: result.lifecycle }
  }
  const runMaintenance = async (
    action: typeof SUPPLY_ACTION_IDS.recheck | typeof SUPPLY_ACTION_IDS.republish,
    mutation: typeof recheckMutation | typeof republishMutation,
    input: SupplyRecheckInput | SupplyRepublishInput,
    principal: AgentAccessPrincipal,
  ): Promise<OwnerSupplyCommandResult> => {
    const baseKey = commandKey(action, principal, input.idempotencyKey)
    return await mutate(mutation, {
      businessId: input.businessId,
      offeringRef: input.offeringRef,
      offeringRevision: input.offeringRevision,
      offeringSourceHash: input.offeringSourceHash,
      publicationRef: input.publicationRef,
      publicationRevision: input.publicationRevision,
      operationKey: baseKey,
      correlationId: baseKey,
      reasonCode: action,
      evidenceRefs: [],
      agentPrincipal: principal,
    }, baseKey, baseKey)
  }
  const recheck = async ({ input, principal }: { input: SupplyRecheckInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyRecheckResult> => {
    const result = await runMaintenance(SUPPLY_ACTION_IDS.recheck, recheckMutation, input, principal)
    if (result.kind === 'refused') return refused(result.reason)
    if (result.kind !== 'refreshed') return refused('source_unavailable')
    return supplyRecheckResultSchema.parse(result)
  }
  const republish = async ({ input, principal }: { input: SupplyRepublishInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyRepublishResult> => {
    const result = await runMaintenance(SUPPLY_ACTION_IDS.republish, republishMutation, input, principal)
    if (result.kind === 'refused') return refused(result.reason)
    if (result.kind !== 'republished') return refused('source_unavailable')
    return supplyRepublishResultSchema.parse(result)
  }
  const earnings = async ({ input, principal, correlationId }: { input: SupplyEarningsInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyEarningsResult> => {
    const operationKey = canonicalDigest({
      action: 'supply.earnings',
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      correlationId,
      currency: input.currency,
    })
    const result = await mutate(earningsReadMutation, {
      currency: input.currency,
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    if (result.kind === 'not_found') return { kind: 'not_found' }
    if (result.kind === 'error') return { kind: 'error', code: result.code === 'unauthenticated' ? 'unauthenticated' : 'source_unavailable' }
    const account = result.accounts.find((candidate) => candidate.currency === input.currency)
    if (account === undefined) return { kind: 'not_found' }
    const { kind: _earningsKind, ...earnings } = account.earnings
    const parsedEarnings = earningsSchema.safeParse(earnings)
    const parsedPayout = payoutProjectionSchema.safeParse(account.payout)
    if (!parsedEarnings.success || !parsedPayout.success) return { kind: 'error', code: 'source_unavailable' }
    return { kind: 'available', businessId: result.businessId, currency: account.currency, earnings: parsedEarnings.data, payout: parsedPayout.data }
  }
  const connectionList = async ({ input, principal, correlationId }: { input: SupplyConnectionListInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionListResult> => {
    const operationKey = canonicalDigest({
      action: SUPPLY_ACTION_IDS.connectionList,
      principalId: principal.principalId,
      businessId: input.businessId,
      lifecycle: input.lifecycle ?? null,
      limit: input.limit,
      correlationId,
    })
    const result = await mutate(connectionListMutation, {
      businessId: input.businessId,
      ...(input.lifecycle === undefined ? {} : { lifecycle: input.lifecycle }),
      limit: input.limit,
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    const parsed = supplyConnectionListResultSchema.safeParse(result)
    return parsed.success ? parsed.data : { kind: 'error', code: 'source_unavailable' }
  }
  const connectionDetail = async ({ input, principal, correlationId }: { input: SupplyConnectionDetailInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionDetailResult> => {
    const operationKey = canonicalDigest({
      action: SUPPLY_ACTION_IDS.connectionDetail,
      principalId: principal.principalId,
      connectionRef: input.connectionRef,
      correlationId,
    })
    const result = await mutate(connectionDetailMutation, {
      connectionRef: input.connectionRef,
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    const parsed = supplyConnectionDetailResultSchema.safeParse(result)
    return parsed.success ? parsed.data : { kind: 'error', code: 'source_unavailable' }
  }
  const runConnectionCommand = async (
    action: typeof SUPPLY_ACTION_IDS.connectionConnect
      | typeof SUPPLY_ACTION_IDS.connectionReconnect
      | typeof SUPPLY_ACTION_IDS.connectionRevoke,
    mutation: typeof connectionConnectMutation,
    command: Record<string, unknown>,
    input: Readonly<{ idempotencyKey: string }>,
    principal: AgentAccessPrincipal,
  ): Promise<SupplyConnectionCommandResult> => {
    const operationKey = commandKey(action, principal, input.idempotencyKey)
    const result = await mutate(mutation, {
      ...command,
      commandId: operationKey,
      agentPrincipal: principal,
      operationKey,
      correlationId: operationKey,
    }, operationKey, operationKey)
    if (result.kind === 'refused') return { kind: 'refused', reason: result.code }
    const parsed = supplyConnectionCommandResultSchema.safeParse(result)
    return parsed.success ? parsed.data : { kind: 'refused', reason: 'source_unavailable' }
  }
  const connectionConnect = async ({ input, principal }: { input: SupplyConnectionConnectInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionCommandResult> => {
    if (input.kind !== 'x402') {
      if (input.environment !== principal.environment) return connectionRefused('invalid_identity')
      const operationKey = commandKey(SUPPLY_ACTION_IDS.connectionConnect, principal, input.idempotencyKey)
      const sourceUrl = input.kind === 'mcp_oauth' ? input.serverUrl : input.sourceUrl
      const authentication = input.kind === 'mcp_oauth'
        ? { kind: 'mcp_oauth' as const }
        : input.authentication
      const inputDigest = canonicalDigest({
        format: 'provider-connection-attempt-input:v1',
        sourceKind: input.kind,
        businessRef: input.businessRef,
        sourceUrl,
        authentication,
        environment: input.environment,
      })
      const result = await mutate(connectionAttemptReservationMutation, {
        businessId: input.businessRef,
        sourceKind: input.kind,
        sourceUrl,
        authentication,
        environment: input.environment,
        inputDigest,
        commandId: operationKey,
        agentPrincipal: principal,
        operationKey,
        correlationId: operationKey,
      }, operationKey, operationKey)
      if (result.kind === 'refused') {
        return connectionRefused(result.code === 'command_identity_conflict'
          ? 'command_identity_conflict'
          : 'invalid_identity')
      }
      const cta = `/owner/supply/connections/new?attempt=${encodeURIComponent(result.attemptRef)}`
      return {
        kind: 'action_required',
        attemptRef: result.attemptRef,
        expiresAt: result.expiresAt,
        requiredAction: {
          action: SUPPLY_ACTION_IDS.connectionConnect,
          blockedCapabilities: ['supply.publish'],
          cta,
          ctaLabel: 'Connect service',
          description: input.kind === 'mcp_oauth'
            ? 'Sign in to the MCP service in your browser, then return to your agent.'
            : 'Enter the service credential securely in your browser, then return to your agent.',
          iconUrl: null,
          status: 'required',
          title: 'Connect service',
        },
      }
    }
    const evidenceRefs = input.evidenceRefs ?? []
    if (input.environment !== principal.environment || evidenceRefs.some((ref) => (
      ref.startsWith('x402-payee-claim:') || ref.startsWith('x402-endpoint-inspection:')
    ))) return connectionRefused('claim_invalid')

    const inspection = await inspectX402SellerEndpoint({
      endpointUrl: input.resourceUrl,
      method: input.method,
      aeEnvironment: input.environment,
    })
    if (inspection.kind === 'refused') {
      return connectionRefused(`inspection_${inspection.reason}`)
    }
    if (inspection.payment.selection.kind !== 'selected') {
      return connectionRefused(`inspection_${inspection.payment.selection.kind}`)
    }
    const selectedAlternativeId = inspection.payment.selection.alternativeId
    const selected = inspection.payment.accepts.find((candidate) => (
      candidate.alternativeId === selectedAlternativeId
    ))
    const now = Date.now()
    const payTo = selected === undefined
      ? undefined
      : canonicalEvmAddress(selected.payTo)
    if (payTo === undefined
      || !evmAddressEquals(payTo, input.payTo)
      || inspection.digest !== input.observationDigest
      || !validX402SellerClaimTime(input.claimExpiresAt, now)) {
      return connectionRefused('claim_invalid')
    }
    const claim = {
      businessId: input.businessRef,
      endpointUrl: inspection.endpoint.url,
      method: input.method,
      observationDigest: inspection.digest,
      payTo,
      expiresAt: input.claimExpiresAt,
    } as const
    let claimVerified = false
    try {
      claimVerified = await verifyEip191Message({
        address: claim.payTo,
        message: x402SellerClaimMessage(claim),
        signature: input.claimSignature,
      })
    } catch (cause) {
      degradeBackend(cause, undefined, { site: 'connectionConnect', reason: 'source_unavailable' })
      claimVerified = false
    }
    if (!claimVerified) return connectionRefused('claim_invalid')

    return await runConnectionCommand(SUPPLY_ACTION_IDS.connectionConnect, connectionConnectMutation, {
      businessId: input.businessRef,
      resourceUrl: inspection.endpoint.url,
      method: input.method,
      observationDigest: inspection.digest,
      payTo: claim.payTo,
      claimExpiresAt: input.claimExpiresAt,
      claimDigest: x402SellerClaimDigest(claim),
      claimSignature: input.claimSignature,
      evidenceRefs: [
        ...evidenceRefs,
        `x402-endpoint-inspection:${inspection.digest}`,
      ],
    }, input, principal)
  }
  const connectionReconnect = async ({ input, principal }: { input: SupplyConnectionTransitionInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionCommandResult> => (
    await runConnectionCommand(SUPPLY_ACTION_IDS.connectionReconnect, connectionReconnectMutation, {
      connectionRef: input.connectionRef,
      expectedAuthorityGeneration: input.expectedAuthorityGeneration,
      expectedAuthorityDigest: input.expectedAuthorityDigest,
      ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
      evidenceRefs: [...input.evidenceRefs],
    }, input, principal)
  )
  const connectionRevoke = async ({ input, principal }: { input: SupplyConnectionTransitionInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyConnectionCommandResult> => (
    await runConnectionCommand(SUPPLY_ACTION_IDS.connectionRevoke, connectionRevokeMutation, {
      connectionRef: input.connectionRef,
      expectedAuthorityGeneration: input.expectedAuthorityGeneration,
      expectedAuthorityDigest: input.expectedAuthorityDigest,
      ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
      evidenceRefs: [...input.evidenceRefs],
    }, input, principal)
  )
  const offboardingStatus = async ({ input, principal, correlationId }: { input: SupplyOffboardingStatusInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyOffboardingStatusResult> => {
    const operationKey = canonicalDigest({
      action: SUPPLY_ACTION_IDS.offboardingStatus,
      principalId: principal.principalId,
      businessRef: input.businessRef,
      correlationId,
    })
    return await mutate(offboardingStatusMutation, {
      businessId: input.businessRef,
      agentPrincipal: principal,
      operationKey,
      correlationId,
    }, operationKey, correlationId)
  }
  const calls = async ({ input, principal, correlationId }: { input: SupplyCallsInput; principal: AgentAccessPrincipal; correlationId: string }): Promise<SupplyCallsResult> => {
    const cursorScope = canonicalDigest({ action: SUPPLY_ACTION_IDS.calls, ownerId: principal.ownerId, state: input.state ?? null })
    let cursor: SupplyCallsCursor | undefined
    if (input.cursor !== undefined) {
      const decoded = decodeSupplyCallsCursor(input.cursor, cursorScope)
      if (decoded === undefined) return { kind: 'error', code: 'source_unavailable' }
      try {
        const parsed = JSON.parse(decoded) as unknown
        if (!isRecord(parsed) || typeof parsed.createdAt !== 'number' || typeof parsed.callRef !== 'string') {
          return { kind: 'error', code: 'source_unavailable' }
        }
        cursor = { createdAt: parsed.createdAt, callRef: parsed.callRef }
      } catch (cause) {
        return degradeBackend(cause, { kind: 'error', code: 'source_unavailable' } as const, { site: 'calls', reason: 'invalid_response' })
      }
    }
    const operationKey = canonicalDigest({
      action: SUPPLY_ACTION_IDS.calls,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      correlationId,
      state: input.state ?? null,
      limit: input.limit,
      cursor: input.cursor ?? null,
    })
    const result = await mutate(callsListMutation, {
      agentPrincipal: principal,
      ...(input.state === undefined ? {} : { state: input.state }),
      limit: input.limit,
      ...(cursor === undefined ? {} : { cursor }),
      operationKey,
      correlationId,
    }, operationKey, correlationId)
    if (result.kind === 'error') return result
    const nextCursor = result.nextCursor === undefined
      ? undefined
      : encodeSupplyCallsCursor({ scope: cursorScope, cursor: JSON.stringify(result.nextCursor) })
    return {
      kind: 'available',
      items: [...result.items],
      limit: result.limit,
      hasMore: result.hasMore,
      ...(nextCursor === undefined ? {} : { nextCursor }),
    }
  }
  return {
    sourcePreview,
    toolsList,
    status,
    publish,
    withdraw,
    recheck,
    republish,
    earnings,
    calls,
    connectionList,
    connectionDetail,
    connectionConnect,
    connectionReconnect,
    connectionRevoke,
    offboardingStatus,
  }
}

function isRecordLifecycle(value: unknown): value is { state: 'inactive' | 'active' | 'withdrawn' | 'incompatible'; reasons: string[] } {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof Reflect.get(value, 'state') === 'string' && Array.isArray(Reflect.get(value, 'reasons'))
}

const publishParameters: readonly ActionParameter[] = [
  { name: 'businessRef', type: 'string', description: 'Business selected by the authenticated Provider principal.', required: true },
  { name: 'source', type: 'object', description: 'The same native source supplied to preview.', required: true },
  { name: 'candidateRef', type: 'string', description: 'Exact candidate returned by preview.', required: true },
  { name: 'expectedSourceDigest', type: 'string', description: 'Exact preview digest used to reject source drift.', required: true },
  { name: 'connectionRef', type: 'string', description: 'Stable Provider connection when the source requires authentication.', required: false },
  { name: 'presentation', type: 'object', description: 'Provider-facing name, description and category.', required: true },
  { name: 'consequences', type: 'object', description: 'Declared effects, data use and evidence requirements.', required: true },
  { name: 'pricing', type: 'object', description: 'Free, fixed AUD or source-derived x402 pricing.', required: true },
  { name: 'validationInput', type: 'object', description: 'Optional source-native validation input.', required: false },
  { name: 'environment', type: 'enum', enum: ['sandbox', 'production'], description: 'Target environment.', required: true },
  { name: 'idempotencyKey', type: 'string', description: 'Stable replay/conflict command identity.', required: true },
  { name: 'attestation', type: 'object', description: 'Exact Provider publication attestations.', required: true },
]
const maintenanceParameters: readonly ActionParameter[] = [
  { name: 'businessId', type: 'string', description: 'Owner business selected by the authenticated principal.', required: true },
  { name: 'offeringRef', type: 'string', description: 'Current catalog offering reference.', required: true },
  { name: 'offeringRevision', type: 'number', description: 'Current catalog offering revision.', required: true },
  { name: 'offeringSourceHash', type: 'string', description: 'Current catalog offering source hash.', required: true },
  { name: 'publicationRef', type: 'string', description: 'Exact current publication reference.', required: true },
  { name: 'publicationRevision', type: 'number', description: 'Exact current publication revision.', required: true },
  { name: 'idempotencyKey', type: 'string', description: 'Stable replay/conflict command identity.', required: true },
]
const connectionTransitionParameters: readonly ActionParameter[] = [
  { name: 'connectionRef', type: 'string', description: 'Exact provider connection reference.', required: true },
  { name: 'expectedAuthorityGeneration', type: 'number', description: 'Current authority generation returned by detail.', required: true },
  { name: 'expectedAuthorityDigest', type: 'string', description: 'Current authority digest returned by detail.', required: true },
  { name: 'reasonCode', type: 'string', description: 'Optional bounded lifecycle reason.', required: false },
  { name: 'evidenceRefs', type: 'array', description: 'Durable non-secret evidence references.', required: true },
  { name: 'idempotencyKey', type: 'string', description: 'Stable replay/conflict command identity.', required: true },
]
const supplyBoundaries = [
  `Requires an authenticated owner-bound ${MARKET_SUPPLY_MANAGE_SCOPE} credential.`,
  'Business ownership, lifecycle, source admission, current publication, prices, provider authority, and payment controls are resolved server-side.',
  'Credential and wallet secret material is refused before durable storage; provider authority selectors are revalidated server-side and never returned.',
] as const
const supplySurfaces = ['http', 'mcp', 'cli'] as const
const supplyCredentialAdmission = {
  scope: MARKET_SUPPLY_MANAGE_SCOPE,
  authority: 'descriptor_classified' as const,
}

export const supplySourcePreviewAction = defineAction<SupplySourceInput, SupplySourcePreview>({
  id: SUPPLY_ACTION_IDS.sourcePreview,
  name: 'Preview Provider source',
  summary: 'Discover exact candidate Tools from one native Provider source without publishing or invoking them.',
  boundaries: [
    ...supplyBoundaries,
    'Preview is read-only: it creates no Offering, Tool, buyer authority, payment, or Provider effect.',
    'A public source proves only source contents; Provider authority is established separately.',
  ],
  schema: supplySourceInputSchema,
  outputSchema: supplySourcePreviewSchema,
  parameters: [
    { name: 'kind', type: 'enum', enum: ['openapi', 'mcp', 'agent_plugin', 'x402'], description: 'Native Provider source type.', required: true },
    { name: 'definitionUrl', type: 'string', description: 'Public HTTPS OpenAPI document URL when kind is openapi.', required: false },
    { name: 'serverUrl', type: 'string', description: 'Public HTTPS streamable HTTP MCP server URL when kind is mcp.', required: false },
    { name: 'registryName', type: 'string', description: 'Official MCP Registry name when kind is mcp.', required: false },
    { name: 'pluginJson', type: 'object', description: 'Official Agent Plugins 1.0 plugin.json object when kind is agent_plugin.', required: false },
    { name: 'mcpJson', type: 'object', description: 'Official Agent Plugins 1.0 mcp.json object when kind is agent_plugin.', required: false },
    { name: 'resourceUrl', type: 'string', description: 'Public HTTPS x402 resource URL when kind is x402.', required: false },
    { name: 'method', type: 'enum', enum: ['GET', 'POST'], description: 'x402 resource method.', required: false },
    { name: 'environment', type: 'enum', enum: ['sandbox', 'production'], description: 'Target environment.', required: true },
  ],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'provider_system', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: {
    version: SUPPLY_ACTION_ROUTE_CONTRACTS.sourcePreview.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: ['kind', 'definitionUrl', 'serverUrl', 'registryName', 'pluginJson', 'mcpJson', 'resourceUrl', 'method', 'environment'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['source_digest', 'source_revision', 'tool_candidates'],
    safeContinuations: ['supply.connection.connect', 'supply.publish'],
    invalidationConditions: ['source_changed', 'source_authentication_changed', 'environment_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.sourcePreview({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyStatusAction = defineAction<SupplyStatusInput, SupplyStatusResult>({
  id: SUPPLY_ACTION_IDS.status,
  name: 'Read Provider Tool status',
  summary: 'Read one exact Provider Tool through the shared eight-state lifecycle and its single safe next action.',
  boundaries: supplyBoundaries,
  schema: supplyStatusInputSchema,
  outputSchema: supplyStatusResultSchema,
  parameters: [
    { name: 'businessRef', type: 'string', description: 'Business selected by the authenticated Provider principal.', required: true },
    { name: 'toolRef', type: 'string', description: 'Exact Tool reference.', required: true },
  ],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: {
    version: SUPPLY_ACTION_ROUTE_CONTRACTS.status.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: ['businessRef', 'toolRef'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['provider_tool_lifecycle'],
    safeContinuations: ['supply.publish', 'supply.recheck', 'supply.withdraw', 'supply.republish'],
    invalidationConditions: ['business_changed', 'tool_changed', 'publication_revision_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.status({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyToolsListAction = defineAction<SupplyToolsListInput, SupplyToolsListResult>({
  id: SUPPLY_ACTION_IDS.toolsList,
  name: 'List Provider Tools',
  summary: 'List one bounded page of Provider Tools through the shared eight-state lifecycle.',
  boundaries: supplyBoundaries,
  schema: supplyToolsListInputSchema,
  outputSchema: supplyToolsListResultSchema,
  parameters: [
    { name: 'businessRef', type: 'string', description: 'Business selected by the authenticated Provider principal.', required: true },
    { name: 'limit', type: 'number', description: 'Page size from 1 through 100; defaults to 50.', required: false },
    { name: 'cursor', type: 'string', description: 'Opaque cursor returned by the previous page.', required: false },
  ],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: {
    version: SUPPLY_ACTION_ROUTE_CONTRACTS.toolsList.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: ['businessRef', 'limit', 'cursor'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['provider_tool_collection'],
    safeContinuations: ['supply.status', 'supply.publish'],
    invalidationConditions: ['business_changed', 'cursor_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.toolsList({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyPublishAction = defineAction<SupplyPublishInput, SupplyPublishResult>({
  id: SUPPLY_ACTION_IDS.publish,
  name: 'Publish Provider Tool',
  summary: 'Submit one exact previewed Provider Tool for validation and automatic publication.',
  boundaries: supplyBoundaries,
  schema: supplyPublishInputSchema,
  outputSchema: supplyPublishResultSchema,
  parameters: publishParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'business', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'policy_eligible' },
  surfaces: supplySurfaces,
  mcp: { idempotent: true, openWorld: true, destructive: false },
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.publish.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['businessRef', 'source', 'candidateRef', 'expectedSourceDigest', 'connectionRef', 'presentation', 'consequences', 'pricing', 'validationInput', 'environment', 'idempotencyKey', 'attestation'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['source_publication', 'publication_identity'], safeContinuations: ['supply.status'], invalidationConditions: ['source_changed', 'candidate_changed', 'connection_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.publish({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyWithdrawAction = defineAction<SupplyWithdrawInput, SupplyWithdrawResult>({
  id: SUPPLY_ACTION_IDS.withdraw,
  name: 'Withdraw Provider capability',
  summary: 'Withdraw one exact current Provider publication without cancelling running work.',
  boundaries: supplyBoundaries,
  schema: supplyWithdrawInputSchema,
  outputSchema: supplyWithdrawResultSchema,
  parameters: maintenanceParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'business', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'policy_eligible' },
  surfaces: supplySurfaces,
  mcp: { idempotent: true, openWorld: true, destructive: true },
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.withdraw.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash', 'publicationRef', 'publicationRevision', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['withdrawal_identity'], safeContinuations: ['supply.status', 'supply.republish'], invalidationConditions: ['publication_ref_changed', 'publication_revision_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.withdraw({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyRecheckAction = defineAction<SupplyRecheckInput, SupplyRecheckResult>({
  id: SUPPLY_ACTION_IDS.recheck,
  name: 'Recheck Provider capability',
  summary: 'Schedule readiness revalidation for one exact current Provider publication.',
  boundaries: supplyBoundaries,
  schema: supplyWithdrawInputSchema,
  outputSchema: supplyRecheckResultSchema,
  parameters: maintenanceParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'provider_system', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'policy_eligible' },
  surfaces: supplySurfaces,
  mcp: { idempotent: true, openWorld: true, destructive: false },
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.recheck.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash', 'publicationRef', 'publicationRevision', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['readiness_recheck_scheduled'], safeContinuations: ['supply.status'], invalidationConditions: ['publication_ref_changed', 'publication_revision_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.recheck({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyRepublishAction = defineAction<SupplyRepublishInput, SupplyRepublishResult>({
  id: SUPPLY_ACTION_IDS.republish,
  name: 'Republish Provider capability',
  summary: 'Republish one exact withdrawn Provider publication from admitted durable material.',
  boundaries: supplyBoundaries,
  schema: supplyWithdrawInputSchema,
  outputSchema: supplyRepublishResultSchema,
  parameters: maintenanceParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'business', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'policy_eligible' },
  surfaces: supplySurfaces,
  mcp: { idempotent: true, openWorld: true, destructive: false },
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.republish.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash', 'publicationRef', 'publicationRevision', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['publication_identity'], safeContinuations: ['supply.status'], invalidationConditions: ['publication_ref_changed', 'publication_revision_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.republish({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyEarningsAction = defineAction<SupplyEarningsInput, SupplyEarningsResult>({
  id: SUPPLY_ACTION_IDS.earnings,
  name: 'Read Provider earnings',
  summary: 'Read exact provider earnings and payout status for one currency.',
  boundaries: supplyBoundaries,
  schema: supplyEarningsInputSchema,
  outputSchema: supplyEarningsResultSchema,
  parameters: [{ name: 'currency', type: 'string', description: 'ISO-like uppercase ledger currency.', required: true }],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.earnings.contractVersion, consequenceClass: 'read_only', materialInputPaths: ['currency'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['earnings_projection'], safeContinuations: ['supply.status'], invalidationConditions: ['currency_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.earnings({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyCallsAction = defineAction<SupplyCallsInput, SupplyCallsResult>({
  id: SUPPLY_ACTION_IDS.calls,
  name: 'List Provider Calls',
  summary: 'List the authenticated Provider’s own bounded page of Quotes/Calls, newest first, across its current Tools.',
  boundaries: [
    ...supplyBoundaries,
    'Returns only Calls against Tools the authenticated Provider currently publishes.',
    'Rows omit buyer identity, credentials, idempotency keys, and Tool input/output payloads.',
  ],
  schema: supplyCallsInputSchema,
  outputSchema: supplyCallsResultSchema,
  parameters: [
    { name: 'state', type: 'enum', description: 'Optional canonical Call state filter.', required: false, enum: callStateValues },
    { name: 'limit', type: 'number', description: 'Page size from 1 through 100; defaults to 20.', required: false },
    { name: 'cursor', type: 'string', description: 'Opaque cursor returned by the previous page.', required: false },
  ],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: {
    version: SUPPLY_ACTION_ROUTE_CONTRACTS.calls.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: ['state', 'limit', 'cursor'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['call_summaries'],
    safeContinuations: ['supply.status'],
    invalidationConditions: ['state_filter_changed', 'cursor_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.calls({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionListAction = defineAction<SupplyConnectionListInput, SupplyConnectionListResult>({
  id: SUPPLY_ACTION_IDS.connectionList,
  name: 'List Provider connections',
  summary: 'List the bounded provider connections owned by one Provider business, including lifecycle and recovery state.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionListInputSchema,
  outputSchema: supplyConnectionListResultSchema,
  parameters: [
    { name: 'businessId', type: 'string', description: 'Owner business selected by the authenticated principal.', required: true },
    { name: 'lifecycle', type: 'enum', description: 'Optional exact connection lifecycle filter.', required: false, enum: providerConnectionLifecycleSchema.options },
    { name: 'limit', type: 'number', description: 'Bounded result limit from 1 through 100.', required: false },
  ],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionList.contractVersion, consequenceClass: 'read_only', materialInputPaths: ['businessId', 'lifecycle', 'limit'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['provider_connection_collection'], safeContinuations: ['supply.connection.detail', 'supply.connection.connect'], invalidationConditions: ['business_changed', 'lifecycle_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionList({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionDetailAction = defineAction<SupplyConnectionDetailInput, SupplyConnectionDetailResult>({
  id: SUPPLY_ACTION_IDS.connectionDetail,
  name: 'Inspect Provider connection',
  summary: 'Inspect one exact provider connection, its current concurrency identity, availability, and recovery state without exposing credentials.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionDetailInputSchema,
  outputSchema: supplyConnectionDetailResultSchema,
  parameters: [{ name: 'connectionRef', type: 'string', description: 'Exact provider connection reference.', required: true }],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionDetail.contractVersion, consequenceClass: 'read_only', materialInputPaths: ['connectionRef'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['provider_connection_state'], safeContinuations: ['supply.connection.reconnect', 'supply.connection.revoke'], invalidationConditions: ['authority_generation_changed', 'authority_digest_changed', 'lifecycle_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionDetail({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionConnectAction = defineAction<SupplyConnectionConnectInput, SupplyConnectionCommandResult>({
  id: SUPPLY_ACTION_IDS.connectionConnect,
  name: 'Connect Provider service',
  summary: 'Open a secure owner handoff for protected HTTP or MCP supply, or verify x402 wallet control without accepting credential material from the agent.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionConnectInputSchema,
  outputSchema: supplyConnectionCommandResultSchema,
  parameters: [
    { name: 'kind', type: 'enum', description: 'Native authentication lane for the selected source.', required: true, enum: ['http_credential', 'mcp_oauth', 'x402'] },
    { name: 'businessRef', type: 'string', description: 'Business selected by the authenticated Provider principal.', required: true },
    { name: 'sourceUrl', type: 'string', description: 'Protected OpenAPI source URL for an HTTP credential handoff.', required: false },
    { name: 'serverUrl', type: 'string', description: 'Protected MCP server URL for an OAuth handoff.', required: false },
    { name: 'authentication', type: 'object', description: 'HTTP authentication scheme and credential placement, never the credential itself.', required: false },
    { name: 'resourceUrl', type: 'string', description: 'Public HTTPS x402 resource URL.', required: false },
    { name: 'method', type: 'enum', description: 'Exact x402 inspection method.', required: false, enum: ['GET', 'POST'] },
    { name: 'environment', type: 'enum', description: 'Sandbox or Production; it must match the Provider agent credential.', required: true, enum: ['sandbox', 'production'] },
    { name: 'observationDigest', type: 'string', description: 'Exact live x402 observation being claimed.', required: false },
    { name: 'payTo', type: 'string', description: 'Exact x402 payee whose wallet proves control.', required: false },
    { name: 'claimExpiresAt', type: 'number', description: 'Short-lived x402 seller-claim expiry.', required: false },
    { name: 'claimSignature', type: 'string', description: 'Wallet signature over the exact x402 seller claim.', required: false },
    { name: 'evidenceRefs', type: 'array', description: 'Durable non-secret x402 evidence references.', required: false },
    { name: 'idempotencyKey', type: 'string', description: 'Stable replay/conflict command identity.', required: true },
  ],
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'provider_system', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'policy_eligible' },
  surfaces: supplySurfaces,
  mcp: { idempotent: true, openWorld: true, destructive: false },
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionConnect.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['kind', 'businessRef', 'sourceUrl', 'serverUrl', 'authentication', 'resourceUrl', 'method', 'environment', 'observationDigest', 'payTo', 'claimExpiresAt', 'claimSignature', 'evidenceRefs', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['provider_connection_attempt_or_identity'], safeContinuations: ['supply.connection.detail', 'supply.publish'], invalidationConditions: ['business_changed', 'source_changed', 'authentication_changed', 'environment_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionConnect({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionReconnectAction = defineAction<SupplyConnectionTransitionInput, SupplyConnectionCommandResult>({
  id: SUPPLY_ACTION_IDS.connectionReconnect,
  name: 'Reconnect Provider connection',
  summary: 'Refresh one exact provider connection only when its authority generation and digest are still current.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionTransitionInputSchema,
  outputSchema: supplyConnectionCommandResultSchema,
  parameters: connectionTransitionParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'provider_system', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'policy_eligible' },
  surfaces: supplySurfaces,
  mcp: { idempotent: true, openWorld: true, destructive: false },
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionReconnect.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['connectionRef', 'expectedAuthorityGeneration', 'expectedAuthorityDigest', 'reasonCode', 'evidenceRefs', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['provider_connection_authority'], safeContinuations: ['supply.connection.detail', 'supply.recheck'], invalidationConditions: ['authority_generation_changed', 'authority_digest_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionReconnect({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionRevokeAction = defineAction<SupplyConnectionTransitionInput, SupplyConnectionCommandResult>({
  id: SUPPLY_ACTION_IDS.connectionRevoke,
  name: 'Revoke Provider connection',
  summary: 'Begin revocation for one exact current provider connection, invalidate active leases, and schedule cleanup.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionTransitionInputSchema,
  outputSchema: supplyConnectionCommandResultSchema,
  parameters: connectionTransitionParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: false, recipientKind: 'provider_system', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'policy_eligible' },
  surfaces: supplySurfaces,
  mcp: { idempotent: true, openWorld: true, destructive: true },
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionRevoke.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['connectionRef', 'expectedAuthorityGeneration', 'expectedAuthorityDigest', 'reasonCode', 'evidenceRefs', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'reconcile_before_retry', expectedEvidence: ['provider_connection_revocation'], safeContinuations: ['supply.connection.detail'], invalidationConditions: ['authority_generation_changed', 'authority_digest_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionRevoke({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyOffboardingStatusAction = defineAction<SupplyOffboardingStatusInput, SupplyOffboardingStatusResult>({
  id: SUPPLY_ACTION_IDS.offboardingStatus,
  name: 'Read Provider offboarding status',
  summary: 'Read the durable Provider offboarding case and its one safe next action. Only the Business owner can start or resume offboarding.',
  boundaries: [
    ...supplyBoundaries,
    'This action cannot start, cancel, resume, or widen a Provider offboarding case.',
  ],
  schema: supplyOffboardingStatusInputSchema,
  outputSchema: supplyOffboardingStatusResultSchema,
  parameters: [
    { name: 'businessRef', type: 'string', description: 'Business selected by the authenticated Provider principal.', required: true },
  ],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: {
    version: SUPPLY_ACTION_ROUTE_CONTRACTS.offboardingStatus.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: ['businessRef'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['provider_offboarding_case'],
    safeContinuations: ['supply.offboarding.status'],
    invalidationConditions: ['business_changed', 'offboarding_case_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.offboardingStatus({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})
