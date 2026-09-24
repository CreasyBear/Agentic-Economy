import { v, type Infer } from 'convex/values'

import { clerkConsequenceProofValue } from '../../authority/consequence/proof'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'

export const providerReversalArgsValue = v.object({
  obligationRef: v.string(),
  callRef: v.string(),
  settlementTransactionRef: v.string(),
  evidenceRef: v.string(),
  evidenceDigest: v.string(),
  expectedUpdatedAt: v.number(),
  confirmation: v.string(),
  commandRef: v.string(),
  idempotencyKey: v.string(),
  proof: v.optional(clerkConsequenceProofValue),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
export const providerReversalResultValue = v.union(
  v.object({
    kind: v.union(v.literal('completed'), v.literal('replayed')),
    obligationRef: v.string(),
    transactionRef: v.string(),
  }),
  v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.literal(false) }),
  v.object({
    kind: v.literal('unavailable'),
    code: v.string(),
    submissionProvenAbsent: v.literal(true),
  }),
  v.object({ kind: v.literal('outcome_unknown'), reference: v.string(), statusRef: v.string() }),
)
export const prepareProviderReversalResultValue = v.union(
  v.object({ kind: v.literal('prepared') }),
  providerReversalResultValue,
)

export type ProviderReversalArgs = Infer<typeof providerReversalArgsValue>
export type ProviderReversalResult = Infer<typeof providerReversalResultValue>
