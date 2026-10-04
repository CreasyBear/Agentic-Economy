import { z } from 'zod'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { PublishedTool } from '@/modules/capability-supply/public'
import { serviceUnitDefinitionSchema, serviceUnitDefinitionRef } from '@/modules/capability-contract/public'
import { decodeDeclaredServiceUnits, formatServiceQuantity } from './declared-service-units'

export const providerUnitDefinitions = {
  'blockrun_prompt_token:v1': { label: 'BlockRun input tokens', path: 'usage.prompt_tokens', profile: 'blockrun_chat:v1' },
  'blockrun_completion_token:v1': { label: 'BlockRun output tokens', path: 'usage.completion_tokens', profile: 'blockrun_chat:v1' },
  'blockrun_elevenlabs_character_credit:v1': { label: 'ElevenLabs reported character credits', path: 'data[0].credits', profile: 'blockrun_elevenlabs_speech:v1' },
} as const
export const providerUnitDefinitionSchema = z.union([z.enum(['blockrun_prompt_token:v1', 'blockrun_completion_token:v1', 'blockrun_elevenlabs_character_credit:v1']), z.string().regex(/^service-unit:[a-f0-9]{64}$/u)])
export const providerUnitSchema = z.strictObject({
  unitDefinitionRef: providerUnitDefinitionSchema, quantityExponent: z.number().int().min(0).max(12),
  definition: serviceUnitDefinitionSchema.exactOptional(),
  state: z.enum(['observed', 'estimated', 'unknown']), quantityUnits: z.string().regex(/^(?:0|[1-9]\d{0,51})$/u).nullable(),
  reason: z.enum(['provider_reported', 'usage_missing', 'usage_invalid']),
}).refine(row => (row.state === 'unknown' ? row.quantityUnits === null && row.reason !== 'provider_reported'
  : row.quantityUnits !== null && row.reason === 'provider_reported')
  && (row.definition === undefined ? !row.unitDefinitionRef.startsWith('service-unit:') && row.quantityExponent === 0
    : row.unitDefinitionRef === serviceUnitDefinitionRef(row.definition) && row.quantityExponent === row.definition.quantityExponent))
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u)
const model = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9/_.:-]{0,199}$/u)
export const providerUnitObservationSchema = z.strictObject({
  observationRef: z.string(), previousObservationRef: z.string().nullable(), previousAttemptObservationRef: z.string().nullable(), sequence: z.number().int().min(1).max(50),
  change: z.enum(['initial_attempt', 'support_correction']),
  callRef: z.string(), accountRef: z.string(), principalRef: z.string(), credentialRef: z.string(), applicationRef: z.string(), toolRef: z.string(), providerRef: z.string(),
  environment: z.enum(['sandbox', 'production']), attemptRef: z.string(), attemptNumber: z.number().int().positive().safe(), effectGeneration: z.number().int().positive().safe(),
  logicalRequestDigest: digest, operationKeyDigest: digest, bindingDigest: digest, responseEvidenceHash: digest, outputDigest: digest,
  profile: z.enum(['blockrun_chat:v1', 'blockrun_elevenlabs_speech:v1', 'declared_service_units:v1']), adapterId: z.enum(['http-json:v1', 'x402-fetch:v2', 'mcp-jsonrpc:v1']),
  requestedModel: model.nullable(), responseModel: model.nullable(), providerRequestIdDigest: digest.nullable(),
  units: z.array(providerUnitSchema).min(1).max(16), sourceDigest: digest,
  occurredAt: z.number().int().nonnegative().safe(), effectiveAt: z.number().int().nonnegative().safe(), observedAt: z.number().int().nonnegative().safe(),
  timeBasis: z.literal('call_updated'),
  source: z.literal('provider_reported_completed_call'), authoritativeForMoney: z.literal(false),
})
export type ProviderUnitObservation = z.infer<typeof providerUnitObservationSchema>
export const providerUnitEvidenceSchema = z.strictObject({
  source: z.literal('provider_reported_completed_call'), authoritativeForMoney: z.literal(false),
  current: providerUnitObservationSchema.nullable(), currentSupport: z.enum(['verified', 'unknown']),
  observations: z.array(providerUnitObservationSchema).max(50), evidenceDigest: digest,
  coverage: z.literal('successful_call_receipts_only'),
})
export type ProviderUnitEvidence = z.infer<typeof providerUnitEvidenceSchema>
export const providerUnitSummarySchema = z.strictObject({
  unitDefinitionRef: providerUnitDefinitionSchema, observedQuantityUnits: z.string().regex(/^(?:0|[1-9]\d*)$/u), quantityExponent: z.number().int().min(0).max(12),
  definition: serviceUnitDefinitionSchema.exactOptional(),
  observedReceiptCountUnits: z.string(), unknownReceiptCountUnits: z.string(), coverageBasis: z.literal('captured_profile_receipts_only'), aggregationBasis: z.enum(['current_selected_call_receipts', 'historical_latest_attempt_reports']), coverage: z.enum(['complete', 'incomplete']),
})
export type ProviderUnitSummary = z.infer<typeof providerUnitSummarySchema>

/** Exact, non-streaming provider contracts. Neither payload size nor timing is a unit.
 * Sources: blockrun.ai/docs/api-reference/{chat-completions,text-to-speech}.
 * Existing admitted HTTPS/x402 transports retain execution/payment ownership. */
export function providerUnitProfile(operation: PublishedTool) {
  const { endpoint, adapterId } = operation.identity
  if (['http-json:v1', 'x402-fetch:v2', 'mcp-jsonrpc:v1'].includes(adapterId)
    && operation.contract.serviceUnits !== undefined && operation.contract.serviceUnits.length > 0
    && operation.contract.serviceUnits.length <= 16 && operation.contract.serviceUnits.every(unit => serviceUnitDefinitionSchema.safeParse(unit).success)) return 'declared_service_units:v1' as const
  if ((adapterId !== 'http-json:v1' && adapterId !== 'x402-fetch:v2') || endpoint.method !== 'POST') return null
  const url = new URL(endpoint.url)
  if (url.origin !== 'https://blockrun.ai' || url.username || url.password || url.search || url.hash || operation.binding.endpointUrl !== endpoint.url) return null
  if (url.pathname === '/api/v1/chat/completions') return 'blockrun_chat:v1' as const
  if (url.pathname === '/api/v1/audio/speech') return 'blockrun_elevenlabs_speech:v1' as const
  return null
}
function count(value: unknown): string | null { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : null }
function safeModel(value: unknown): string | null {
  const parsed = model.safeParse(value)
  return parsed.success && !/^(?:sk[-_]|whsec_|Bearer|0x[a-f0-9]{40,})/iu.test(parsed.data) ? parsed.data : null
}
const speechModels = new Set(['elevenlabs/flash-v2.5', 'elevenlabs/turbo-v2.5', 'elevenlabs/multilingual-v2', 'elevenlabs/v3'])
export function decodeProviderUnits(profile: NonNullable<ReturnType<typeof providerUnitProfile>>, output: unknown, definitions: PublishedTool['contract']['serviceUnits'] = []) {
  const response = isRecord(output) ? output : {}, responseModel = safeModel(response.model)
  if (profile === 'declared_service_units:v1') return { responseModel: null, providerRequestIdDigest: null, units: decodeDeclaredServiceUnits(definitions, output) }
  const unit = (unitDefinitionRef: z.infer<typeof providerUnitDefinitionSchema>, quantityUnits: string | null, missing: boolean) => ({
    unitDefinitionRef, quantityExponent: 0 as const, state: quantityUnits === null ? 'unknown' as const : 'observed' as const,
    quantityUnits, reason: quantityUnits !== null ? 'provider_reported' as const : missing ? 'usage_missing' as const : 'usage_invalid' as const,
  })
  if (profile === 'blockrun_chat:v1') {
    const usage = isRecord(response.usage) ? response.usage : null
    const prompt = count(usage?.prompt_tokens), completion = count(usage?.completion_tokens), total = count(usage?.total_tokens)
    const valid = response.object === 'chat.completion' && responseModel !== null && prompt !== null && completion !== null && total !== null
      && BigInt(prompt) + BigInt(completion) === BigInt(total)
    const id = typeof response.id === 'string' && /^chatcmpl-[A-Za-z0-9_-]{1,180}$/u.test(response.id) ? canonicalDigest(response.id) : null
    return { responseModel, providerRequestIdDigest: id, units: [unit('blockrun_prompt_token:v1', valid ? prompt : null, usage === null), unit('blockrun_completion_token:v1', valid ? completion : null, usage === null)] }
  }
  const data = Array.isArray(response.data) && response.data.length === 1 && isRecord(response.data[0]) ? response.data[0] : null
  const credits = responseModel !== null && speechModels.has(responseModel) ? count(data?.credits) : null
  return { responseModel, providerRequestIdDigest: null, units: [unit('blockrun_elevenlabs_character_credit:v1', credits, data !== null && data.credits === undefined)] }
}
export type ProviderUnitCallSource = {
  callRef: string; ownerId: string; principalId: string; credentialId: string; applicationRef: string; toolRef: string; environment: 'sandbox' | 'production';
  requestDigest: string; inputJson?: string; state: string; result?: { kind: string; output?: StableHashValue; evidenceHash?: string }; evidenceHash?: string; attemptRef?: string;
}
export function providerUnitMaterial(call: ProviderUnitCallSource, operation: PublishedTool, attempt: { attemptRef: string; attemptNumber: number; effectGeneration: number; operationKeyDigest: string }) {
  const profile = providerUnitProfile(operation), result = call.result
  if (profile === null || call.state !== 'completed' || result?.kind !== 'completed' || result.output === undefined
    || call.attemptRef !== attempt.attemptRef || attempt.attemptRef !== `operation-attempt:${call.callRef}:${attempt.attemptNumber}`
    || !isCanonicalDigest(call.requestDigest) || !isCanonicalDigest(attempt.operationKeyDigest) || !isCanonicalDigest(operation.identity.bindingDigest)
    || !isCanonicalDigest(result.evidenceHash ?? '') || (call.evidenceHash !== undefined && call.evidenceHash !== result.evidenceHash)) return null
  let requestedModel: string | null = null
  if (call.inputJson !== undefined) { try { const input: unknown = JSON.parse(call.inputJson); if (isRecord(input)) requestedModel = safeModel(input.model) } catch { /* No payload is exposed. */ } }
  const material = {
    callRef: call.callRef, accountRef: call.ownerId, principalRef: call.principalId, credentialRef: call.credentialId, applicationRef: call.applicationRef,
    toolRef: call.toolRef, providerRef: operation.identity.businessId, environment: call.environment,
    attemptRef: attempt.attemptRef, attemptNumber: attempt.attemptNumber, effectGeneration: attempt.effectGeneration, operationKeyDigest: attempt.operationKeyDigest,
    logicalRequestDigest: call.requestDigest, bindingDigest: operation.identity.bindingDigest,
    responseEvidenceHash: result.evidenceHash as string, outputDigest: canonicalDigest(result.output), profile,
    adapterId: operation.identity.adapterId as ProviderUnitObservation['adapterId'], requestedModel: profile === 'declared_service_units:v1' ? null : requestedModel, ...decodeProviderUnits(profile, result.output, operation.contract.serviceUnits),
    source: 'provider_reported_completed_call' as const, authoritativeForMoney: false as const,
  }
  return { ...material, sourceDigest: canonicalDigest({ format: 'ae.provider-service-unit-source:v1', ...material }) }
}
export function observationRef(material: Pick<ProviderUnitObservation, 'sourceDigest' | 'previousObservationRef' | 'previousAttemptObservationRef' | 'sequence'>) {
  return `provider-service-unit:${canonicalDigest({ format: 'ae.provider-service-unit-observation:v1', ...material }).slice(7)}`
}
export function verifiedProviderObservation(call: ProviderUnitCallSource, operation: PublishedTool | undefined, observation: ProviderUnitObservation | undefined, headRef: string | undefined) {
  if (observation === undefined || operation === undefined || headRef !== observation.observationRef) return null
  const parsed = providerUnitObservationSchema.safeParse(observation)
  if (!parsed.success) return null
  const material = providerUnitMaterial(call, operation, observation)
  const { observationRef: ref, previousObservationRef, previousAttemptObservationRef, sequence, change, occurredAt, effectiveAt, observedAt, timeBasis: _timeBasis, ...stored } = observation
  if (ref !== observationRef({ sourceDigest: observation.sourceDigest, previousObservationRef, previousAttemptObservationRef, sequence })
    || material === null || canonicalDigest(material) !== canonicalDigest(stored) || occurredAt > effectiveAt || effectiveAt > observedAt
    || change !== (previousAttemptObservationRef === null ? 'initial_attempt' : 'support_correction')) return null
  return parsed.data
}
export function validProviderObservation(observation: ProviderUnitObservation) {
  const parsed = providerUnitObservationSchema.safeParse(observation)
  if (!parsed.success) return false
  const { observationRef: ref, previousObservationRef, previousAttemptObservationRef, sequence, change, occurredAt, effectiveAt, observedAt, timeBasis: _timeBasis, sourceDigest, ...material } = observation
  const expectedUnits = observation.profile === 'declared_service_units:v1' ? observation.units.map(unit => unit.definition === undefined ? '' : serviceUnitDefinitionRef(unit.definition))
    : observation.profile === 'blockrun_chat:v1' ? ['blockrun_prompt_token:v1', 'blockrun_completion_token:v1'] : ['blockrun_elevenlabs_character_credit:v1']
  return occurredAt <= effectiveAt && effectiveAt <= observedAt && sourceDigest === canonicalDigest({ format: 'ae.provider-service-unit-source:v1', ...material })
    && ref === observationRef({ sourceDigest, previousObservationRef, previousAttemptObservationRef, sequence })
    && change === (previousAttemptObservationRef === null ? 'initial_attempt' : 'support_correction')
    && observation.units.length === expectedUnits.length
    && new Set(expectedUnits).size === expectedUnits.length
    && observation.units.every((unit, index) => unit.unitDefinitionRef === expectedUnits[index] && unit.state !== 'estimated')
}
export function summarizeProviderUnits(rows: Array<{ observation?: ProviderUnitObservation | null; verified: boolean }>, aggregationBasis: ProviderUnitSummary['aggregationBasis'] = 'current_selected_call_receipts'): ProviderUnitSummary[] {
  const definitions = new Map(rows.flatMap(row => row.observation?.units ?? []).map(unit => [unit.unitDefinitionRef, unit]))
  return [...definitions.keys()].map(ref => {
    const unitDefinitionRef = providerUnitDefinitionSchema.parse(ref)
    const definition = definitions.get(ref)?.definition, quantityExponent = definitions.get(ref)?.quantityExponent ?? 0
    let total = 0n, observed = 0n, unknown = 0n
    for (const row of rows) {
      const unit = row.observation?.units.find(item => item.unitDefinitionRef === unitDefinitionRef)
      if (unit === undefined) continue
      if (row.verified && providerUnitSchema.safeParse(unit).success && unit.quantityExponent === quantityExponent && unit.state === 'observed' && unit.quantityUnits !== null) { total += BigInt(unit.quantityUnits); observed++ } else unknown++
    }
    return { unitDefinitionRef, observedQuantityUnits: total.toString(), quantityExponent, ...(definition === undefined ? {} : {definition}),
      observedReceiptCountUnits: observed.toString(), unknownReceiptCountUnits: unknown.toString(), coverageBasis: 'captured_profile_receipts_only' as const, aggregationBasis, coverage: unknown === 0n ? 'complete' as const : 'incomplete' as const }
  }).filter(row => row.observedReceiptCountUnits !== '0' || row.unknownReceiptCountUnits !== '0')
}
export function providerUnitLabel(unit: Pick<ProviderUnitSummary, 'unitDefinitionRef' | 'definition'>): string {
  return unit.definition?.label ?? providerUnitDefinitions[unit.unitDefinitionRef as keyof typeof providerUnitDefinitions]?.label ?? 'Unknown service unit'
}
export function providerUnitQuantity(units: string | null, exponent: number): string {
  return units === null ? 'Unknown' : formatServiceQuantity(units, exponent)
}
