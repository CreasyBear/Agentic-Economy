import {
  isBoundedJsonValue,
  openCapabilityDecisionModel,
  type CapabilityContract,
  type JsonValue,
} from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  providerInvocationEnvelopeIntegrityValid,
  providerOutcomeV2Digest,
  type ProviderExecutionLineageV2,
  type ProviderInvocationEnvelopeV2,
  type ProviderOutcomeV2,
  type ProviderResultEchoV2,
  type ProviderResultV2,
} from './provider-execution-v2'

export type ProviderIdentityV2 = Readonly<{
  businessId: string
  offeringId: string
  offeringRegistrationHash: string
  bindingId: string
  bindingRegistrationHash: string
}>

export type ProviderReconciliationReportV2 =
  | Readonly<{
      format: 'ae.provider-reconciliation-report:v2'
      providerEvidenceRef: string
      provider: ProviderIdentityV2
      disposition: 'pending'
      echo: ProviderResultEchoV2
    }>
  | Readonly<{
      format: 'ae.provider-reconciliation-report:v2'
      providerEvidenceRef: string
      provider: ProviderIdentityV2
      disposition: 'succeeded' | 'failed'
      result: ProviderResultV2
    }>

export type ProviderReconciliationEvidenceV2 = Readonly<{
  evidenceId: string
  purpose: 'completion' | 'recovery'
  outputPointer: string
  schemaIdentity: string
  value: JsonValue
  valueDigest: string
}>

export type ProviderReconciliationUnknownReasonV2 =
  | 'provider_pending'
  | 'evidence_invalid'
  | 'provider_identity_mismatch'
  | 'provider_echo_mismatch'
  | 'provider_output_invalid'
  | 'terminal_evidence_missing'

type ReconciliationTerminalV2 = Readonly<{
  providerResult: ProviderResultV2
  output: JsonValue
  outputDigest: string
  evidence: ProviderReconciliationEvidenceV2[]
}>

export type ProviderReconciliationObservationV2 = Readonly<{
  format: 'ae.provider-reconciliation-observation:v2'
  observationRef: string
  observationDigest: string
  state: 'unknown_external_state' | 'succeeded' | 'failed'
  reason?: ProviderReconciliationUnknownReasonV2
  originOutcomeRef: string
  originOutcomeDigest: string
  envelopeRef: string
  envelopeDigest: string
  providerEvidenceRef?: string
  providerEvidenceIdentityDigest?: string
  report: JsonValue
  reportDigest: string
  lineage: ProviderExecutionLineageV2
  lineageDigest: string
  terminal?: ReconciliationTerminalV2
  recovery: Readonly<{
    kind: 'reconcile_required' | 'terminal'
    automaticRetry: false
  }>
  observedAt: number
}>

export type ActionAttemptResolutionV2 = Readonly<{
  format: 'ae.action-attempt-resolution:v2'
  resolutionRef: string
  resolutionDigest: string
  state: 'unknown_external_state' | 'succeeded' | 'failed'
  actionAttemptRef: string
  actionAttemptDigest: string
  originOutcomeRef: string
  originOutcomeDigest: string
  latestObservationRef: string
  latestObservationDigest: string
  lineage: ProviderExecutionLineageV2
  lineageDigest: string
  terminal?: ReconciliationTerminalV2
  automaticRetry: false
  updatedAt: number
}>

export type ReconcileProviderOutcomeV2Result =
  | Readonly<{
      kind: 'observed'
      observation: ProviderReconciliationObservationV2
      resolution: ActionAttemptResolutionV2
    }>
  | Readonly<{ kind: 'refused'; reason: 'origin_not_unknown' | 'authority_invalid' | 'time_invalid' }>

export function reconciliationObservationV2Digest(observation: ProviderReconciliationObservationV2): string {
  const { observationDigest: _digest, ...material } = observation
  return canonicalDigest(material as StableHashValue)
}

export function actionAttemptResolutionV2Digest(resolution: ActionAttemptResolutionV2): string {
  const { resolutionDigest: _digest, ...material } = resolution
  return canonicalDigest(material as StableHashValue)
}

export function reconcileProviderOutcomeV2(input: Readonly<{
  unknownOutcome: ProviderOutcomeV2
  envelope: ProviderInvocationEnvelopeV2
  contract: CapabilityContract
  report: JsonValue
  observedAt: number
}>): ReconcileProviderOutcomeV2Result {
  if (!Number.isSafeInteger(input.observedAt) || input.observedAt < input.unknownOutcome.observedAt) {
    return { kind: 'refused', reason: 'time_invalid' }
  }
  if (input.unknownOutcome.state !== 'unknown_external_state') {
    return { kind: 'refused', reason: 'origin_not_unknown' }
  }
  if (!isBoundedJsonValue(input.report)
    || !providerInvocationEnvelopeIntegrityValid(input.envelope, input.contract)
    || providerOutcomeV2Digest(input.unknownOutcome) !== input.unknownOutcome.outcomeDigest
    || input.unknownOutcome.envelopeRef !== input.envelope.envelopeRef
    || input.unknownOutcome.envelopeDigest !== input.envelope.envelopeDigest
    || input.unknownOutcome.lineageDigest !== input.envelope.lineageDigest
    || canonicalDigest(input.unknownOutcome.lineage as StableHashValue) !== input.envelope.lineageDigest) {
    return { kind: 'refused', reason: 'authority_invalid' }
  }
  const reportDigest = canonicalDigest(input.report as StableHashValue)
  const parsed = parseReport(input.report)
  const model = openCapabilityDecisionModel(input.contract)
  const expectedProvider = providerIdentity(input.envelope)
  const expectedEcho = providerEcho(input.envelope)
  const providerEvidenceIdentityDigest = parsed === undefined ? undefined : canonicalDigest({
    provider: parsed.provider,
    providerEvidenceRef: parsed.providerEvidenceRef,
  } as StableHashValue)
  let state: ProviderReconciliationObservationV2['state'] = 'unknown_external_state'
  let reason: ProviderReconciliationUnknownReasonV2 | undefined
  let terminal: ReconciliationTerminalV2 | undefined
  if (parsed === undefined) reason = 'evidence_invalid'
  else if (!sameValue(parsed.provider, expectedProvider)) reason = 'provider_identity_mismatch'
  else if (parsed.disposition === 'pending') {
    reason = sameValue(parsed.echo, expectedEcho) ? 'provider_pending' : 'provider_echo_mismatch'
  } else if (!sameValue(parsed.result.echo, expectedEcho)) reason = 'provider_echo_mismatch'
  else {
    const validated = model.validateOutput(parsed.result.output)
    if (validated.kind !== 'valid') reason = 'provider_output_invalid'
    else {
      const purpose = parsed.disposition === 'succeeded' ? 'completion' as const : 'recovery' as const
      const requirements = model.evidence.filter((requirement) => requirement.purpose === purpose)
      const evidence = requirements.flatMap((requirement) => {
          const value = valueAtPointer(validated.value, requirement.outputPointer)
          return value === undefined ? [] : [{
            evidenceId: requirement.evidenceId, purpose, outputPointer: requirement.outputPointer,
            schemaIdentity: requirement.schemaIdentity, value, valueDigest: canonicalDigest(value as StableHashValue),
          }]
        })
      const requiredCount = requirements.length
      if (requiredCount === 0 || evidence.length !== requiredCount) reason = 'terminal_evidence_missing'
      else {
        state = parsed.disposition
        terminal = {
          providerResult: cloneProviderResult(parsed.result), output: structuredClone(validated.value),
          outputDigest: canonicalDigest(validated.value as StableHashValue), evidence,
        }
      }
    }
  }
  const observationRef = `provider-reconciliation-observation:v2:${canonicalDigest({
    originOutcomeRef: input.unknownOutcome.outcomeRef,
    originOutcomeDigest: input.unknownOutcome.outcomeDigest,
    reportDigest,
  } as StableHashValue)}`
  const observationMaterial: Omit<ProviderReconciliationObservationV2, 'observationDigest'> = {
    format: 'ae.provider-reconciliation-observation:v2', observationRef, state,
    ...(reason === undefined ? {} : { reason }),
    originOutcomeRef: input.unknownOutcome.outcomeRef,
    originOutcomeDigest: input.unknownOutcome.outcomeDigest,
    envelopeRef: input.envelope.envelopeRef, envelopeDigest: input.envelope.envelopeDigest,
    ...(parsed === undefined ? {} : { providerEvidenceRef: parsed.providerEvidenceRef }),
    ...(providerEvidenceIdentityDigest === undefined ? {} : { providerEvidenceIdentityDigest }),
    report: structuredClone(input.report), reportDigest,
    lineage: cloneLineage(input.envelope.lineage), lineageDigest: input.envelope.lineageDigest,
    ...(terminal === undefined ? {} : { terminal }),
    recovery: { kind: state === 'unknown_external_state' ? 'reconcile_required' : 'terminal', automaticRetry: false },
    observedAt: input.observedAt,
  }
  const observation = {
    ...observationMaterial,
    observationDigest: canonicalDigest(observationMaterial as StableHashValue),
  } as ProviderReconciliationObservationV2
  const resolutionRef = `action-attempt-resolution:v2:${input.envelope.lineage.actionAttemptDigest}`
  const resolutionMaterial: Omit<ActionAttemptResolutionV2, 'resolutionDigest'> = {
    format: 'ae.action-attempt-resolution:v2', resolutionRef, state,
    actionAttemptRef: input.envelope.lineage.actionAttemptRef,
    actionAttemptDigest: input.envelope.lineage.actionAttemptDigest,
    originOutcomeRef: input.unknownOutcome.outcomeRef,
    originOutcomeDigest: input.unknownOutcome.outcomeDigest,
    latestObservationRef: observation.observationRef,
    latestObservationDigest: observation.observationDigest,
    lineage: cloneLineage(input.envelope.lineage), lineageDigest: input.envelope.lineageDigest,
    ...(terminal === undefined ? {} : { terminal: cloneTerminal(terminal) }),
    automaticRetry: false, updatedAt: input.observedAt,
  }
  const resolution = {
    ...resolutionMaterial,
    resolutionDigest: canonicalDigest(resolutionMaterial as StableHashValue),
  } as ActionAttemptResolutionV2
  return deepFreeze({ kind: 'observed', observation, resolution }) as ReconcileProviderOutcomeV2Result
}

function parseReport(value: JsonValue): ProviderReconciliationReportV2 | undefined {
  if (!isRecord(value) || value.format !== 'ae.provider-reconciliation-report:v2'
    || typeof value.providerEvidenceRef !== 'string' || value.providerEvidenceRef.trim().length === 0
    || value.providerEvidenceRef.length > 500) return undefined
  const provider = parseProvider(value.provider)
  if (provider === undefined) return undefined
  if (value.disposition === 'pending' && exactKeys(value, [
    'format', 'providerEvidenceRef', 'provider', 'disposition', 'echo',
  ])) {
    const echo = parseEcho(value.echo)
    return echo === undefined ? undefined : {
      format: value.format, providerEvidenceRef: value.providerEvidenceRef, provider,
      disposition: 'pending', echo,
    }
  }
  if ((value.disposition === 'succeeded' || value.disposition === 'failed') && exactKeys(value, [
    'format', 'providerEvidenceRef', 'provider', 'disposition', 'result',
  ])) {
    const result = parseResult(value.result)
    return result === undefined ? undefined : {
      format: value.format, providerEvidenceRef: value.providerEvidenceRef, provider,
      disposition: value.disposition, result,
    }
  }
  return undefined
}

function parseProvider(value: unknown): ProviderIdentityV2 | undefined {
  const keys = [
    'businessId', 'offeringId', 'offeringRegistrationHash', 'bindingId', 'bindingRegistrationHash',
  ] as const
  if (!isRecord(value) || !exactKeys(value, keys)
    || keys.some((key) => typeof value[key] !== 'string')) return undefined
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as ProviderIdentityV2
}

function parseResult(value: unknown): ProviderResultV2 | undefined {
  if (!isRecord(value) || !exactKeys(value, ['format', 'echo', 'output'])
    || value.format !== 'ae.provider-result:v2' || !isBoundedJsonValue(value.output)) return undefined
  const echo = parseEcho(value.echo)
  return echo === undefined ? undefined : { format: value.format, echo, output: value.output }
}

function parseEcho(value: unknown): ProviderResultEchoV2 | undefined {
  const keys = [
    'envelopeRef', 'envelopeDigest', 'actionAttemptRef', 'actionAttemptDigest',
    'authorityLineageDigest', 'providerIdempotencyKey',
  ] as const
  if (!isRecord(value) || !exactKeys(value, keys)
    || keys.some((key) => typeof value[key] !== 'string')) return undefined
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as ProviderResultEchoV2
}

function providerIdentity(envelope: ProviderInvocationEnvelopeV2): ProviderIdentityV2 {
  return {
    businessId: envelope.lineage.businessId,
    offeringId: envelope.lineage.offeringId,
    offeringRegistrationHash: envelope.lineage.offeringRegistrationHash,
    bindingId: envelope.lineage.bindingId,
    bindingRegistrationHash: envelope.lineage.bindingRegistrationHash,
  }
}

function providerEcho(envelope: ProviderInvocationEnvelopeV2): ProviderResultEchoV2 {
  return {
    envelopeRef: envelope.envelopeRef, envelopeDigest: envelope.envelopeDigest,
    actionAttemptRef: envelope.lineage.actionAttemptRef,
    actionAttemptDigest: envelope.lineage.actionAttemptDigest,
    authorityLineageDigest: envelope.lineage.authorityLineageDigest,
    providerIdempotencyKey: envelope.providerIdempotencyKey,
  }
}

function valueAtPointer(value: JsonValue, pointer: string): JsonValue | undefined {
  let current: JsonValue | undefined = value
  for (const rawSegment of pointer.split('/').slice(1)) {
    const segment = rawSegment.replaceAll('~1', '/').replaceAll('~0', '~')
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(segment)) return undefined
      current = current[Number(segment)]
    } else if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment] as JsonValue
    } else return undefined
  }
  return current
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalDigest(left as StableHashValue) === canonicalDigest(right as StableHashValue)
}

function cloneProviderResult(result: ProviderResultV2): ProviderResultV2 {
  return { format: result.format, echo: { ...result.echo }, output: structuredClone(result.output) }
}

function cloneTerminal(terminal: ReconciliationTerminalV2): ReconciliationTerminalV2 {
  return {
    providerResult: cloneProviderResult(terminal.providerResult),
    output: structuredClone(terminal.output), outputDigest: terminal.outputDigest,
    evidence: terminal.evidence.map((item) => ({ ...item, value: structuredClone(item.value) })),
  }
}

function cloneLineage(lineage: ProviderExecutionLineageV2): ProviderExecutionLineageV2 {
  return { ...lineage, contractRef: { ...lineage.contractRef } }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value)) deepFreeze(nested)
  return value
}
