import type { JSONSchema } from '@tanstack/ai'

import { defaultTitle, DEFAULT_STATUS, type ProblemKind } from '@/lib/errors'
import type { JsonValue } from '@/modules/capability-contract/public'
import type { CallInput, CallMachineResult, CallReceipt, CallUsageSummary } from '@/modules/capability-execution/call-contracts'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { BASE_MAINNET_NETWORK, BASE_MAINNET_USDC_ADDRESS } from '@/modules/capability-supply/public'
import type { ExactAmount } from '@/modules/money/public'

// Offline shape examples only. References are synthetic, not returned Quotes,
// Calls, payment proofs or executable requests; no credential is included.
const buyerCharge: ExactAmount = { currency: 'AUD', units: '1000000', exponent: 6 }
const providerAmount: ExactAmount = { currency: 'USDC', units: '650000', exponent: 6 }
const request: CallInput = {
  quoteRef: `operation-commitment:v1:${'0'.repeat(64)}`,
  idempotencyKey: 'synthetic-call-0001',
}
const callRef = `operation-invocation:v1:${'1'.repeat(64)}`
const toolRef = `operation:v1:${'2'.repeat(64)}`
const usage: CallUsageSummary = {
  usageRef: 'synthetic-usage', observedAt: 0, chargeState: 'paid',
  amount: buyerCharge, priceDigest: 'synthetic-price',
}
const receipt: CallReceipt = {
  receiptRef: 'synthetic-receipt', state: 'settled', priceDigest: 'synthetic-price',
  evidenceHash: 'synthetic-evidence', issuedAt: '2026-10-07T00:00:00Z', commercialModel: 'account_aud',
  buyerCharge, serviceFee: { currency: 'AUD', units: '0', exponent: 6 }, totalBuyerCharge: buyerCharge,
  providerObligation: { amount: providerAmount, settlementMethod: 'managed_x402', payoutEligible: false },
  providerSettlement: { amount: providerAmount, network: BASE_MAINNET_NETWORK, asset: BASE_MAINNET_USDC_ADDRESS },
}
const output: JsonValue = { synthetic: true, values: [null, false, 1, 'example', { nested: [] }] }
const completedFields = { callRef, toolRef, evidenceHash: 'synthetic-evidence', usage, receipt }
const responses: Readonly<Record<string, CallMachineResult>> = {
  completed: { kind: 'completed', ...completedFields, output },
  contentExpired: { kind: 'completed', ...completedFields, contentExpiredAt: 0 },
  pending: { kind: 'pending', callRef, toolRef, retryAfterMs: 1000, next: [{ action: 'call.status', args: { callRef }, authority: 'same_principal', retryAfterMs: 1000 }] },
  outcomeUnknown: {
    kind: 'outcome_unknown', callRef, toolRef,
    next: [{ action: 'call.status', args: { callRef }, authority: 'same_principal' }],
    evidence: { attemptRef: 'synthetic-attempt', effectGeneration: 1, requiredAt: '2026-10-07T00:00:00Z', retry: 'reconcile_before_retry', evidenceSource: 'synthetic' },
  },
  refused: {
    kind: 'refused', callRef, toolRef, code: 'authority_required', retryable: false,
    detail: 'Ask the Account owner to approve this Call at /agent-access.',
    ownerHandoff: { actor: 'account_owner', reason: 'authority_required', destination: '/agent-access', callRef, toolRef },
    next: [{ action: 'call.status', args: { callRef }, authority: 'same_principal' }],
  },
}
function problemExample(kind: ProblemKind) {
  return {
    type: 'about:blank', title: defaultTitle(kind), status: DEFAULT_STATUS[kind], kind,
    code: 'SYNTHETIC_EXAMPLE', detail: 'Offline synthetic shape example; no request was made.',
  }
}
function namedExample(name: string, value: unknown) {
  return {
    summary: `Synthetic ${name}`,
    description: 'Offline, non-executable shape example. Obtain current caller-bound references from Aecon; these references and amounts are fictional.',
    value,
  }
}
type MediaExampleTarget = { examples?: Record<string, unknown> }
type CallExampleTarget = {
  requestBody: { content: Record<string, MediaExampleTarget> }
  responses: Record<string, { content: Record<string, MediaExampleTarget> }>
}

/** Add example annotations to the existing public projection, without replacing
 * any action-derived fields, requiredness, constraints, unions or references. */
export function annotateCallOpenApiExamples(
  paths: Record<string, Record<string, unknown>>,
  schemas: Map<string, JSONSchema>,
): void {
  const operation = paths[CALL_ROUTE_CONTRACT.call.path]?.[CALL_ROUTE_CONTRACT.call.method.toLowerCase()] as CallExampleTarget | undefined
  if (operation === undefined) throw new Error('openapi_call_examples_operation_missing')
  const schemaExamples: Readonly<Record<string, unknown[]>> = {
    Problem: [problemExample('INVALID_ARGUMENT')],
    ToolCallRequest: [request], ToolCallResponse: Object.values(responses),
    ToolCallResponseCallReceipt: [receipt], ToolCallResponseCallUsage: [usage],
    ToolCallResponseExactAmount: [buyerCharge], ToolCallResponseSchema0: [output],
  }
  for (const [name, examples] of Object.entries(schemaExamples)) {
    const schema = schemas.get(name)
    if (schema === undefined) throw new Error(`openapi_call_examples_schema_missing:${name}`)
    schemas.set(name, { ...schema, examples })
  }
  const requestMedia = operation.requestBody.content[CALL_ROUTE_CONTRACT.media.request]
  const responseMedia = operation.responses['200']?.content[CALL_ROUTE_CONTRACT.media.response]
  if (requestMedia === undefined || responseMedia === undefined) throw new Error('openapi_call_examples_media_missing')
  requestMedia.examples = { synthetic: namedExample('request', request) }
  responseMedia.examples = Object.fromEntries(Object.entries(responses).map(([name, value]) => [name, namedExample(name, value)]))
  const errorKinds: readonly ProblemKind[] = ['INVALID_ARGUMENT', 'UNAUTHENTICATED', 'PERMISSION_DENIED', 'ALREADY_EXISTS', 'PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE', 'RESOURCE_EXHAUSTED', 'INTERNAL', 'UNAVAILABLE']
  for (const kind of errorKinds) {
    const status = DEFAULT_STATUS[kind]
    const media = operation.responses[String(status)]?.content[CALL_ROUTE_CONTRACT.media.problem]
    if (media === undefined) throw new Error(`openapi_call_examples_problem_missing:${status}`)
    media.examples = { synthetic: namedExample(`HTTP ${status}`, problemExample(kind)) }
  }
}
