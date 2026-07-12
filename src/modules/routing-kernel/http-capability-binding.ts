import { z } from 'zod'

import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import type { CapabilityBinding, CapabilityBindingAdapter } from './application'

const MAX_RESPONSE_BYTES = 64 * 1024
const money = z.object({ currency: z.string().regex(/^[A-Z]{3}$/), amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict()
const structuredOfferOutput = z.object({
  field: z.string().min(1).max(200), valueType: z.enum(['string', 'integer', 'boolean', 'url', 'money_minor']),
  value: z.union([z.string().max(8_000), z.number().finite(), z.boolean()]),
}).strict()
const quoteResponse = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('quoted'), expectedCost: money, maximumCost: money, expectedLatencyMs: z.number().int().nonnegative(), dataFields: z.array(z.string().min(1).max(200)).max(128), disclosures: z.array(z.string().min(1).max(200)).max(64), providerQuoteRef: z.string().min(1).max(500).optional(), providerQuoteExpiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional() }).strict(),
  z.object({ kind: z.literal('refused'), reason: z.string().min(1).max(500) }).strict(),
])
const structuredQuoteResponse = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('quoted'), issuerBindingId: z.string().min(1).max(200), issuerNodeId: z.string().min(1).max(200),
    capabilityContractId: z.string().min(1).max(200), capabilityContractVersion: z.string().min(1).max(100),
    registrationHash: z.string().min(1).max(500),
    environment: z.string().min(1).max(100), expectedCost: money, maximumCost: money,
    expectedLatencyMs: z.number().int().nonnegative(), dataFields: z.array(z.string().min(1).max(200)).max(128),
    disclosures: z.array(z.string().min(1).max(200)).max(64), providerQuoteRef: z.string().min(1).max(500),
    providerQuoteExpiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    offerOutputs: z.array(structuredOfferOutput).max(128),
    priceComponents: z.array(z.object({ label: z.string().min(1).max(200), amountMinor: z.number().int().nonnegative() }).strict()).max(64),
    materialTerms: z.array(z.object({ key: z.string().min(1).max(200), label: z.string().min(1).max(200), value: z.string().min(1).max(2_000) }).strict()).min(1).max(64),
    cancellation: z.object({ kind: z.enum(['supported', 'conditional', 'unsupported']), summary: z.string().min(1).max(2_000) }).strict(),
  }).strict(),
  z.object({ kind: z.literal('refused'), reason: z.string().min(1).max(500) }).strict(),
])
const structuredQuoteInput = z.object({
  quoteAttemptId: z.string().min(1).max(200), allocationId: z.string().min(1).max(200),
  recipient: z.object({ bindingId: z.string().min(1).max(200), nodeId: z.string().min(1).max(200) }).strict(),
  capabilityContractId: z.string().min(1).max(200), capabilityContractVersion: z.string().min(1).max(100),
  registrationHash: z.string().min(1).max(500),
  environment: z.string().min(1).max(100),
  data: z.record(z.string().min(1).max(200), z.union([z.string().max(8_000), z.number().finite(), z.boolean()])),
}).strict()
const executionResponse = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('effect_committed'), providerReference: z.string().min(1).max(500), outcome: z.record(z.string().min(1).max(200), z.string().max(8_000)), reportedCost: money.optional() }).strict(),
  z.object({ kind: z.literal('effect_not_committed'), reason: z.string().min(1).max(500), providerReference: z.string().min(1).max(500).optional() }).strict(),
  z.object({ kind: z.literal('outcome_unknown'), providerReference: z.string().min(1).max(500).optional() }).strict(),
])
const reconciliationResponse = z.union([
  executionResponse,
  z.object({ kind: z.literal('reconciliation_pending') }).strict(),
])
const cancellationResponse = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cancellation_accepted'), providerReference: z.string().min(1).max(500).optional() }).strict(),
  z.object({ kind: z.literal('cancellation_rejected'), reason: z.string().min(1).max(500), providerReference: z.string().min(1).max(500).optional() }).strict(),
  z.object({ kind: z.literal('cancellation_unknown'), providerReference: z.string().min(1).max(500).optional() }).strict(),
])

export type HttpCapabilityRegistration = Readonly<{
  binding: CapabilityBinding
  endpointUrl: string
  credentialRef: string
}>

export type HttpCapabilityBindingDependencies = Readonly<{
  validateTarget: (url: URL) => Promise<boolean>
  resolveCredential: (credentialRef: string) => Promise<string | undefined>
  send: (request: Request) => Promise<Response>
  now?: () => number
  observeProviderWait?: (measurement: Readonly<{
    bindingId: string
    operation: 'quote' | 'execute' | 'reconcile' | 'cancel'
    providerWaitMs: number
    outcome: 'returned' | 'indeterminate'
  }>) => Promise<void>
}>

export function createHttpCapabilityBinding(registration: HttpCapabilityRegistration, dependencies: HttpCapabilityBindingDependencies): CapabilityBindingAdapter {
  const endpoint = new URL(registration.endpointUrl)
  if (endpoint.protocol !== 'https:') throw new Error('https_required')
  if (endpoint.username !== '' || endpoint.password !== '' || endpoint.hash !== '') throw new Error('endpoint_url_invalid')

  async function call(operation: 'quote' | 'structured_quote' | 'structured_quote_reconcile' | 'execute' | 'reconcile' | 'cancel', body: Record<string, unknown>, idempotencyKey?: string): Promise<unknown | undefined> {
    const quoteOperation = operation === 'quote' || operation === 'structured_quote'
    if (!await dependencies.validateTarget(endpoint)) return quoteOperation ? { kind: 'refused', reason: 'endpoint_not_public' } : undefined
    const credential = await dependencies.resolveCredential(registration.credentialRef)
    if (credential === undefined || credential.length === 0) return quoteOperation ? { kind: 'refused', reason: 'credential_unavailable' } : undefined
    let response: Response
    const startedAt = (dependencies.now ?? Date.now)()
    let transportOutcome: 'returned' | 'indeterminate' = 'indeterminate'
    try {
      response = await dependencies.send(new Request(endpoint, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${credential}`, ...(idempotencyKey === undefined ? {} : { 'Idempotency-Key': idempotencyKey }) },
        body: JSON.stringify({ protocolVersion: 'ae-capability:v1', operation, bindingId: registration.binding.bindingId, ...body }),
      }))
      transportOutcome = 'returned'
    } catch (error) {
      if (operation !== 'structured_quote' && operation !== 'structured_quote_reconcile') return undefined
      return {
        kind: 'transport_uncertain',
        reason: error instanceof DOMException && error.name === 'TimeoutError'
          ? 'provider_quote_timeout'
          : 'provider_quote_unknown',
      }
    }
    finally {
      try {
        await dependencies.observeProviderWait?.({
          bindingId: registration.binding.bindingId,
          operation: operation === 'structured_quote' || operation === 'structured_quote_reconcile' ? 'quote' : operation,
          providerWaitMs: Math.max(0, (dependencies.now ?? Date.now)() - startedAt),
          outcome: transportOutcome,
        })
      } catch { /* operational telemetry cannot change provider outcome semantics */ }
    }
    if (response.status >= 300 && response.status < 400) return undefined
    if (!(response.headers.get('Content-Type') ?? '').toLowerCase().includes('application/json')) return undefined
    const bounded = await readBoundedRequestText(response, MAX_RESPONSE_BYTES)
    if (!bounded.ok) return undefined
    try { return JSON.parse(bounded.text) } catch { return undefined }
  }

  return Object.freeze({
    binding: Object.freeze({ ...registration.binding, queryTerms: Object.freeze([...registration.binding.queryTerms]) }),
    quote: async ({ query }) => {
      const parsed = quoteResponse.safeParse(await call('quote', { query, capabilityContractId: registration.binding.capabilityContractId }))
      if (!parsed.success) return { kind: 'refused', reason: 'provider_quote_invalid' }
      if (parsed.data.kind === 'quoted' && ((parsed.data.providerQuoteRef === undefined) !== (parsed.data.providerQuoteExpiresAt === undefined))) {
        return { kind: 'refused', reason: 'provider_quote_invalid' }
      }
      if (parsed.data.kind === 'refused') return parsed.data
      const { providerQuoteRef, providerQuoteExpiresAt, ...quote } = parsed.data
      return {
        ...quote,
        ...(providerQuoteRef === undefined ? {} : { providerQuoteRef }),
        ...(providerQuoteExpiresAt === undefined ? {} : { providerQuoteExpiresAt }),
      }
    },
    quoteStructured: async (candidate) => {
      const input = structuredQuoteInput.safeParse(candidate)
      if (!input.success || Object.keys(input.data.data).length > 128) {
        return { kind: 'refused', reason: 'structured_quote_input_invalid' }
      }
      const binding = registration.binding
      if (binding.registrationHash === undefined || binding.environment === undefined
        || input.data.recipient.bindingId !== binding.bindingId || input.data.recipient.nodeId !== binding.nodeId
        || input.data.capabilityContractId !== binding.capabilityContractId
        || input.data.registrationHash !== binding.registrationHash || input.data.environment !== binding.environment) {
        return { kind: 'refused', reason: 'structured_quote_recipient_mismatch' }
      }
      const idempotencyKey = `quote-attempt:${input.data.quoteAttemptId}:allocation:${input.data.allocationId}`
      const response = await call('structured_quote', {
        quoteAttemptId: input.data.quoteAttemptId, allocationId: input.data.allocationId,
        recipient: input.data.recipient, capabilityContractId: input.data.capabilityContractId,
        capabilityContractVersion: input.data.capabilityContractVersion,
        registrationHash: input.data.registrationHash, environment: input.data.environment, data: input.data.data,
      }, idempotencyKey)
      if (isTransportUncertain(response)) return { kind: 'uncertain', reason: response.reason }
      const parsed = structuredQuoteResponse.safeParse(response)
      if (!parsed.success) return { kind: 'refused', reason: 'provider_quote_invalid' }
      if (parsed.data.kind === 'refused') return parsed.data
      if (parsed.data.issuerBindingId !== binding.bindingId || parsed.data.issuerNodeId !== binding.nodeId
        || parsed.data.capabilityContractId !== binding.capabilityContractId
        || parsed.data.capabilityContractVersion !== input.data.capabilityContractVersion
        || parsed.data.registrationHash !== binding.registrationHash || parsed.data.environment !== binding.environment) {
        return { kind: 'refused', reason: 'provider_quote_issuer_mismatch' }
      }
      return parsed.data
    },
    reconcileStructuredQuote: async (candidate) => {
      const { data: _data, ...withoutData } = candidate as typeof candidate & { data?: never }
      const input = structuredQuoteInput.omit({ data: true }).safeParse(withoutData)
      if (!input.success) return { kind: 'refused', reason: 'structured_quote_reconcile_input_invalid' }
      const binding = registration.binding
      if (binding.registrationHash === undefined || binding.environment === undefined
        || input.data.recipient.bindingId !== binding.bindingId || input.data.recipient.nodeId !== binding.nodeId
        || input.data.capabilityContractId !== binding.capabilityContractId
        || input.data.registrationHash !== binding.registrationHash || input.data.environment !== binding.environment) {
        return { kind: 'refused', reason: 'structured_quote_recipient_mismatch' }
      }
      const idempotencyKey = `quote-attempt:${input.data.quoteAttemptId}:allocation:${input.data.allocationId}`
      const response = await call('structured_quote_reconcile', input.data, idempotencyKey)
      if (isTransportUncertain(response)) return { kind: 'uncertain', reason: response.reason }
      const parsed = structuredQuoteResponse.safeParse(response)
      if (!parsed.success) return { kind: 'refused', reason: 'provider_quote_invalid' }
      if (parsed.data.kind === 'refused') return parsed.data
      if (parsed.data.issuerBindingId !== binding.bindingId || parsed.data.issuerNodeId !== binding.nodeId
        || parsed.data.capabilityContractId !== binding.capabilityContractId
        || parsed.data.capabilityContractVersion !== input.data.capabilityContractVersion
        || parsed.data.registrationHash !== binding.registrationHash || parsed.data.environment !== binding.environment) {
        return { kind: 'refused', reason: 'provider_quote_issuer_mismatch' }
      }
      return parsed.data
    },
    execute: async (input) => {
      const parsed = executionResponse.safeParse(await call('execute', {
        rootRunId: input.rootRunId, leafRunId: input.leafRunId, stepGrantId: input.stepGrantId,
        capabilityContractId: registration.binding.capabilityContractId,
        ...(input.providerQuoteRef === undefined ? {} : { providerQuoteRef: input.providerQuoteRef }), data: input.data,
      }, input.idempotencyKey))
      if (!parsed.success) return { kind: 'outcome_unknown' }
      const result = parsed.data
      if (result.kind === 'effect_committed') return {
        kind: result.kind, dataReleaseDisposition: 'released' as const, providerReference: result.providerReference, outcome: result.outcome,
        ...(result.reportedCost === undefined ? {} : { reportedCost: result.reportedCost }),
      }
      if (result.kind === 'effect_not_committed') return { kind: result.kind, dataReleaseDisposition: 'released' as const, reason: result.reason, ...(result.providerReference === undefined ? {} : { providerReference: result.providerReference }) }
      return { kind: result.kind, dataReleaseDisposition: 'released' as const, ...(result.providerReference === undefined ? {} : { providerReference: result.providerReference }) }
    },
    reconcile: async (input) => {
      const parsed = reconciliationResponse.safeParse(await call('reconcile', {
        rootRunId: input.rootRunId, leafRunId: input.leafRunId, stepGrantId: input.stepGrantId,
        capabilityContractId: registration.binding.capabilityContractId,
        ...(input.providerQuoteRef === undefined ? {} : { providerQuoteRef: input.providerQuoteRef }),
      }, input.idempotencyKey))
      if (!parsed.success) return { kind: 'reconciliation_pending' }
      const result = parsed.data
      if (result.kind === 'reconciliation_pending') return result
      if (result.kind === 'effect_committed') return {
        kind: result.kind, providerReference: result.providerReference, outcome: result.outcome,
        ...(result.reportedCost === undefined ? {} : { reportedCost: result.reportedCost }),
      }
      if (result.kind === 'effect_not_committed') return { kind: result.kind, reason: result.reason, ...(result.providerReference === undefined ? {} : { providerReference: result.providerReference }) }
      return { kind: result.kind, ...(result.providerReference === undefined ? {} : { providerReference: result.providerReference }) }
    },
    ...(registration.binding.adapterFeatures?.requestCancellation !== 'supported' ? {} : {
      requestCancellation: async (input) => {
        const parsed = cancellationResponse.safeParse(await call('cancel', {
          rootRunId: input.rootRunId, leafRunId: input.leafRunId, stepGrantId: input.stepGrantId,
          bindingId: registration.binding.bindingId,
          capabilityContractId: registration.binding.capabilityContractId,
        }, input.idempotencyKey))
        if (!parsed.success) return { kind: 'cancellation_unknown' as const }
        const result = parsed.data
        if (result.kind === 'cancellation_rejected') return {
          kind: result.kind, reason: result.reason,
          ...(result.providerReference === undefined ? {} : { providerReference: result.providerReference }),
        }
        return { kind: result.kind, ...(result.providerReference === undefined ? {} : { providerReference: result.providerReference }) }
      },
    }),
  } satisfies CapabilityBindingAdapter)
}

function isTransportUncertain(value: unknown): value is Readonly<{
  kind: 'transport_uncertain'
  reason: 'provider_quote_timeout' | 'provider_quote_unknown'
}> {
  if (typeof value !== 'object' || value === null) return false
  const kind = Reflect.get(value, 'kind')
  const reason = Reflect.get(value, 'reason')
  return kind === 'transport_uncertain' && (reason === 'provider_quote_timeout' || reason === 'provider_quote_unknown')
}
