import { v } from 'convex/values'

export type PromoteX402SellerCanaryResult =
  | {
      kind: 'promoted' | 'replayed'
      canaryRef: string
      offeringRef: string
      offeringRevision: number
      publicationRef: string
      publicationRevision: number
      toolRef: string
      promotionEvidenceDigest: string
      outputDigest: string
    }
  | {
      kind: 'refused'
      code:
        | 'unauthenticated'
        | 'wrong_owner'
        | 'source_write_refused'
        | 'canary_not_found'
        | 'canary_evidence_invalid'
        | 'target_drift'
        | 'operation_conflict'
        | 'seller_claim_stale'
        | 'funding_authority_invalid'
        | 'readiness_stale'
        | 'output_nondeterministic'
        | 'canary_pending'
        | 'reconciliation_required'
        | 'canary_identity_mismatch'
        | 'canary_expired'
        | 'operation_commitment_stale'
        | 'invocation_refused'
        | 'payment_not_settled'
        | 'payment_evidence_missing'
        | 'spend_commitment_mismatch'
        | 'output_contract_invalid'
        | 'output_unusable'
    }

export const promoteAdmittedSellerCanaryArgs = { canaryRef: v.string() }

export const promoteAdmittedSellerCanaryResult = v.union(
  v.object({
    kind: v.union(v.literal('promoted'), v.literal('replayed')),
    canaryRef: v.string(),
    offeringRef: v.string(),
    offeringRevision: v.number(),
    publicationRef: v.string(),
    publicationRevision: v.number(),
    toolRef: v.string(),
    promotionEvidenceDigest: v.string(),
    outputDigest: v.string(),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('unauthenticated'),
      v.literal('wrong_owner'),
      v.literal('source_write_refused'),
      v.literal('canary_not_found'),
      v.literal('canary_evidence_invalid'),
      v.literal('target_drift'),
      v.literal('operation_conflict'),
      v.literal('seller_claim_stale'),
      v.literal('funding_authority_invalid'),
      v.literal('readiness_stale'),
      v.literal('output_nondeterministic'),
      v.literal('canary_pending'),
      v.literal('reconciliation_required'),
      v.literal('canary_identity_mismatch'),
      v.literal('canary_expired'),
      v.literal('operation_commitment_stale'),
      v.literal('invocation_refused'),
      v.literal('payment_not_settled'),
      v.literal('payment_evidence_missing'),
      v.literal('spend_commitment_mismatch'),
      v.literal('output_contract_invalid'),
      v.literal('output_unusable'),
    ),
  }),
)
