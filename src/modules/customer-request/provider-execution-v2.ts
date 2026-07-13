import {
  isBoundedJsonValue,
  openCapabilityDecisionModel,
  sameCapabilityContractRef,
  type CapabilityContract,
  type JsonValue,
} from '@/modules/capability-contract/public'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  actionAttemptV2Digest,
  type ActionAttemptV2,
  type ActionDisclosureGrantV2,
  type ProviderReleaseGrantV2,
} from './action-attempt-v2'
import { approvalGrantV2Digest } from './approval-grant-v2'

export type ProviderExecutionLineageV2 = Readonly<{
  requestId: string
  requestRevision: number
  principalId: string
  delegatedAgentId: string
  planRevisionId: string
  planDigest: string
  actionId: string
  preparedActionRef: string
  preparedActionDigest: string
  approvalGrantRef: string
  approvalGrantDigest: string
  actionAttemptRef: string
  actionAttemptDigest: string
  authorityLineageDigest: string
  contractRef: ActionAttemptV2['lineage']['contractRef']
  selectionKey: string
  semanticDigest: string
  businessId: string
  offeringId: string
  offeringRegistrationHash: string
  bindingId: string
  bindingRegistrationHash: string
}>

export type ProviderInvocationEnvelopeV2 = Readonly<{
  format: 'ae.provider-invocation-envelope:v2'
  envelopeRef: string
  envelopeDigest: string
  state: 'ready_for_provider'
  providerIdempotencyKey: string
  lineage: ProviderExecutionLineageV2
  lineageDigest: string
  providerReleaseGrantRef: string
  providerReleaseGrantDigest: string
  disclosureGrantRef: string
  disclosureGrantDigest: string
  input: Readonly<{ schemaIdentity: string; value: JsonValue; valueDigest: string }>
  output: Readonly<{ schemaIdentity: string }>
  spend: Readonly<{ currency: string; maximumAmountMinor: number }>
  dataScope: ActionDisclosureGrantV2['scope']
  dataScopeDigest: string
  effectScope: ActionAttemptV2['authority']['effectScope']
  evidenceScope: ActionAttemptV2['authority']['evidenceScope']
  authorityScopeDigest: string
  recovery: ActionAttemptV2['authority']['recovery']
  releasedAt: number
  expiresAt: number
}>

export type ActionAttemptReleaseV2 = Readonly<{
  format: 'ae.action-attempt-release:v2'
  releaseRef: string
  releaseDigest: string
  state: 'released'
  actionAttemptRef: string
  actionAttemptDigest: string
  providerReleaseGrantRef: string
  providerReleaseGrantDigest: string
  disclosureGrantRef: string
  disclosureGrantDigest: string
  envelopeRef: string
  envelopeDigest: string
  authorityLineageDigest: string
  providerIdempotencyKey: string
  releasedAt: number
}>

export type ReleaseProviderInvocationV2Result =
  | Readonly<{
      kind: 'released'
      release: ActionAttemptReleaseV2
      envelope: ProviderInvocationEnvelopeV2
    }>
  | Readonly<{ kind: 'refused'; reason: 'authority_invalid' | 'authority_expired' | 'input_invalid' }>

export type ProviderResultEchoV2 = Readonly<{
  envelopeRef: string
  envelopeDigest: string
  actionAttemptRef: string
  actionAttemptDigest: string
  authorityLineageDigest: string
  providerIdempotencyKey: string
}>

export type ProviderResultV2 = Readonly<{
  format: 'ae.provider-result:v2'
  echo: ProviderResultEchoV2
  output: JsonValue
}>

type ProviderOutcomeBaseV2 = Readonly<{
  format: 'ae.provider-outcome:v2'
  outcomeRef: string
  outcomeDigest: string
  envelopeRef: string
  envelopeDigest: string
  responseDigest: string
  lineage: ProviderExecutionLineageV2
  lineageDigest: string
  observedAt: number
}>

export type ProviderOutcomeV2 =
  | (ProviderOutcomeBaseV2 & Readonly<{
      state: 'succeeded'
      output: JsonValue
      outputDigest: string
      recovery: Readonly<{ unknownOutcome: 'reconcile_only'; automaticRetry: false }>
    }>)
  | (ProviderOutcomeBaseV2 & Readonly<{
      state: 'unknown_external_state'
      reason: 'provider_response_invalid' | 'provider_echo_mismatch' | 'provider_output_invalid'
      recovery: Readonly<{ kind: 'reconcile_required'; automaticRetry: false }>
    }>)

export type ProviderRootRunV2 = Readonly<{
  format: 'ae.provider-root-run:v2'
  rootRunRef: string
  rootRunDigest: string
  state: ProviderOutcomeV2['state']
  outcomeRef: string
  outcomeDigest: string
  envelopeRef: string
  envelopeDigest: string
  lineage: ProviderExecutionLineageV2
  lineageDigest: string
  recordedAt: number
}>

export type ProviderLeafRunV2 = Readonly<{
  format: 'ae.provider-leaf-run:v2'
  leafRunRef: string
  leafRunDigest: string
  state: ProviderOutcomeV2['state']
  outcomeRef: string
  outcomeDigest: string
  envelopeRef: string
  envelopeDigest: string
  businessId: string
  offeringId: string
  bindingId: string
  lineage: ProviderExecutionLineageV2
  lineageDigest: string
  recordedAt: number
}>

export type ProviderProtocolEvidenceV2 = Readonly<{
  format: 'ae.provider-protocol-evidence:v2'
  protocolEvidenceRef: string
  protocolEvidenceDigest: string
  disposition: 'validated_result' | 'unknown_external_state'
  outcomeRef: string
  outcomeDigest: string
  envelopeRef: string
  envelopeDigest: string
  responseDigest: string
  providerResult?: ProviderResultV2
  observedEcho?: ProviderResultEchoV2
  outputDigest?: string
  lineage: ProviderExecutionLineageV2
  lineageDigest: string
  recordedAt: number
}>

export type ProviderOutcomeEvidenceBundleV2 = Readonly<{
  outcome: ProviderOutcomeV2
  rootRun: ProviderRootRunV2
  leafRun: ProviderLeafRunV2
  protocolEvidence: ProviderProtocolEvidenceV2
}>

export type RecordProviderOutcomeV2Result =
  | Readonly<{ kind: 'recorded'; bundle: ProviderOutcomeEvidenceBundleV2 }>
  | Readonly<{ kind: 'refused'; reason: 'release_invalid' | 'response_invalid' }>

export function providerInvocationEnvelopeV2Digest(envelope: ProviderInvocationEnvelopeV2): string {
  const { envelopeDigest: _digest, ...material } = envelope
  return canonicalDigest(material as StableHashValue)
}

export function actionAttemptReleaseV2Digest(release: ActionAttemptReleaseV2): string {
  const { releaseDigest: _digest, ...material } = release
  return canonicalDigest(material as StableHashValue)
}

export function providerOutcomeV2Digest(outcome: ProviderOutcomeV2): string {
  const { outcomeDigest: _digest, ...material } = outcome
  return canonicalDigest(material as StableHashValue)
}

export function recordProviderOutcomeV2(input: Readonly<{
  envelope: ProviderInvocationEnvelopeV2
  contract: CapabilityContract
  response: JsonValue
  observedAt: number
}>): RecordProviderOutcomeV2Result {
  if (!validTime(input.observedAt) || input.observedAt < input.envelope.releasedAt
    || !providerInvocationEnvelopeIntegrityValid(input.envelope, input.contract)
    || !isBoundedJsonValue(input.response)) {
    return { kind: 'refused', reason: 'response_invalid' }
  }
  const responseDigest = canonicalDigest(input.response as StableHashValue)
  const parsedResponse = parseProviderResponse(input.response)
  const expectedEcho: ProviderResultEchoV2 = {
    envelopeRef: input.envelope.envelopeRef,
    envelopeDigest: input.envelope.envelopeDigest,
    actionAttemptRef: input.envelope.lineage.actionAttemptRef,
    actionAttemptDigest: input.envelope.lineage.actionAttemptDigest,
    authorityLineageDigest: input.envelope.lineage.authorityLineageDigest,
    providerIdempotencyKey: input.envelope.providerIdempotencyKey,
  }
  const echoMatches = parsedResponse.kind === 'structured' && parsedResponse.echo !== undefined
    && canonicalDigest(parsedResponse.echo as StableHashValue) === canonicalDigest(expectedEcho as StableHashValue)
  const validatedOutput = parsedResponse.kind === 'structured'
    ? openCapabilityDecisionModel(input.contract).validateOutput(parsedResponse.output)
    : undefined
  const outcomeRef = `provider-outcome:v2:${canonicalDigest({
    envelopeRef: input.envelope.envelopeRef,
    envelopeDigest: input.envelope.envelopeDigest,
    responseDigest,
  } as StableHashValue)}`
  const outcomeMaterial = echoMatches && validatedOutput?.kind === 'valid'
    ? {
        format: 'ae.provider-outcome:v2' as const, outcomeRef,
        state: 'succeeded' as const,
        envelopeRef: input.envelope.envelopeRef, envelopeDigest: input.envelope.envelopeDigest,
        responseDigest, output: validatedOutput.value,
        outputDigest: canonicalDigest(validatedOutput.value as StableHashValue),
        lineage: cloneExecutionLineage(input.envelope.lineage), lineageDigest: input.envelope.lineageDigest,
        recovery: { unknownOutcome: 'reconcile_only' as const, automaticRetry: false as const },
        observedAt: input.observedAt,
      }
    : {
        format: 'ae.provider-outcome:v2' as const, outcomeRef,
        state: 'unknown_external_state' as const,
        reason: parsedResponse.kind === 'invalid' ? 'provider_response_invalid' as const
          : echoMatches ? 'provider_output_invalid' as const : 'provider_echo_mismatch' as const,
        envelopeRef: input.envelope.envelopeRef, envelopeDigest: input.envelope.envelopeDigest,
        responseDigest,
        lineage: cloneExecutionLineage(input.envelope.lineage), lineageDigest: input.envelope.lineageDigest,
        recovery: { kind: 'reconcile_required' as const, automaticRetry: false as const },
        observedAt: input.observedAt,
      }
  const outcome = withDigest(outcomeMaterial, 'outcomeDigest') as ProviderOutcomeV2
  const outcomeLink = { outcomeRef: outcome.outcomeRef, outcomeDigest: outcome.outcomeDigest }
  const rootRun = withDigest({
    format: 'ae.provider-root-run:v2' as const,
    rootRunRef: `provider-root-run:v2:${canonicalDigest(outcomeLink as StableHashValue)}`,
    state: outcome.state, ...outcomeLink,
    envelopeRef: input.envelope.envelopeRef, envelopeDigest: input.envelope.envelopeDigest,
    lineage: cloneExecutionLineage(input.envelope.lineage), lineageDigest: input.envelope.lineageDigest,
    recordedAt: input.observedAt,
  }, 'rootRunDigest') as ProviderRootRunV2
  const leafRun = withDigest({
    format: 'ae.provider-leaf-run:v2' as const,
    leafRunRef: `provider-leaf-run:v2:${canonicalDigest(outcomeLink as StableHashValue)}`,
    state: outcome.state, ...outcomeLink,
    envelopeRef: input.envelope.envelopeRef, envelopeDigest: input.envelope.envelopeDigest,
    businessId: input.envelope.lineage.businessId,
    offeringId: input.envelope.lineage.offeringId,
    bindingId: input.envelope.lineage.bindingId,
    lineage: cloneExecutionLineage(input.envelope.lineage), lineageDigest: input.envelope.lineageDigest,
    recordedAt: input.observedAt,
  }, 'leafRunDigest') as ProviderLeafRunV2
  const protocolEvidence = withDigest({
    format: 'ae.provider-protocol-evidence:v2' as const,
    protocolEvidenceRef: `provider-protocol-evidence:v2:${canonicalDigest(outcomeLink as StableHashValue)}`,
    disposition: outcome.state === 'succeeded' ? 'validated_result' as const : 'unknown_external_state' as const,
    ...outcomeLink,
    envelopeRef: input.envelope.envelopeRef, envelopeDigest: input.envelope.envelopeDigest,
    responseDigest,
    ...(outcome.state === 'succeeded' && parsedResponse.kind === 'structured'
      && parsedResponse.echo !== undefined
      ? {
          providerResult: {
            format: 'ae.provider-result:v2' as const,
            echo: { ...parsedResponse.echo },
            output: structuredClone(parsedResponse.output),
          },
        }
      : {}),
    ...(parsedResponse.kind === 'structured' && parsedResponse.echo !== undefined
      ? { observedEcho: { ...parsedResponse.echo } }
      : {}),
    ...(outcome.state === 'succeeded' ? { outputDigest: outcome.outputDigest } : {}),
    lineage: cloneExecutionLineage(input.envelope.lineage), lineageDigest: input.envelope.lineageDigest,
    recordedAt: input.observedAt,
  }, 'protocolEvidenceDigest') as ProviderProtocolEvidenceV2
  return deepFreeze({
    kind: 'recorded', bundle: { outcome, rootRun, leafRun, protocolEvidence },
  }) as RecordProviderOutcomeV2Result
}

export function providerInvocationEnvelopeIntegrityValid(
  envelope: ProviderInvocationEnvelopeV2,
  contract: CapabilityContract,
): boolean {
  let model: ReturnType<typeof openCapabilityDecisionModel>
  try {
    model = openCapabilityDecisionModel(contract)
  } catch {
    return false
  }
  const input = model.validateInput(envelope.input.value)
  return envelope.format === 'ae.provider-invocation-envelope:v2'
    && envelope.state === 'ready_for_provider'
    && providerInvocationEnvelopeV2Digest(envelope) === envelope.envelopeDigest
    && canonicalDigest(envelope.lineage as StableHashValue) === envelope.lineageDigest
    && sameCapabilityContractRef(envelope.lineage.contractRef, contract.ref)
    && envelope.lineage.selectionKey === model.selectionKey
    && envelope.lineage.semanticDigest === model.semanticDigest
    && envelope.input.schemaIdentity === canonicalDigest(contract.inputSchema as StableHashValue)
    && input.kind === 'valid'
    && canonicalDigest(envelope.input.value as StableHashValue) === envelope.input.valueDigest
    && envelope.output.schemaIdentity === canonicalDigest(contract.outputSchema as StableHashValue)
    && envelope.dataScopeDigest === canonicalDigest(envelope.dataScope as StableHashValue)
    && validTime(envelope.releasedAt) && validTime(envelope.expiresAt)
    && envelope.releasedAt < envelope.expiresAt
}

export function releaseProviderInvocationV2(input: Readonly<{
  attempt: ActionAttemptV2
  providerReleaseGrant: ProviderReleaseGrantV2
  disclosureGrant: ActionDisclosureGrantV2
  contract: CapabilityContract
  actionInputs: readonly Readonly<{
    inputKey: string
    inputPointer: string
    schemaIdentity: string
    value: unknown
  }>[]
  releasedAt: number
}>): ReleaseProviderInvocationV2Result {
  if (!validTime(input.releasedAt) || !validAttempt(input.attempt)
    || !validLinkedGrant(input.providerReleaseGrant, 'providerReleaseGrantDigest', input.attempt)
    || !validLinkedGrant(input.disclosureGrant, 'disclosureGrantDigest', input.attempt)) {
    return { kind: 'refused', reason: 'authority_invalid' }
  }
  if (input.attempt.expiresAt <= input.releasedAt
    || input.providerReleaseGrant.expiresAt <= input.releasedAt
    || input.disclosureGrant.expiresAt <= input.releasedAt) {
    return { kind: 'refused', reason: 'authority_expired' }
  }
  if (input.providerReleaseGrant.state !== 'unreleased' || input.disclosureGrant.state !== 'unreleased'
    || input.providerReleaseGrant.providerReleaseGrantRef !== input.attempt.providerReleaseGrantRef
    || input.disclosureGrant.disclosureGrantRef !== input.attempt.disclosureGrantRef
    || input.providerReleaseGrant.businessId !== input.attempt.authority.supply.businessId
    || input.providerReleaseGrant.offeringId !== input.attempt.authority.supply.offering.offeringId
    || input.providerReleaseGrant.bindingId !== input.attempt.authority.supply.binding.bindingId
    || input.disclosureGrant.bindingId !== input.attempt.authority.supply.binding.bindingId
    || input.disclosureGrant.scopeDigest !== canonicalDigest(input.disclosureGrant.scope as StableHashValue)
    || !sameCapabilityContractRef(input.contract.ref, input.attempt.lineage.contractRef)) {
    return { kind: 'refused', reason: 'authority_invalid' }
  }
  let model: ReturnType<typeof openCapabilityDecisionModel>
  try {
    model = openCapabilityDecisionModel(input.contract)
  } catch {
    return { kind: 'refused', reason: 'authority_invalid' }
  }
  if (model.selectionKey !== input.attempt.lineage.selectionKey
    || model.semanticDigest !== input.attempt.lineage.semanticDigest) {
    return { kind: 'refused', reason: 'authority_invalid' }
  }
  const facts = input.actionInputs.map((fact) => {
    const semantic = model.inputs.find((candidate) => candidate.key === fact.inputKey
      && candidate.inputPointer === fact.inputPointer && candidate.schemaIdentity === fact.schemaIdentity)
    return semantic === undefined || !isBoundedJsonValue(fact.value) ? undefined : {
      input: semantic.key, inputPointer: semantic.inputPointer, value: fact.value,
    }
  })
  if (facts.some((fact) => fact === undefined)) return { kind: 'refused', reason: 'input_invalid' }
  const projection = model.projectPreparation({
    contractRef: model.contractRef,
    selectionKey: model.selectionKey,
    semanticDigest: model.semanticDigest,
    facts: facts.flatMap((fact) => fact === undefined ? [] : [fact]),
  })
  if (projection.kind !== 'ready') return { kind: 'refused', reason: 'input_invalid' }
  const validatedInput = model.validateInput(projection.input)
  if (validatedInput.kind !== 'valid') return { kind: 'refused', reason: 'input_invalid' }
  const authority = input.attempt.authority
  const executionDataScope = authority.dataScope.filter(({ phase }) => phase === 'execution')
  if (canonicalDigest(executionDataScope as StableHashValue) !== input.disclosureGrant.scopeDigest) {
    return { kind: 'refused', reason: 'authority_invalid' }
  }
  const lineage: ProviderExecutionLineageV2 = {
    requestId: input.attempt.lineage.requestId,
    requestRevision: input.attempt.lineage.requestRevision,
    principalId: input.attempt.lineage.principalId,
    delegatedAgentId: input.attempt.lineage.delegatedAgentId,
    planRevisionId: input.attempt.lineage.planRevisionId,
    planDigest: input.attempt.lineage.planDigest,
    actionId: input.attempt.lineage.actionId,
    preparedActionRef: authority.preparedAction.preparedActionRef,
    preparedActionDigest: authority.preparedAction.preparedActionDigest,
    approvalGrantRef: authority.approvalGrantRef,
    approvalGrantDigest: authority.approvalGrantDigest,
    actionAttemptRef: input.attempt.actionAttemptRef,
    actionAttemptDigest: input.attempt.actionAttemptDigest,
    authorityLineageDigest: input.attempt.authorityLineageDigest,
    contractRef: { ...input.attempt.lineage.contractRef },
    selectionKey: input.attempt.lineage.selectionKey,
    semanticDigest: input.attempt.lineage.semanticDigest,
    businessId: authority.supply.businessId,
    offeringId: authority.supply.offering.offeringId,
    offeringRegistrationHash: authority.supply.offering.registrationHash,
    bindingId: authority.supply.binding.bindingId,
    bindingRegistrationHash: authority.supply.binding.registrationHash,
  }
  const lineageDigest = canonicalDigest(lineage as StableHashValue)
  const providerIdempotencyKey = `provider-idempotency:v2:${canonicalDigest({
    actionAttemptRef: input.attempt.actionAttemptRef,
    actionAttemptDigest: input.attempt.actionAttemptDigest,
    providerReleaseGrantRef: input.providerReleaseGrant.providerReleaseGrantRef,
  } as StableHashValue)}`
  const envelopeRef = `provider-invocation:v2:${canonicalDigest({
    lineageDigest, providerIdempotencyKey,
  } as StableHashValue)}`
  const material: Omit<ProviderInvocationEnvelopeV2, 'envelopeDigest'> = {
    format: 'ae.provider-invocation-envelope:v2', envelopeRef, state: 'ready_for_provider',
    providerIdempotencyKey, lineage, lineageDigest,
    providerReleaseGrantRef: input.providerReleaseGrant.providerReleaseGrantRef,
    providerReleaseGrantDigest: input.providerReleaseGrant.providerReleaseGrantDigest,
    disclosureGrantRef: input.disclosureGrant.disclosureGrantRef,
    disclosureGrantDigest: input.disclosureGrant.disclosureGrantDigest,
    input: {
      schemaIdentity: canonicalDigest(input.contract.inputSchema as StableHashValue),
      value: validatedInput.value,
      valueDigest: canonicalDigest(validatedInput.value as StableHashValue),
    },
    output: { schemaIdentity: canonicalDigest(input.contract.outputSchema as StableHashValue) },
    spend: { currency: authority.spend.currency, maximumAmountMinor: authority.spend.maximumAmountMinor },
    dataScope: executionDataScope.map((declaration) => ({
      ...declaration, recipient: { ...declaration.recipient }, purposes: [...declaration.purposes],
    })),
    dataScopeDigest: canonicalDigest(executionDataScope as StableHashValue),
    effectScope: authority.effectScope.map((effect) => ({ ...effect })),
    evidenceScope: authority.evidenceScope.map((evidence) => ({ ...evidence })),
    authorityScopeDigest: authority.scopeDigest,
    recovery: {
      unknownOutcome: authority.recovery.unknownOutcome,
      automaticRetry: authority.recovery.automaticRetry,
      registeredLifecycle: { ...authority.recovery.registeredLifecycle },
    },
    releasedAt: input.releasedAt,
    expiresAt: input.attempt.expiresAt,
  }
  const envelope = { ...material, envelopeDigest: canonicalDigest(material as StableHashValue) }
  const releaseRef = `action-attempt-release:v2:${canonicalDigest({
    actionAttemptRef: input.attempt.actionAttemptRef,
    actionAttemptDigest: input.attempt.actionAttemptDigest,
    envelopeRef: envelope.envelopeRef,
    envelopeDigest: envelope.envelopeDigest,
  } as StableHashValue)}`
  const release = withDigest({
    format: 'ae.action-attempt-release:v2' as const, releaseRef, state: 'released' as const,
    actionAttemptRef: input.attempt.actionAttemptRef,
    actionAttemptDigest: input.attempt.actionAttemptDigest,
    providerReleaseGrantRef: input.providerReleaseGrant.providerReleaseGrantRef,
    providerReleaseGrantDigest: input.providerReleaseGrant.providerReleaseGrantDigest,
    disclosureGrantRef: input.disclosureGrant.disclosureGrantRef,
    disclosureGrantDigest: input.disclosureGrant.disclosureGrantDigest,
    envelopeRef: envelope.envelopeRef, envelopeDigest: envelope.envelopeDigest,
    authorityLineageDigest: input.attempt.authorityLineageDigest,
    providerIdempotencyKey, releasedAt: input.releasedAt,
  }, 'releaseDigest') as ActionAttemptReleaseV2
  return deepFreeze({ kind: 'released', release, envelope }) as ReleaseProviderInvocationV2Result
}

function validAttempt(attempt: ActionAttemptV2): boolean {
  return attempt.format === 'ae.action-attempt:v2' && attempt.state === 'admitted'
    && actionAttemptV2Digest(attempt) === attempt.actionAttemptDigest
    && approvalGrantV2Digest(attempt.authority) === attempt.approvalGrantDigest
    && attempt.authority.approvalGrantRef === attempt.approvalGrantRef
    && canonicalDigest(attempt.authority as StableHashValue) === attempt.authorityLineageDigest
}

function validLinkedGrant(
  grant: ProviderReleaseGrantV2 | ActionDisclosureGrantV2,
  digestKey: 'providerReleaseGrantDigest' | 'disclosureGrantDigest',
  attempt: ActionAttemptV2,
): boolean {
  const validDigest = 'providerReleaseGrantDigest' in grant
    ? digestKey === 'providerReleaseGrantDigest'
      && isCanonicalDigest(grant.providerReleaseGrantDigest)
      && canonicalDigest((({ providerReleaseGrantDigest: _digest, ...material }) => material)(grant) as StableHashValue)
        === grant.providerReleaseGrantDigest
    : digestKey === 'disclosureGrantDigest'
      && isCanonicalDigest(grant.disclosureGrantDigest)
      && canonicalDigest((({ disclosureGrantDigest: _digest, ...material }) => material)(grant) as StableHashValue)
        === grant.disclosureGrantDigest
  return validDigest
    && grant.approvalGrantRef === attempt.approvalGrantRef
    && grant.approvalGrantDigest === attempt.approvalGrantDigest
    && grant.authorityLineageDigest === attempt.authorityLineageDigest
    && grant.attempt.actionAttemptRef === attempt.actionAttemptRef
    && grant.attempt.actionAttemptDigest === attempt.actionAttemptDigest
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function parseProviderResponse(value: JsonValue):
  | Readonly<{ kind: 'structured'; echo?: ProviderResultEchoV2; output: JsonValue }>
  | Readonly<{ kind: 'invalid' }> {
  if (!isRecord(value)
    || Object.keys(value).some((key) => !['format', 'echo', 'output'].includes(key))
    || !Object.prototype.hasOwnProperty.call(value, 'format')
    || !Object.prototype.hasOwnProperty.call(value, 'output')
    || value.format !== 'ae.provider-result:v2'
    || !Object.prototype.hasOwnProperty.call(value, 'output') || !isBoundedJsonValue(value.output)) {
    return { kind: 'invalid' }
  }
  const echo = parseProviderEcho(value.echo)
  return {
    kind: 'structured',
    ...(echo === undefined ? {} : { echo }),
    output: value.output,
  }
}

function parseProviderEcho(value: unknown): ProviderResultEchoV2 | undefined {
  if (!isRecord(value)) return undefined
  const keys = [
    'envelopeRef', 'envelopeDigest', 'actionAttemptRef', 'actionAttemptDigest',
    'authorityLineageDigest', 'providerIdempotencyKey',
  ] as const
  if (Object.keys(value).length !== keys.length || keys.some((key) => typeof value[key] !== 'string')) {
    return undefined
  }
  return {
    envelopeRef: String(value.envelopeRef), envelopeDigest: String(value.envelopeDigest),
    actionAttemptRef: String(value.actionAttemptRef), actionAttemptDigest: String(value.actionAttemptDigest),
    authorityLineageDigest: String(value.authorityLineageDigest),
    providerIdempotencyKey: String(value.providerIdempotencyKey),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cloneExecutionLineage(lineage: ProviderExecutionLineageV2): ProviderExecutionLineageV2 {
  return { ...lineage, contractRef: { ...lineage.contractRef } }
}

function withDigest<T extends object, K extends string>(material: T, key: K): T & Record<K, string> {
  return { ...material, [key]: canonicalDigest(material as StableHashValue) } as T & Record<K, string>
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
