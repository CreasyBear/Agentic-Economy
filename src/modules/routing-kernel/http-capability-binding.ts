import { z } from 'zod'

import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import type { CapabilityBinding, CapabilityBindingAdapter } from './application'

const MAX_RESPONSE_BYTES = 64 * 1024
const money = z.object({ currency: z.string().regex(/^[A-Z]{3}$/), amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict()
const quoteResponse = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('quoted'), expectedCost: money, maximumCost: money, expectedLatencyMs: z.number().int().nonnegative(), dataFields: z.array(z.string().min(1).max(200)).max(128), disclosures: z.array(z.string().min(1).max(200)).max(64), providerQuoteRef: z.string().min(1).max(500).optional(), providerQuoteExpiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional() }).strict(),
  z.object({ kind: z.literal('refused'), reason: z.string().min(1).max(500) }).strict(),
])
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

  async function call(operation: 'quote' | 'execute' | 'reconcile' | 'cancel', body: Record<string, unknown>, idempotencyKey?: string): Promise<unknown | undefined> {
    if (!await dependencies.validateTarget(endpoint)) return operation === 'quote' ? { kind: 'refused', reason: 'endpoint_not_public' } : undefined
    const credential = await dependencies.resolveCredential(registration.credentialRef)
    if (credential === undefined || credential.length === 0) return operation === 'quote' ? { kind: 'refused', reason: 'credential_unavailable' } : undefined
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
    } catch { return undefined }
    finally {
      try {
        await dependencies.observeProviderWait?.({
          bindingId: registration.binding.bindingId,
          operation,
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
