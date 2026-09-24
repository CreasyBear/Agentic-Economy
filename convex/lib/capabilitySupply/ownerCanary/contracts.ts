import { v, type Infer } from 'convex/values'

import {
  callResultValue,
  jsonObject,
  sellerOnboardingCanaryExecutionEnvelopeValue,
} from '@/modules/capability-execution/convex'
import type { JsonValue } from '@/modules/capability-contract/public'

import type { Doc, Id } from '../../../_generated/dataModel'
import { sourceWriteArgs } from '../../../sourceWriteAdmission'

export const requestSellerOnboardingCanaryArgs = {
  businessId: v.id('businesses'),
  offeringRef: v.string(),
  offeringRevision: v.number(),
  offeringSourceHash: v.string(),
  publicationRef: v.string(),
  publicationRevision: v.number(),
  input: v.optional(jsonObject),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
} as const

export const requestSellerOnboardingCanaryResult = v.union(
  v.object({
    kind: v.union(v.literal('enqueued'), v.literal('replayed')),
    canaryRef: v.string(),
    callRef: v.string(),
    toolRef: v.string(),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('authorization_denied'),
      v.literal('source_write_refused'),
      v.literal('staging_snapshot_missing'),
      v.literal('catalog_revision_changed'),
      v.literal('input_invalid'),
      v.literal('canary_grant_missing'),
      v.literal('canary_grant_ambiguous'),
      v.literal('canary_budget_exceeded'),
      v.literal('canary_identity_conflict'),
      v.literal('canary_dispatch_refused'),
    ),
  }),
)

export const sellerOnboardingCanaryEvidenceValue = v.union(v.object({
  sellerOnboardingCanary: sellerOnboardingCanaryExecutionEnvelopeValue,
  toolJson: v.string(),
  state: v.union(
    v.literal('pending'),
    v.literal('completed'),
    v.literal('refused'),
    v.literal('reconciliation_required'),
    v.literal('cancelled'),
  ),
  result: v.optional(callResultValue),
  evidenceHash: v.optional(v.string()),
  attemptRef: v.optional(v.string()),
  updatedAt: v.number(),
}), v.null())

export type RequestSellerOnboardingCanaryResult = Infer<typeof requestSellerOnboardingCanaryResult>

export type RequestArgs = {
  businessId: Id<'businesses'>
  offeringRef: string
  offeringRevision: number
  offeringSourceHash: string
  publicationRef: string
  publicationRevision: number
  input?: Record<string, JsonValue>
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}

export type CanaryEnvelope = NonNullable<Doc<'capabilityCalls'>['sellerOnboardingCanary']>
