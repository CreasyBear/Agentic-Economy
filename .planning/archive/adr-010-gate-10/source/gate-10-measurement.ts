import {
  projectStructuredInvocationTask,
  type DynamicPublishedAdapterSnapshot,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  gate10FrozenPassPolicy,
  type DirectEndpointBaselineRun,
  type DirectEndpointCase,
  type DirectEndpointTraceEvent,
} from './direct-endpoint-baseline-contract'
import type { Gate10HostCaseTrace, Gate10HostRawEvent } from './gate-10-host-trace'

export type Gate10CaseMetrics = Readonly<{
  humanEffort: Readonly<{
    questionsAnswered: number
    explicitDecisions: number
    repeatedFacts: number
    interactionTurns: number
    recoveryDecisions: number
  }>
  correctness: Readonly<{
    outcomeState: string
    releaseState: string
    evidenceKind: string
    resultDigest: string | null
    effectCount: number
  }>
  control: Readonly<{
    exactAuthorityChecks: number
    materialInvalidations: number
    staleAuthorityRefusals: number
    reconcileBeforeRetry: number
    ambientAuthorityUses: number
  }>
  privacy: Readonly<{
    disclosedFields: readonly string[]
    recipient: string
    purpose: string
    amount: Readonly<{ currency: string; amountMinor: number }>
    outOfBoundsDisclosures: number
  }>
  accessibility: Readonly<{
    requiredSemanticFields: readonly string[]
    observedSemanticFields: readonly string[]
    missingSemanticFields: readonly string[]
    continuations: readonly string[]
  }>
  providerBurden: Readonly<{
    providerCalls: number
    duplicateCalls: number
    paymentAttempts: number
    signatureAttempts: number
    reconciliationCalls: number
    correctionRoundTrips: number
  }>
  operatorBurden: Readonly<{
    hostBusinessRulePaths: number
    manualInterventions: number
    reconciliationTasks: number
    hiddenStateDependencies: number
  }>
}>

export type Gate10MeasuredCase = Readonly<{
  case: DirectEndpointCase
  direct: Gate10CaseMetrics
  embedded: Gate10CaseMetrics
  dimensions: Readonly<{
    humanEffortNoRegression: boolean
    correctness: boolean
    control: boolean
    privacy: boolean
    accessibility: boolean
    providerBurden: boolean
    operatorBurden: boolean
  }>
  casePass: boolean
}>

export function measureGate10Cases(
  directRun: DirectEndpointBaselineRun,
  hostCases: readonly Gate10HostCaseTrace[],
): Readonly<{
  cases: readonly Gate10MeasuredCase[]
  aggregateHumanEffort: Readonly<{
    direct: Gate10CaseMetrics['humanEffort']
    embedded: Gate10CaseMetrics['humanEffort']
    strictImprovement: boolean
  }>
  verdict: 'PASS_FOR_DECLARED_CLASS' | 'NARROW_OR_REDESIGN'
}> {
  if (canonicalDigest(directRun.task as unknown as StableHashValue)
      !== canonicalDigest(hostCases[0]?.task as unknown as StableHashValue)
    || canonicalDigest(directRun.policy as unknown as StableHashValue)
      !== canonicalDigest(gate10FrozenPassPolicy as unknown as StableHashValue)
    || directRun.cases.length !== directRun.task.cases.length
    || hostCases.length !== directRun.task.cases.length) {
    throw new Error('gate10_task_or_policy_mismatch')
  }
  const cases = directRun.task.cases.map((caseName) => {
    const directCase = directRun.cases.find((entry) => entry.case === caseName)
    const hostCase = hostCases.find((entry) => entry.case === caseName)
    if (directCase === undefined || hostCase === undefined
      || canonicalDigest(hostCase.task as unknown as StableHashValue)
        !== canonicalDigest(directRun.task as unknown as StableHashValue)) {
      throw new Error(`gate10_case_missing_or_incomparable:${caseName}`)
    }
    const requiredSemanticFields = requiredFields(hostCase)
    const direct = measureDirectCase(directCase, requiredSemanticFields)
    const embedded = measureEmbeddedCase(hostCase, requiredSemanticFields)
    const dimensions = {
      humanEffortNoRegression: numericNoHigher(embedded.humanEffort, direct.humanEffort),
      correctness: canonicalDigest(embedded.correctness as unknown as StableHashValue)
        === canonicalDigest(direct.correctness as unknown as StableHashValue),
      control: controlNoWorse(embedded.control, direct.control),
      privacy: canonicalDigest(embedded.privacy as unknown as StableHashValue)
        === canonicalDigest(direct.privacy as unknown as StableHashValue),
      accessibility: embedded.accessibility.missingSemanticFields.length
        <= direct.accessibility.missingSemanticFields.length,
      providerBurden: numericNoHigher(embedded.providerBurden, direct.providerBurden),
      operatorBurden: numericNoHigher(embedded.operatorBurden, direct.operatorBurden),
    }
    return {
      case: caseName,
      direct,
      embedded,
      dimensions,
      casePass: Object.values(dimensions).every(Boolean),
    }
  })
  const aggregateHumanEffort = {
    direct: sumHumanEffort(cases.map((entry) => entry.direct.humanEffort)),
    embedded: sumHumanEffort(cases.map((entry) => entry.embedded.humanEffort)),
    strictImprovement: false,
  }
  const humanKeys = Object.keys(aggregateHumanEffort.direct) as (
    keyof Gate10CaseMetrics['humanEffort']
  )[]
  aggregateHumanEffort.strictImprovement = humanKeys.some((key) => (
    aggregateHumanEffort.embedded[key] < aggregateHumanEffort.direct[key]
  )) && humanKeys.every((key) => (
    aggregateHumanEffort.embedded[key] <= aggregateHumanEffort.direct[key]
  ))
  return {
    cases,
    aggregateHumanEffort,
    verdict: cases.every((entry) => entry.casePass) && aggregateHumanEffort.strictImprovement
      ? 'PASS_FOR_DECLARED_CLASS'
      : 'NARROW_OR_REDESIGN',
  }
}

function measureDirectCase(
  entry: DirectEndpointBaselineRun['cases'][number],
  requiredSemanticFields: readonly string[],
): Gate10CaseMetrics {
  assertSequence(entry.trace)
  const prepared = entry.trace.filter((event) => event.kind === 'prepared')
  const decisions = entry.trace.filter((event) => event.kind === 'authority_decision')
  const scope = prepared.at(-1)?.detail.scope as Readonly<Record<string, StableHashValue>> | undefined
  if (scope === undefined) throw new Error('gate10_direct_scope_missing')
  const observation = entry.trace.filter((event) => event.kind === 'observation').at(-1)
  if (observation === undefined) throw new Error('gate10_direct_observation_missing')
  const semanticFields = directSemanticFields(entry.trace, scope)
  const providerReleases = countDirect(entry.trace, 'provider_release')
  const reconciliationCalls = countDirect(entry.trace, 'provider_reconciliation')
  const facts = directFacts(entry.trace)
  const continuations = entry.trace
    .filter((event) => event.kind === 'continuation')
    .map((event) => String(event.detail.name))
  const exactChecks = decisions.filter((decision) => prepared.some((candidate) => (
    candidate.detail.authorityRef === decision.detail.authorityRef
      && (candidate.detail.scope as Readonly<Record<string, StableHashValue>> | undefined) !== undefined
  ))).length
  return {
    humanEffort: {
      questionsAnswered: entry.trace
        .filter((event) => event.kind === 'answer')
        .reduce((sum, event) => sum + objectKeys(event.detail.fields).length, 0),
      explicitDecisions: decisions.length,
      repeatedFacts: duplicateFactCount(facts),
      interactionTurns: entry.trace.filter((event) => (
        event.kind === 'answer'
        || event.kind === 'authority_decision'
        || (event.kind === 'command' && ['begin', 'correct'].includes(String(event.detail.name)))
        || (event.kind === 'continuation' && event.detail.humanDecisionRequired === true)
      )).length,
      recoveryDecisions: entry.trace.filter((event) => (
        event.kind === 'continuation' && event.detail.humanDecisionRequired === true
      )).length,
    },
    correctness: {
      outcomeState: entry.final.state,
      releaseState: entry.final.releaseStarted ? 'released' : 'not_released',
      evidenceKind: entry.final.state === 'reconciled_released'
        ? 'reconciliation_released'
        : 'provider_result',
      resultDigest: entry.final.outputDigest,
      effectCount: providerReleases,
    },
    control: {
      exactAuthorityChecks: exactChecks,
      materialInvalidations: countDirect(entry.trace, 'authority_invalidated'),
      staleAuthorityRefusals: countDirect(entry.trace, 'authority_refused'),
      reconcileBeforeRetry: continuations.filter((name) => name === 'reconcile_before_retry').length,
      ambientAuthorityUses: decisions.length - exactChecks,
    },
    privacy: privacyFromScope(scope),
    accessibility: {
      requiredSemanticFields,
      observedSemanticFields: semanticFields,
      missingSemanticFields: requiredSemanticFields.filter((field) => !semanticFields.includes(field)),
      continuations,
    },
    providerBurden: {
      providerCalls: providerReleases + reconciliationCalls,
      duplicateCalls: Math.max(0, providerReleases - new Set(
        entry.trace.filter((event) => (
          event.kind === 'transport_request' && event.detail.paymentSignaturePresent === true
        )).map((event) => String(event.detail.endpoint)),
      ).size),
      paymentAttempts: countDirect(entry.trace, 'payment_signature_created'),
      signatureAttempts: countDirect(entry.trace, 'payment_signature_requested'),
      reconciliationCalls,
      correctionRoundTrips: 0,
    },
    operatorBurden: {
      hostBusinessRulePaths: 0,
      manualInterventions: entry.trace.filter((event) => (
        event.kind === 'continuation' && event.detail.humanDecisionRequired === true
      )).length,
      reconciliationTasks: reconciliationCalls,
      hiddenStateDependencies: reconstructDirectFinal(entry.trace, entry.final) ? 0 : 1,
    },
  }
}

function measureEmbeddedCase(
  entry: Gate10HostCaseTrace,
  requiredSemanticFields: readonly string[],
): Gate10CaseMetrics {
  assertSequence(entry.timeline)
  const final = entry.checkpoints.final
  const control = final.controls[0]
  const attempt = final.attempts[0]?.rows.at(-1)
  const source = final.sourceRows[0]
  const finalProjection = entry.projections.filter(({ checkpoint }) => checkpoint === 'final').at(-1)
  if (control === undefined || attempt === undefined || source === undefined || finalProjection === undefined) {
    throw new Error(`gate10_host_final_missing:${entry.case}`)
  }
  const decisions = entry.timeline.filter((event) => event.kind === 'before:decide')
  const bindings = [
    entry.checkpoints.prepared.controls[0]?.authorityBinding,
    entry.checkpoints.corrected?.controls[0]?.authorityBinding,
  ].filter((value) => value !== undefined)
  const exactChecks = decisions.filter((_decision, index) => {
    const binding = bindings[index]
    if (binding === undefined) return false
    return binding.actionId === entry.checkpoints.prepared.operations?.[0]?.operationId
      && binding.contractVersion === finalProjection.projection.semantics.operation.version
      && binding.limits.amountMinor === entry.task.operation.price.amountMinor
      && binding.digest.length > 0
      && binding.targetDigest.length > 0
  }).length
  const finalResult = source.observedResolution.state === 'returned'
    ? source.observedResolution.result
    : undefined
  const output = finalResult?.output as StableHashValue | undefined
  const reconciled = attempt.outcome.state === 'reconciled_released'
  const releases = entry.timeline.filter((event) => event.kind === 'provider_release')
  const reconciliationEvents = entry.timeline.filter((event) => (
    event.kind === 'reconciliation_evidence'
  ))
  const observedFields = Object.keys(finalProjection.projection.semantics)
    .filter((field) => field !== 'identity')
    .map(camelToSnake)
    .sort()
  const facts = hostFacts(entry.timeline)
  const automatedRecovery = entry.timeline.some((event) => (
    event.kind === 'automated_recovery_dispatch' && event.detail.humanDecisionRequired === false
  ))
  const humanCommands = entry.timeline.filter((event) => (
    event.kind.startsWith('before:')
      && ['begin', 'answer', 'correct', 'decide'].includes(event.kind.slice('before:'.length))
  ))
  const target = source.input.input as Readonly<Record<string, StableHashValue>>
  const data = (source.input.target as any).effect.data as readonly Readonly<{
    inputPointer: string
    recipient: string
    purposes: readonly string[]
  }>[]
  const amount = (source.input.target as any).effect.amount as Readonly<{
    currency: string
    amountMinor: number
  }>
  const expectedFields = data.map(({ inputPointer }) => inputPointer).sort()
  const actualFields = Object.keys(target).map((field) => `/${field}`).sort()
  return {
    humanEffort: {
      questionsAnswered: entry.timeline
        .filter((event) => event.kind === 'before:answer')
        .reduce((sum, event) => sum + objectKeys(event.detail.answers).length, 0),
      explicitDecisions: decisions.length,
      repeatedFacts: duplicateFactCount(facts),
      interactionTurns: humanCommands.length,
      recoveryDecisions: entry.timeline.filter((event) => (
        event.kind === 'before:recover' && !automatedRecovery
      )).length,
    },
    correctness: {
      outcomeState: reconciled ? 'reconciled_released' : 'completed',
      releaseState: attempt.release.state === 'not_released' ? 'not_released' : 'released',
      evidenceKind: reconciled ? 'reconciliation_released' : 'provider_result',
      resultDigest: output === undefined ? null : canonicalDigest(output),
      effectCount: releases.length,
    },
    control: {
      exactAuthorityChecks: exactChecks,
      materialInvalidations: entry.checkpoints.corrected === undefined ? 0 : 1,
      staleAuthorityRefusals: entry.staleAuthorityRefusal === undefined ? 0 : 1,
      reconcileBeforeRetry: entry.retryBeforeReconcile === 'reconcile_before_retry' ? 1 : 0,
      ambientAuthorityUses: decisions.length - exactChecks,
    },
    privacy: {
      disclosedFields: actualFields,
      recipient: data[0]?.recipient ?? 'missing',
      purpose: data[0]?.purposes[0] ?? 'missing',
      amount,
      outOfBoundsDisclosures: actualFields.filter((field) => !expectedFields.includes(field)).length,
    },
    accessibility: {
      requiredSemanticFields,
      observedSemanticFields: observedFields,
      missingSemanticFields: requiredSemanticFields.filter((field) => !observedFields.includes(field)),
      continuations: [...finalProjection.projection.semantics.continuations].sort(),
    },
    providerBurden: {
      providerCalls: releases.length,
      duplicateCalls: Math.max(0, releases.length - new Set(
        entry.timeline.filter((event) => (
          event.kind === 'transport_request' && event.detail.paymentSignaturePresent === true
        )).map((event) => String(event.detail.endpoint)),
      ).size),
      paymentAttempts: entry.timeline.filter((event) => event.kind === 'payment_signature_created').length,
      signatureAttempts: entry.timeline.filter((event) => event.kind === 'payment_signature_requested').length,
      reconciliationCalls: 0,
      correctionRoundTrips: 0,
    },
    operatorBurden: {
      hostBusinessRulePaths: entry.timeline.filter((event) => (
        event.source === 'host_application'
        && ['eligibility', 'authority_rule', 'retry_rule', 'evidence_rule'].includes(event.kind)
      )).length,
      manualInterventions: entry.timeline.filter((event) => (
        event.kind === 'before:recover' && !automatedRecovery
      )).length,
      reconciliationTasks: reconciliationEvents.length,
      hiddenStateDependencies: reconstructHostProjection(final, finalProjection.projection) ? 0 : 1,
    },
  }
}

function privacyFromScope(scope: Readonly<Record<string, StableHashValue>>): Gate10CaseMetrics['privacy'] {
  const disclosedFields = [...(scope.disclosedFields as readonly string[])].sort()
  return {
    disclosedFields,
    recipient: String(scope.recipient),
    purpose: String(scope.purpose),
    amount: scope.amount as Readonly<{ currency: string; amountMinor: number }>,
    outOfBoundsDisclosures: 0,
  }
}

function requiredFields(entry: Gate10HostCaseTrace): readonly string[] {
  const projection = entry.projections.find(({ checkpoint }) => checkpoint === 'prepared')?.projection
  if (projection === undefined) throw new Error('gate10_required_projection_missing')
  return Object.keys(projection.semantics)
    .filter((field) => field !== 'identity')
    .map(camelToSnake)
    .sort()
}

function directSemanticFields(
  trace: readonly DirectEndpointTraceEvent[],
  scope: Readonly<Record<string, StableHashValue>>,
): readonly string[] {
  const observed = new Set<string>()
  observed.add('operation')
  if (trace.some((event) => event.kind === 'prompt') && trace.some((event) => event.kind === 'answer')) {
    observed.add('information')
  }
  if (scope.amount !== undefined) observed.add('price')
  if (scope.disclosedFields !== undefined) observed.add('data_release')
  if (trace.some((event) => event.kind === 'prepared')) observed.add('consequence')
  if (trace.some((event) => event.kind === 'authority_decision')) observed.add('authority')
  if (trace.some((event) => event.kind === 'transport_request')) observed.add('attempt')
  if (trace.some((event) => event.kind === 'provider_response'
      || event.kind === 'provider_reconciliation')) observed.add('evidence')
  if (trace.some((event) => event.kind === 'observation')) observed.add('disposition')
  if (trace.some((event) => event.kind === 'observation'
      || event.kind === 'continuation')) observed.add('continuations')
  return [...observed].sort()
}

function reconstructDirectFinal(
  trace: readonly DirectEndpointTraceEvent[],
  final: DirectEndpointBaselineRun['cases'][number]['final'],
): boolean {
  const releases = countDirect(trace, 'provider_release')
  const payments = countDirect(trace, 'payment_signature_created')
  const reconciled = trace.some((event) => event.kind === 'provider_reconciliation')
  return releases === final.providerCalls
    && payments === final.paymentAttempts
    && (final.state === 'reconciled_released') === reconciled
}

function reconstructHostProjection(
  snapshot: DynamicPublishedAdapterSnapshot,
  expected: Gate10HostCaseTrace['projections'][number]['projection'],
): boolean {
  const control = snapshot.controls[0]
  if (control === undefined) return false
  try {
    const rebuilt = projectStructuredInvocationTask({
      invocationRef: control.invocationRef,
      expectedInvocationVersion: control.invocationVersion,
      resolver: { resolve: () => JSON.parse(JSON.stringify(snapshot)) },
    })
    return rebuilt.semanticDigest === expected.semanticDigest
  } catch {
    return false
  }
}

function directFacts(trace: readonly DirectEndpointTraceEvent[]): readonly string[] {
  return trace.flatMap((event) => {
    if (event.kind === 'command' && event.detail.name === 'begin') return factEntries(event.detail.facts)
    if (event.kind === 'answer') return factEntries(event.detail.fields)
    if (event.kind === 'command' && event.detail.name === 'correct') {
      return factEntries(event.detail.corrections)
    }
    return []
  })
}

function hostFacts(trace: readonly Gate10HostRawEvent[]): readonly string[] {
  return trace.flatMap((event) => {
    if (event.kind === 'before:begin') return factEntries(event.detail.partial)
    if (event.kind === 'before:answer') return factEntries(event.detail.answers)
    if (event.kind === 'before:correct') return factEntries(event.detail.corrections)
    return []
  })
}

function factEntries(value: StableHashValue | undefined): readonly string[] {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value).map(([field, fieldValue]) => `${field}:${canonicalDigest(fieldValue)}`)
}

function duplicateFactCount(facts: readonly string[]): number {
  return facts.length - new Set(facts).size
}

function objectKeys(value: StableHashValue | undefined): readonly string[] {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value)
    : []
}

function countDirect(trace: readonly DirectEndpointTraceEvent[], kind: DirectEndpointTraceEvent['kind']): number {
  return trace.filter((event) => event.kind === kind).length
}

function assertSequence(trace: readonly Readonly<{ sequence: number }>[]): void {
  if (trace.length === 0 || trace.some((event, index) => event.sequence !== index + 1)) {
    throw new Error('gate10_trace_sequence_invalid')
  }
}

function controlNoWorse(
  embedded: Gate10CaseMetrics['control'],
  direct: Gate10CaseMetrics['control'],
): boolean {
  return embedded.ambientAuthorityUses === 0
    && embedded.exactAuthorityChecks >= direct.exactAuthorityChecks
    && embedded.materialInvalidations >= direct.materialInvalidations
    && embedded.staleAuthorityRefusals >= direct.staleAuthorityRefusals
    && embedded.reconcileBeforeRetry >= direct.reconcileBeforeRetry
}

function numericNoHigher(
  candidate: Readonly<Record<string, number>>,
  baseline: Readonly<Record<string, number>>,
): boolean {
  return Object.keys(baseline).every((key) => candidate[key]! <= baseline[key]!)
}

function sumHumanEffort(
  values: readonly Gate10CaseMetrics['humanEffort'][],
): Gate10CaseMetrics['humanEffort'] {
  return values.reduce((sum, value) => ({
    questionsAnswered: sum.questionsAnswered + value.questionsAnswered,
    explicitDecisions: sum.explicitDecisions + value.explicitDecisions,
    repeatedFacts: sum.repeatedFacts + value.repeatedFacts,
    interactionTurns: sum.interactionTurns + value.interactionTurns,
    recoveryDecisions: sum.recoveryDecisions + value.recoveryDecisions,
  }), {
    questionsAnswered: 0,
    explicitDecisions: 0,
    repeatedFacts: 0,
    interactionTurns: 0,
    recoveryDecisions: 0,
  })
}

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)
}
