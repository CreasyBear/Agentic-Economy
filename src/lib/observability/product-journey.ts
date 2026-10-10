import { z } from 'zod'
import { captureClientProductEventOnClient } from './capture-client-events'
import { isTelemetryAllowedForCurrentRoute } from './private-route-safety'

/** Browser observations are exploratory signals, never proof of authority or delivery. */
const productJourneySchema = z.strictObject({
  action: z.enum(['auth_viewed', 'auth_wait', 'auth_retry', 'auth_session_observed',
    'market_viewed', 'search_requested', 'search_observed', 'tool_viewed',
    'alternatives_requested', 'guide_opened', 'help_opened']),
  phase: z.enum(['attempted', 'observed', 'delayed', 'failed']),
  surface: z.enum(['app', 'sign_in', 'sign_up', 'market', 'command_search', 'tool', 'support', 'status']),
  queryLength: z.number().int().min(0).max(8192).optional(),
  callableCount: z.number().int().min(0).max(1_000_000).optional(),
  resultCount: z.number().int().min(0).max(1_000_000).optional(),
  listingKind: z.enum(['ae_callable', 'external_listing']).optional(),
  hasReturnDestination: z.boolean().optional(),
})

export type ProductJourneyEvent = z.infer<typeof productJourneySchema>

export function recordProductJourney(input: ProductJourneyEvent): void {
  if (typeof window === 'undefined' || !isTelemetryAllowedForCurrentRoute()) return
  const parsed = productJourneySchema.safeParse(input)
  if (!parsed.success) return
  try {
    captureClientProductEventOnClient('ae_product_journey', {
      ...parsed.data, evidence: 'browser_observation',
    })
  } catch (cause) {
    // Analytics failure cannot interrupt the user's action.
    void cause
  }
}
