import { z } from 'zod'

import { MARKET_SUPPLY_MANAGE_SCOPE, MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { defineAction } from '@/modules/common/action'

export const FEEDBACK_ROUTE_CONTRACT = Object.freeze({
  actionId: 'feedback.submit',
  contractVersion: 'feedback-submit:v1',
  method: 'POST' as const,
  path: '/api/v1/feedback',
  routerPath: '/api/v1/feedback' as const,
  scope: MARKET_TOOLS_CALL_SCOPE,
  anyScopes: Object.freeze([MARKET_TOOLS_CALL_SCOPE, MARKET_SUPPLY_MANAGE_SCOPE]),
})

export const feedbackInputSchema = z.strictObject({
  message: z.string().min(1).max(10_000).regex(/\S/u, 'Feedback must contain non-whitespace text.'),
})
export const feedbackResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('accepted') }),
  z.strictObject({
    kind: z.literal('refused'),
    code: z.enum(['authentication_required', 'scope_required', 'invalid_request', 'feedback_disabled', 'feedback_unavailable']),
    retryable: z.literal(false),
  }),
])

export const feedbackSubmitAction = defineAction({
  id: FEEDBACK_ROUTE_CONTRACT.actionId,
  name: 'Send product feedback',
  summary: 'Optional AE feedback via PostHog.',
  boundaries: [
    'Report expected/actual behaviour; continue.',
    'Pseudonymous. No credentials, personal/business data or Tool payloads.',
    'Ingestion only; no ratings, refunds or authority changes.',
    'Skip disabled/unavailable; no auto-retry: ingestion may succeed.',
  ],
  schema: feedbackInputSchema,
  parameters: [{ name: 'message', type: 'string', required: true, description: 'Explicit product feedback, 1–10,000 characters. Include expected and actual behaviour without sensitive data.' }],
  readOnly: false,
  effect: { class: 'disclosure', reversible: false, recipientKind: 'business', dataClasses: ['explicit_product_feedback'], spendExposure: 'none', approval: 'none' },
  credentialAdmission: { scope: FEEDBACK_ROUTE_CONTRACT.scope, anyScopes: FEEDBACK_ROUTE_CONTRACT.anyScopes, authority: 'descriptor_classified' },
  mcp: { idempotent: false, openWorld: true, destructive: false },
  surfaces: ['http', 'mcp', 'cli'],
  outputSchema: feedbackResultSchema,
  invocationContract: {
    version: FEEDBACK_ROUTE_CONTRACT.contractVersion,
    consequenceClass: 'communication', materialInputPaths: ['message'],
    authorityRequirement: 'principal', retryClass: 'reconcile_before_retry',
    expectedEvidence: ['PostHog ingestion acknowledgment'], safeContinuations: [],
    invalidationConditions: ['credential_revoked', 'analytics_disabled'],
  },
  /** Requires authenticated attribution and explicit bounded text. Ensures only
   * confirmed ingestion is accepted. Invariant: no commercial state changes.
   * Invalid input/authority refuses before sending; uncertain delivery never retries. */
  async run({ data, context }): Promise<z.infer<typeof feedbackResultSchema>> {
    const principal = context.agentAccessPrincipal
    if (principal === undefined) return { kind: 'refused', code: 'authentication_required', retryable: false }
    if (!FEEDBACK_ROUTE_CONTRACT.anyScopes.some(scope => principal.scopes.includes(scope))) {
      return { kind: 'refused', code: 'scope_required', retryable: false }
    }
    const input = feedbackInputSchema.safeParse(data)
    if (!input.success) return { kind: 'refused', code: 'invalid_request', retryable: false }
    const { submitServerFeedback } = await import('@/lib/observability/posthog.server')
    const outcome = await submitServerFeedback({
      message: input.data.message, principalRef: principal.principalId, accountRef: principal.ownerId,
    })
    return outcome === 'accepted' ? { kind: 'accepted' }
      : { kind: 'refused', code: outcome === 'disabled' ? 'feedback_disabled' : 'feedback_unavailable', retryable: false }
  },
})
