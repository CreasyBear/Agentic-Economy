/**
 * Plain-sentence copy for machine reason codes that would otherwise reach
 * rendered text as a raw snake_case value (publish refusals, source
 * candidate dispositions, tool availability reasons). Keyed loosely because
 * the codes come from several distinct backend unions
 * (`SupplyPublishResult`'s open `reason: string`,
 * `CapabilityPublicationImportRefusal`, `PublicCapabilityUnavailableReason`)
 * rather than one shared `ReasonCode` type.
 *
 * Look up with `REASON_COPY[code] ?? REASON_COPY_FALLBACK` — unmapped codes
 * always resolve to the fallback sentence, never to the raw code.
 */
export const REASON_COPY_FALLBACK = 'Something stopped this step. Try again or contact Help.'

export const REASON_COPY: Record<string, string> = {
  source_changed: 'The source changed after preview. Discover endpoints again, then review the current facts.',
  candidate_changed: 'The source changed after preview. Discover endpoints again, then review the current facts.',
  connection_required: 'The source connection is unavailable. Reconnect it, then submit again.',
  connection_unavailable: 'The source connection is unavailable. Reconnect it, then submit again.',
  source_authority_review_required: 'AE received the Tool. It remains Under review until source authority is confirmed.',
  operation_not_current: 'This Quote is no longer current. Request a new Quote and try again.',
  fallback: REASON_COPY_FALLBACK,

  // Tool-catalogue read reasons (`registry.tools.*`; MCP host adapter reuses
  // these for the `content[0].text` sentence on a tool-level refusal).
  not_found: 'No Tool matches that reference. Use registry.tools.search or registry.tools.list to find a current reference.',
  tool_not_found: 'None of the requested Tool references matched a current Tool.',
  tool_unavailable: 'The requested Tools are not currently available for comparison.',
  query_invalid: 'That request is not valid. Check the reference format and try again.',
  source_unavailable: 'The Tool catalogue is temporarily unavailable. Retry shortly.',
  source_capacity_exceeded: 'The Tool catalogue could not complete this query right now. Retry with a narrower query.',
  setup_required: 'This Tool is not yet configured for calls. Its Provider must finish setup before it can be used.',
  inspection_required: 'This Tool has not completed inspection yet. Its price and health are confirmed at inspection.',
  temporarily_unavailable: 'This Tool is temporarily unavailable. Retry shortly or choose an alternative Tool.',
  readiness_expired: "This Tool's readiness check has expired. It will be re-verified before it can be used again.",
  publisher_withdrew: 'The Provider withdrew this Tool. Search for an alternative.',
  under_review: 'This Tool is under review and is not yet available.',
  updated_terms_require_review: "This Tool's terms changed and require review before it can be used again.",
  not_supported_by_ae: 'Agentic Economy does not support calling this Tool.',
}

/** One sentence per Add Tool source-type tab (`AeSupplySourceNativeStart`'s `SourceKind`). */
export const SUPPLY_SOURCE_TYPE_COPY: Record<'openapi' | 'mcp' | 'agent_plugin' | 'x402', string> = {
  openapi: 'Connect an existing REST API described by an OpenAPI 3.0 or 3.1 document; AE reads its operations as Tools.',
  mcp: 'Connect a remote MCP server; AE reads its tools directly over JSON-RPC.',
  agent_plugin: 'Connect a service published with an Agent Plugins 1.0 manifest and its paired MCP file.',
  x402: 'Connect an endpoint that already prices itself using the x402 payment protocol.',
}
