import { z } from 'zod'

import { idempotencyKeySchema } from '@/modules/common/action'
import { currencySchema, exactAmountSchema, ProviderEarningsViewSchema } from '@/modules/money/public'
import { providerOffboardingStatusSchema } from './provider-offboarding'
import { providerToolStatusSchema } from './provider-tool-status'
import {
  publishSupplyToolV2InputSchema,
  type PublishSupplyToolV2Input,
} from './supply-publication-v2'

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
