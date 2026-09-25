import { v, type Infer } from 'convex/values'

export const approvalDecision = v.union(v.literal('approve'), v.literal('deny'))
const approvalDecisionContext = v.object({
  agent: v.object({ principalRef: v.string(), applicationRef: v.string(), currentDisplayName: v.union(v.string(), v.null()) }),
  purpose: v.null(),
  acceptedQuote: v.union(
    v.object({
      kind: v.literal('available'),
      quoteRef: v.string(),
      tool: v.object({ name: v.string(), description: v.string() }),
      provider: v.object({ ref: v.string(), name: v.null() }),
      maximumSpend: v.object({ currency: v.literal('AUD'), units: v.string(), exponent: v.literal(6) }),
      dataUse: v.array(v.object({
        effectId: v.string(), inputPointer: v.string(),
        classification: v.union(v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential')),
        phase: v.union(v.literal('preparation'), v.literal('execution')),
        recipient: v.union(
          v.object({ kind: v.literal('candidate_binding') }),
          v.object({ kind: v.literal('selected_binding') }),
          v.object({ kind: v.literal('named_recipient'), recipientId: v.string() }),
        ),
        purposes: v.array(v.string()),
      })),
      effects: v.array(v.object({
        effectId: v.string(),
        class: v.union(v.literal('data_release'), v.literal('financial_exposure'), v.literal('external_state_change')),
        authority: v.union(v.literal('none'), v.literal('explicit'), v.literal('mandate_or_explicit')),
        reversibility: v.union(v.literal('not_applicable'), v.literal('reversible'), v.literal('conditional'), v.literal('irreversible')),
      })),
    }),
    v.object({ kind: v.literal('unavailable'), reason: v.union(v.literal('quote_missing'), v.literal('quote_mismatch'), v.literal('material_invalid')) }),
  ),
})
export const pendingApprovalView = v.object({
  callRef: v.string(),
  toolRef: v.string(),
  authorityRequest: v.object({
    kind: v.union(v.literal('approval_required'), v.literal('spending_policy')),
    toolRef: v.string(),
    consequence: v.union(v.literal('read_only'), v.literal('communication'), v.literal('external_effect')),
    retryClass: v.union(v.literal('replayable'), v.literal('attributable_retry'), v.literal('reconcile_before_retry')),
    maximumSpend: v.optional(v.object({ currency: v.string(), units: v.string(), exponent: v.number() })),
    dataFields: v.array(v.string()),
    expiresAt: v.optional(v.string()),
  }),
  createdAt: v.number(),
  decisionContext: v.optional(approvalDecisionContext),
})
export const approvalDecisionResult = v.union(
  v.object({ kind: v.union(v.literal('approved'), v.literal('denied'), v.literal('replayed')), callRef: v.string() }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('authentication_required'),
      v.literal('mfa_reverification_required'),
      v.literal('invocation_not_found'),
      v.literal('authority_not_pending'),
      v.literal('grant_not_current'),
      v.literal('invocation_invalid'),
    ),
  }),
)

export type PendingApprovalView = Infer<typeof pendingApprovalView>

// Keep the handler's narrower refusal shape distinct from the RPC validator.
export type ApprovalDecisionResult =
  | { kind: 'approved' | 'denied' | 'replayed'; callRef: string }
  | {
      kind: 'refused'
      code:
        | 'authentication_required'
        | 'invocation_not_found'
        | 'authority_not_pending'
        | 'grant_not_current'
        | 'invocation_invalid'
    }
