import type { CallRefusalCode } from '@/modules/capability-execution/call-contracts'
import type { CallStatusRefusalCode } from '@/modules/capability-execution/call-recovery-contracts'
import type { ToolQuoteRefusalCode } from '@/modules/capability-execution/quote'
import type { SupplyConnectionCommandResult } from '@/modules/capability-supply/supply-actions'
import type { MarketRequestCreateResult } from '@/modules/market-demand/market-demand.actions'

/**
 * Plain-sentence copy for machine reason codes that would otherwise reach
 * rendered text as a raw snake_case value (publish refusals, source
 * candidate dispositions, tool availability reasons, Call/Quote/connection
 * refusals). Keyed loosely because the codes come from several distinct
 * backend unions (`SupplyPublishResult`'s open `reason: string`,
 * `CapabilityPublicationImportRefusal`, `PublicCapabilityUnavailableReason`,
 * plus the typed unions below) rather than one shared `ReasonCode` type.
 *
 * Look up with `REASON_COPY[code] ?? REASON_COPY_FALLBACK` — unmapped codes
 * always resolve to the fallback sentence, never to the raw code.
 */
export const REASON_COPY_FALLBACK = 'Something stopped this step. Try again or contact Help.'

/** Refusal reason forwarded by `supply.connection.*` (`supply-actions.ts`). */
type SupplyConnectionRefusalReason = Extract<SupplyConnectionCommandResult, { kind: 'refused' }>['reason']
/** Refusal code for `marketDemand.record` (`market-demand.actions.ts`). */
type MarketRequestRefusalCode = Extract<MarketRequestCreateResult, { kind: 'refused' }>['code']

/**
 * Every Call, Call-status, Quote, Provider-connection, and market-request
 * refusal code that has a schema-checked union today. Building this with
 * `satisfies` means a new code added to any of those unions fails typecheck
 * here until it gets a sentence, instead of silently falling back.
 */
const TYPED_REASON_COPY = {
  // Call refusals (`callRefusalCodeValues`, `call-contracts.ts`) and the Call
  // status subset (`callStatusRefusalCodeValues`, `call-recovery-contracts.ts`,
  // a literal subset of the same codes).
  operation_ref_invalid: 'That Quote reference is not valid. Request a new Quote for this Tool and try again.',
  operation_not_found: 'No Quote matches that reference. Request a new Quote for this Tool before calling it.',
  operation_not_current: 'This Quote is no longer current. Request a new Quote and try again.',
  operation_not_ready: 'This Tool is not ready to be called yet. Wait for its Provider to finish setup, then request a new Quote.',
  operation_unsupported: "Agentic Economy cannot call this Tool the way this Quote asked. Choose a supported Tool or input and request a new Quote.",
  input_invalid: "The Call input does not match this Tool's expected format. Check the input against the Tool's schema and try again.",
  grant_not_found: 'No active credential grant was found for this Call. Reconnect the Agent credential and try again.',
  grant_revoked: 'The credential used for this Call has been revoked. Ask the Account owner to issue a new one.',
  grant_expired: 'The credential used for this Call has expired. Ask the Account owner to issue a new one.',
  grant_generation_stale: 'The credential changed since this Quote was issued. Request a new Quote with the current credential.',
  environment_mismatch: "This credential's environment does not match the Tool's runtime environment. Use a grant issued for the Tool's environment.",
  rate_limited: 'Too many Calls were made too quickly. Wait, then retry this Call.',
  concurrency_limited: 'Too many Calls to this Tool are already in progress. Wait for one to finish, then retry.',
  budget_exceeded: "This Call would exceed the Agent's spending budget. Ask the Account owner to raise the budget or lower the amount.",
  insufficient_balance: 'The Account does not have enough credit for this Call. Add funds to the Account, then retry.',
  treasury_capacity_unavailable: 'AE cannot process payment for this Call right now. Retry shortly.',
  commercial_policy_unavailable: "AE's commercial terms for this Account are not yet active. Ask the Account owner to complete commercial setup.",
  idempotency_conflict: 'This idempotency key was already used with different details. Use a new idempotency key for a different request.',
  invocation_runtime_unavailable: 'The Call runtime is temporarily unavailable. Retry shortly.',
  authority_reader_unavailable: "AE could not read the Account's authority settings for this Call. Retry shortly.",
  authority_required: 'This Call needs approval before it can run. Ask the Account owner to authorize it.',
  authority_denied: 'The Account owner declined authority for this Call. Ask them to approve it, or choose a different Tool.',
  provider_refused: 'The Provider declined to run this Call. Try again later or choose a different Tool.',
  provider_output_invalid: 'The Provider returned an invalid result for this Call. Retry, or contact Help if it keeps happening.',
  pre_release_failed: 'AE could not safely release payment for this Call before running it. Retry, or contact Help if it keeps happening.',
  outcome_unknown: "AE could not confirm whether this Call finished. Check the Call's status before retrying.",
  payment_lane_not_brokered: "This Tool's payment lane is not brokered by AE yet. Contact Help before calling it.",
  reconciliation_required: "This Call's outcome needs confirmation before it can continue. Check its status to reconcile the result.",
  invocation_not_found: 'No Call matches that reference. Check the Call reference and try again.',
  invocation_cancelled: 'This Call was cancelled before it finished. Request a new Quote to try again.',
  lease_not_current: 'Another attempt is already holding this Call. Check its status before retrying.',
  result_invalid: "This Call's result did not pass validation. Contact Help if it keeps happening.",

  // Quote-only refusals (`toolQuoteRefusalCodeValues`, `quote.ts`); the codes
  // shared with Call refusals above (`input_invalid`, `grant_not_found`,
  // `budget_exceeded`, `insufficient_balance`, `treasury_capacity_unavailable`,
  // `commercial_policy_unavailable`) reuse the sentences above.
  tool_not_current: 'The Tool changed since this Quote was created. Request a new Quote before calling it.',
  tool_not_ready: 'This Tool is not ready to be quoted yet. Wait for its Provider to finish setup, then try again.',
  tool_unsupported: 'Agentic Economy cannot quote this Tool the way this request asked. Choose a supported Tool or input and try again.',
  pricing_setup_required: "This Tool's pricing is not fully set up yet. Its Provider must finish pricing setup before it can be quoted.",
  inspection_unavailable: 'This Tool has not completed inspection yet, so it cannot be quoted. Check back once inspection finishes.',

  // Shared across every domain above: the Tool catalogue, a Call, a Quote,
  // and a Provider connection can all report these two the same way.
  source_unavailable: 'The Tool catalogue is temporarily unavailable. Retry shortly.',
  tool_not_found: 'None of the requested Tool references matched a current Tool.',

  // Provider-connection refusals (`supply.connection.*`,
  // `providerConnectionRefusalReasonSchema` in `supply-actions.ts`).
  invalid_identity: "This connection's identity does not match the Provider account. Reconnect using the correct Provider identity.",
  invalid_time: 'This connection request has an invalid or expired timestamp. Start the connection again.',
  invalid_scope: 'This connection does not have the scope this action needs. Reconnect with the correct scope.',
  invalid_resource: 'This connection does not match the Tool or source it claims to connect. Check the reference and reconnect.',
  invalid_generation: 'This connection is out of date. Refresh the connection and try again.',
  invalid_digest: "This connection's evidence does not match what AE expects. Reconnect and try again.",
  invalid_transition: "This connection cannot move to that state from here. Check its current status before retrying.",
  command_identity_conflict: 'This connection command conflicts with one already in progress. Wait for it to finish, then retry.',
  claim_invalid: 'The ownership claim for this connection could not be verified. Check the claim details and try again.',
  inspection_target_invalid: 'The address given for inspection is not a valid endpoint. Check it and try again.',
  inspection_target_not_public: 'AE could not reach this endpoint from the public internet. Make it publicly reachable, then retry.',
  inspection_request_invalid: "AE could not send a valid inspection request to this endpoint. Check its configuration and try again.",
  inspection_request_failed: "AE's inspection request to this endpoint failed. Check the endpoint is running, then retry.",
  inspection_redirect_refused: 'This endpoint redirected the inspection request, which AE does not follow. Point AE directly at the final endpoint.',
  inspection_payment_not_required: "This endpoint did not ask for payment during inspection, so AE could not confirm its pricing. Check its payment setup and try again.",
  inspection_challenge_missing: "This endpoint's inspection challenge was missing. Check its configuration and try again.",
  inspection_challenge_too_large: "This endpoint's inspection challenge was too large for AE to process. Reduce its size and try again.",
  inspection_challenge_malformed: "This endpoint's inspection challenge was not formatted correctly. Fix its format and try again.",
  inspection_challenge_conflict: 'This endpoint returned inconsistent inspection challenges. Check its configuration and try again.',
  inspection_challenge_resource_mismatch: "This endpoint's inspection challenge did not match the resource being connected. Check the resource and try again.",
  inspection_unsupported: 'AE does not yet support inspecting this kind of endpoint. Choose a supported connection type.',
  inspection_ambiguous: 'AE found more than one possible match during inspection. Narrow the request and try again.',
  inspection_schema_missing: 'This endpoint did not return a schema AE could read. Add a schema to the endpoint, then retry.',
  inspection_selector_invalid: 'The selector given for this endpoint does not match anything found during inspection. Check it and try again.',
  inspection_transport_unsupported: 'AE does not support this endpoint’s transport yet. Choose a supported connection type.',

  // Market-request refusals (`marketDemand.record`,
  // `market-demand.actions.ts`); `idempotency_conflict` and
  // `source_unavailable` reuse the sentences above.
  unauthenticated: 'AE could not verify the Agent making this request. Reconnect the Agent credential and try again.',
  invalid_request: 'This request is not valid. Check its format and try again.',
  current_match_exists: 'An open request for this same query already exists. Check its status instead of recording a new one.',
} satisfies Record<
  | CallRefusalCode
  | CallStatusRefusalCode
  | ToolQuoteRefusalCode
  | SupplyConnectionRefusalReason
  | MarketRequestRefusalCode,
  string
>

export const REASON_COPY: Record<string, string> = {
  source_changed: 'The source changed after preview. Discover endpoints again, then review the current facts.',
  candidate_changed: 'The source changed after preview. Discover endpoints again, then review the current facts.',
  connection_required: 'The source connection is unavailable. Reconnect it, then submit again.',
  connection_unavailable: 'The source connection is unavailable. Reconnect it, then submit again.',
  source_authority_review_required: 'AE received the Tool. It remains Under review until source authority is confirmed.',
  fallback: REASON_COPY_FALLBACK,

  // Tool-catalogue read reasons (`registry.tools.*`; MCP host adapter reuses
  // these for the `content[0].text` sentence on a tool-level refusal).
  // `tool_not_found` and `source_unavailable` are defined once, in
  // `TYPED_REASON_COPY` below, since both are also schema-checked Call/Quote
  // refusal codes.
  not_found: 'No Tool matches that reference. Use registry.tools.search or registry.tools.list to find a current reference.',
  tool_unavailable: 'The requested Tools are not currently available for comparison.',
  query_invalid: 'That request is not valid. Check the reference format and try again.',
  source_capacity_exceeded: 'The Tool catalogue could not complete this query right now. Retry with a narrower query.',
  setup_required: 'This Tool is not yet configured for calls. Its Provider must finish setup before it can be used.',
  inspection_required: 'This Tool has not completed inspection yet. Its price and health are confirmed at inspection.',
  temporarily_unavailable: 'This Tool is temporarily unavailable. Retry shortly or choose an alternative Tool.',
  readiness_expired: "This Tool's readiness check has expired. It will be re-verified before it can be used again.",
  publisher_withdrew: 'The Provider withdrew this Tool. Search for an alternative.',
  under_review: 'This Tool is under review and is not yet available.',
  updated_terms_require_review: "This Tool's terms changed and require review before it can be used again.",
  not_supported_by_ae: 'Agentic Economy does not support calling this Tool.',

  // Published-business catalogue reads (`registry.services.detail`,
  // `registry.detail`; `internal/registry-action-contracts.ts`).
  service_not_found: 'No published business matches that reference. Search the catalogue for a current listing.',
  business_not_found: 'No published business matches that reference. Search the catalogue for a current listing.',

  // Funding handoff (`funding.handoff.create`/`.status`,
  // `money/funding-handoff.actions.ts`). The wire schema carries an open
  // `code: string`, not a closed union, so these are the concrete codes the
  // handoff service emits today; see `reason-copy.test.ts` for the coverage
  // check that stands in for typecheck-time drift protection here.
  stripe_setup_required: "AE's payment provider is not fully set up yet. Contact Help before creating a funding handoff.",
  funding_amount_invalid: 'That funding amount is outside the allowed range. Check the minimum, maximum, and increment, then try again.',
  funding_outcome_unknown: 'AE could not confirm whether this funding session was created. Check its status before creating another.',
  funding_idempotency_conflict: 'This idempotency key was already used with a different funding amount. Use a new idempotency key for a different funding session.',
  payment_binding_invalid: 'This payment does not match the funding session it claims to complete. Create a new funding session and try again.',

  ...TYPED_REASON_COPY,
}

/** One sentence per Add Tool source-type tab (`AeSupplySourceNativeStart`'s `SourceKind`). */
export const SUPPLY_SOURCE_TYPE_COPY: Record<'openapi' | 'mcp' | 'agent_plugin' | 'x402', string> = {
  openapi: 'Connect an existing REST API described by an OpenAPI 3.0 or 3.1 document; AE reads its operations as Tools.',
  mcp: 'Connect a remote MCP server; AE reads its tools directly over JSON-RPC.',
  agent_plugin: 'Connect a service published with an Agent Plugins 1.0 manifest and its paired MCP file.',
  x402: 'Connect an endpoint that already prices itself using the x402 payment protocol.',
}
