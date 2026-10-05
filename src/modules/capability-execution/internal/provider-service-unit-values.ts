import { v } from 'convex/values'
export const providerUnitDefinitionValue = v.union(v.literal('blockrun_prompt_token:v1'), v.literal('blockrun_completion_token:v1'), v.literal('blockrun_elevenlabs_character_credit:v1'), v.string())
export const declaredUnitDefinitionValue = v.object({ unitId: v.string(), version: v.number(), label: v.string(),
  dimension: v.union(v.literal('request'), v.literal('token'), v.literal('character'), v.literal('second'), v.literal('byte'), v.literal('item')),
  quantityExponent: v.number(), outputPointer: v.string(), encoding: v.union(v.literal('integer_number'), v.literal('integer_string'), v.literal('decimal_string')),
  relationship: v.union(v.literal('independent'), v.literal('subset')), parentUnitId: v.optional(v.string()) })
export const providerUnitValue = v.object({ unitDefinitionRef: providerUnitDefinitionValue, quantityExponent: v.number(), definition: v.optional(declaredUnitDefinitionValue),
  state: v.union(v.literal('observed'), v.literal('estimated'), v.literal('unknown')), quantityUnits: v.union(v.string(), v.null()),
  reason: v.union(v.literal('provider_reported'), v.literal('usage_missing'), v.literal('usage_invalid')) })
export const providerUnitObservationValue = v.object({
  observationRef: v.string(), previousObservationRef: v.union(v.string(), v.null()), previousAttemptObservationRef: v.union(v.string(), v.null()), sequence: v.number(),
  change: v.union(v.literal('initial_attempt'), v.literal('support_correction')),
  callRef: v.string(), accountRef: v.string(), principalRef: v.string(), credentialRef: v.string(), applicationRef: v.string(), toolRef: v.string(), providerRef: v.string(),
  environment: v.union(v.literal('sandbox'), v.literal('production')), attemptRef: v.string(), attemptNumber: v.number(), effectGeneration: v.number(),
  logicalRequestDigest: v.string(), operationKeyDigest: v.string(), bindingDigest: v.string(), responseEvidenceHash: v.string(), outputDigest: v.string(),
  profile: v.union(v.literal('blockrun_chat:v1'), v.literal('blockrun_elevenlabs_speech:v1'), v.literal('declared_service_units:v1')), adapterId: v.union(v.literal('http-json:v1'), v.literal('x402-fetch:v2'), v.literal('mcp-jsonrpc:v1')),
  requestedModel: v.union(v.string(), v.null()), responseModel: v.union(v.string(), v.null()), providerRequestIdDigest: v.union(v.string(), v.null()),
  units: v.array(providerUnitValue), sourceDigest: v.string(), occurredAt: v.number(), effectiveAt: v.number(), observedAt: v.number(),
  timeBasis: v.literal('call_updated'),
  source: v.literal('provider_reported_completed_call'), authoritativeForMoney: v.literal(false),
})
export const providerUnitEvidenceValue = v.object({ source: v.literal('provider_reported_completed_call'), authoritativeForMoney: v.literal(false),
  current: v.union(providerUnitObservationValue, v.null()), currentSupport: v.union(v.literal('verified'), v.literal('unknown')),
  observations: v.array(providerUnitObservationValue), evidenceDigest: v.string(), coverage: v.literal('successful_call_receipts_only') })
export const providerUnitSummaryValue = v.object({ unitDefinitionRef: providerUnitDefinitionValue, observedQuantityUnits: v.string(), quantityExponent: v.number(), definition: v.optional(declaredUnitDefinitionValue),
  observedReceiptCountUnits: v.string(), unknownReceiptCountUnits: v.string(), coverageBasis: v.literal('captured_profile_receipts_only'), aggregationBasis: v.union(v.literal('current_selected_call_receipts'), v.literal('historical_latest_attempt_reports')), coverage: v.union(v.literal('complete'), v.literal('incomplete')) })
