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
  source_changed: 'The source changed after preview. Find Tools again, then review the current facts.',
  candidate_changed: 'The source changed after preview. Find Tools again, then review the current facts.',
  connection_required: 'The source connection is unavailable. Reconnect it, then submit again.',
  connection_unavailable: 'The source connection is unavailable. Reconnect it, then submit again.',
  source_authority_review_required: 'AE received the Tool. It remains Under review until source authority is confirmed.',
  operation_not_current: 'This Quote is no longer current. Request a new Quote and try again.',
  fallback: REASON_COPY_FALLBACK,
}
