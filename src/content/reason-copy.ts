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
  payments_not_ready: 'Paid Tool purchases are temporarily unavailable. You can keep searching and comparing Tools.',
  payments_paused: 'Paid Tool purchases are temporarily paused. You can keep searching and comparing Tools.',
  payments_admins_only: 'Paid Tool purchases are currently available to Admins only. You can keep searching and comparing Tools.',
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
  grant_revoked: 'The credential used for this Call has been revoked. Ask the Business owner to issue a new one.',
  grant_expired: 'The credential used for this Call has expired. Ask the Business owner to issue a new one.',
  grant_generation_stale: 'The credential changed since this Quote was issued. Request a new Quote with the current credential.',
  environment_mismatch: "This credential's environment does not match the Tool's runtime environment. Use a grant issued for the Tool's environment.",
  rate_limited: 'Too many Calls were made too quickly. Wait, then retry this Call.',
  concurrency_limited: 'Too many Calls to this Tool are already in progress. Wait for one to finish, then retry.',
  budget_exceeded: "This Call would exceed the Agent's spending budget. Ask the Business owner to raise the budget or lower the amount.",
  insufficient_balance: 'The Business does not have enough credit for this Call. Add credit, then retry.',
  treasury_capacity_unavailable: 'Agentic Economy cannot process payment for this Call right now. Retry shortly.',
  commercial_policy_unavailable: "Agentic Economy's commercial terms for this Business are not yet active. Ask the Business owner to complete commercial setup.",
  idempotency_conflict: 'This idempotency key was already used with different details. Use a new idempotency key for a different request.',
  invocation_runtime_unavailable: 'The Call runtime is temporarily unavailable. Retry shortly.',
  authority_reader_unavailable: "Agentic Economy could not read the Business's authority settings for this Call. Retry shortly.",
  authority_required: 'This Call needs approval before it can run. Ask the Business owner to authorize it.',
  authority_denied: 'The Business owner declined authority for this Call. Ask them to approve it, or choose a different Tool.',
  provider_refused: 'The Provider declined to run this Call. Try again later or choose a different Tool.',
  provider_output_invalid: 'The Provider returned an invalid result for this Call. Retry, or contact Help if it keeps happening.',
  pre_release_failed: 'Agentic Economy could not safely release payment for this Call before running it. Retry, or contact Help if it keeps happening.',
  outcome_unknown: "Agentic Economy could not confirm whether this Call finished. Check the Call's status before retrying.",
  payment_unavailable: 'Agentic Economy did not sign the payment for this Call. Try again later or contact Help.',
  price_changed: "The Provider's live price changed since the Quote, so nothing was charged. Request a new Quote.",
  payee_changed: "The Provider's payment address changed since the Quote, so nothing was charged. Check the Provider before requesting a new Quote.",
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
  invalid_identity: "This connection's identity does not match the Provider Business. Reconnect using the correct Provider identity.",
  invalid_time: 'This connection request has an invalid or expired timestamp. Start the connection again.',
  invalid_scope: 'This connection does not have the scope this action needs. Reconnect with the correct scope.',
  invalid_resource: 'This connection does not match the Tool or source it claims to connect. Check the reference and reconnect.',
  invalid_generation: 'This connection is out of date. Refresh the connection and try again.',
  invalid_digest: "This connection's evidence does not match what Agentic Economy expects. Reconnect and try again.",
  invalid_transition: "This connection cannot move to that state from here. Check its current status before retrying.",
  command_identity_conflict: 'This connection command conflicts with one already in progress. Wait for it to finish, then retry.',
  claim_invalid: 'The ownership claim for this connection could not be verified. Check the claim details and try again.',
  inspection_target_invalid: 'The address given for inspection is not a valid endpoint. Check it and try again.',
  inspection_target_not_public: 'Agentic Economy could not reach this endpoint from the public internet. Make it publicly reachable, then retry.',
  inspection_request_invalid: "Agentic Economy could not send a valid inspection request to this endpoint. Check its configuration and try again.",
  inspection_request_failed: "Agentic Economy's inspection request to this endpoint failed. Check the endpoint is running, then retry.",
  inspection_redirect_refused: 'This endpoint redirected the inspection request, which Agentic Economy does not follow. Point Agentic Economy directly at the final endpoint.',
  inspection_payment_not_required: "This endpoint did not ask for payment during inspection, so Agentic Economy could not confirm its pricing. Check its payment setup and try again.",
  inspection_challenge_missing: "This endpoint's inspection challenge was missing. Check its configuration and try again.",
  inspection_challenge_too_large: "This endpoint's inspection challenge was too large for Agentic Economy to process. Reduce its size and try again.",
  inspection_challenge_malformed: "This endpoint's inspection challenge was not formatted correctly. Fix its format and try again.",
  inspection_challenge_conflict: 'This endpoint returned inconsistent inspection challenges. Check its configuration and try again.',
  inspection_challenge_resource_mismatch: "This endpoint's inspection challenge did not match the resource being connected. Check the resource and try again.",
  inspection_unsupported: 'Agentic Economy does not yet support inspecting this kind of endpoint. Choose a supported connection type.',
  inspection_ambiguous: 'Agentic Economy found more than one possible match during inspection. Narrow the request and try again.',
  inspection_schema_missing: 'This endpoint did not return a schema Agentic Economy could read. Add a schema to the endpoint, then retry.',
  inspection_selector_invalid: 'The selector given for this endpoint does not match anything found during inspection. Check it and try again.',
  inspection_transport_unsupported: 'Agentic Economy does not support this endpoint’s transport yet. Choose a supported connection type.',

  // Market-request refusals (`marketDemand.record`,
  // `market-demand.actions.ts`); `idempotency_conflict` and
  // `source_unavailable` reuse the sentences above.
  unauthenticated: 'Agentic Economy could not verify the Agent making this request. Reconnect the Agent credential and try again.',
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
  feedback_disabled: 'Product feedback is disabled on this server. Skip feedback and continue your task.',
  feedback_unavailable: 'Feedback ingestion was not confirmed. Do not automatically retry; continue your task.',
  source_changed: 'The source changed after preview. Discover endpoints again, then review the current facts.',
  candidate_changed: 'The source changed after preview. Discover endpoints again, then review the current facts.',
  connection_required: 'The source connection is unavailable. Reconnect it, then submit again.',
  connection_unavailable: 'The source connection is unavailable. Reconnect it, then submit again.',
  source_authority_review_required: 'Agentic Economy received the Tool. It remains Under review until source authority is confirmed.',
  source_action_required: 'This source needs a connection. Complete source setup, then submit again.',
  source_invalid: 'The source is malformed. Correct its OpenAPI or protocol document, then find Tools again.',
  source_too_large: 'The source document exceeds the size limit. Remove unused definitions, then find Tools again.',
  source_too_deep: 'The source schema nests too deeply. Simplify it, then find Tools again.',
  source_version_unsupported: 'Use a supported OpenAPI or source protocol version, then find Tools again.',
  selector_invalid: 'The selected operation no longer matches the source. Find Tools again.',
  schema_missing: 'Declare one successful JSON response with an input and output schema in the source.',
  schema_profile_unsupported: 'The source schema cannot be normalized. Simplify its references and declare a required output field.',
  admit_schema_circular_reference: 'Break the circular schema reference in the source, then find Tools again.',
  admit_schema_reference_unresolvable: 'Fix the unresolved schema reference in the source, then find Tools again.',
  admit_schema_too_deep: 'Flatten deeply nested schema references in the source, then find Tools again.',
  admit_schema_deref_unavailable: 'Inline the referenced schema in the source, then find Tools again.',
  admit_output_no_guaranteed_field: 'Declare an always-present output field in the source schema so the Tool has completion evidence.',
  openapi_query_parameter_definition_unsupported: 'Use a directly declared query parameter schema instead of Parameter.content.',
  openapi_query_parameter_serialization_unsupported: 'Use form-style query serialization with a supported explode value.',
  openapi_query_parameter_schema_unsupported: 'Use a scalar or one-dimensional scalar array for this query parameter.',
  openapi_path_parameter_required: 'Declare each path parameter as required in the source.',
  openapi_path_parameter_serialization_unsupported: 'Use a simple scalar or scalar array for this path parameter.',
  openapi_header_parameter_unsafe: 'Remove this reserved header or declare it as a supported security scheme.',
  openapi_header_parameter_serialization_unsupported: 'Use a simple scalar or scalar array for this header.',
  openapi_media_type_unsupported: 'Declare JSON request and response media types in the source.',
  openapi_request_body_parameter_mix_unsupported: 'Separate the JSON body from path, query or header parameters.',
  openapi_response_status_unsupported: 'Declare exactly one explicit successful JSON response in the source.',
  openapi_operation_unsupported: 'Use a supported GET operation or a JSON POST operation.',
  opaque_input_without_valid_example: 'Provide a schema-valid example of the required Tool input.',
  transport_unsupported: 'Declare a single public HTTPS server URL for this operation.',
  commercial_metadata_inconsistent: 'Check the Tool price and source connection details, then submit again.',
  payment_execution_unsupported: 'The declared payment execution is not supported; correct the source payment terms.',
  payment_required_invalid: 'Correct the malformed x402 payment challenge at the source.',
  bazaar_discovery_invalid: 'Correct the malformed Bazaar discovery metadata at the source.',
  consequences_invalid: 'Review the Tool effects and data declarations, then submit again.',
  pricing_invalid: 'The price is the amount in the payment challenge. Read the endpoint again, then submit.',
  catalog_offering_origin_changed: 'This saved Tool changed during submission. Open Tools, resume its draft and submit again.',
  authorization_denied: 'This Business account cannot publish the selected Tool. Check Provider access before retrying.',
  operation_key_conflict: 'A different submission already used this command. Open Tools to check the current Tool before retrying.',
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

  // Directory admission reasons (`FacilitatorDiscoverySkipReason`), stored on each
  // index row and shown where a listing cannot be quoted.
  scheme_unsupported: 'Agentic Economy pays with the x402 exact scheme only, and this listing asks for another scheme.',
  chain_unsupported: 'Agentic Economy pays on Base only, and this listing asks for another network.',
  asset_unsupported: 'Agentic Economy pays in USDC only, and this listing asks for another asset.',
  amount_invalid: 'The listed price is not a valid USDC amount, so Agentic Economy cannot quote it.',
  payment_terms_invalid: 'The x402 payment terms of this listing could not be read, so Agentic Economy cannot quote it.',
  resource_invalid: "This listing's endpoint or payment requirement could not be read, so Agentic Economy cannot quote it.",
  resource_not_payable: 'This endpoint did not answer with an x402 payment challenge (HTTP 402), so there is nothing to pay for.',

  // Published-business catalogue reads (`registry.services.detail`,
  // `registry.detail`; `internal/registry-action-contracts.ts`).
  service_not_found: 'No published business matches that reference. Search the catalogue for a current listing.',
  business_not_found: 'No published business matches that reference. Search the catalogue for a current listing.',

  // Funding handoff (`funding.handoff.create`/`.status`,
  // `money/funding-handoff.actions.ts`). The wire schema carries an open
  // `code: string`, not a closed union, so these are the concrete codes the
  // handoff service emits today; see `reason-copy.test.ts` for the coverage
  // check that stands in for typecheck-time drift protection here.
  stripe_setup_required: "Agentic Economy's payment provider is not fully set up yet. Contact Help before creating a funding handoff.",
  funding_amount_invalid: 'That funding amount is outside the allowed range. Check the minimum, maximum, and increment, then try again.',
  funding_outcome_unknown: 'Agentic Economy could not confirm whether this funding session was created. Check its status before creating another.',
  funding_idempotency_conflict: 'This idempotency key was already used with a different funding amount. Use a new idempotency key for a different funding session.',
  payment_binding_invalid: 'This payment does not match the funding session it claims to complete. Create a new funding session and try again.',

  // Owner credit reads (`moneyLedger.readCreditAccount`/`.listCreditActivity`/
  // `.readKeyUsage`); `unauthenticated` and `source_unavailable` reuse the
  // sentences above.
  billing_identity_mismatch: 'This request does not match the signed-in Business. Reload the page and try again.',
  credential_activity_unavailable: 'Per-credential activity is not available from the current ledger yet. The Credit shown above remains accurate.',
  credential_usage_unavailable: 'Per-credential usage is not available from the current ledger yet.',

  ...TYPED_REASON_COPY,
}

/** Add Tool accepts one public HTTPS x402 URL. */
export const SUPPLY_SOURCE_TYPE_COPY: Record<'x402', string> = {
  x402: 'Paste one public HTTPS x402 URL. The payment challenge supplies the network, price, schema, and payTo.',
}
