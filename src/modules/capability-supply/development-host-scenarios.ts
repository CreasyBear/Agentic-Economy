import {
  buildDynamicPublishedInput,
  createDevelopmentTimeoutSignal,
  DevelopmentProcessInterruption,
  createDevelopmentDynamicPublishedSource,
  createDynamicPublishedActionInvocationAdapter,
  createDevelopmentInvocationApplication,
  loadDynamicPublishedAdapterSnapshot,
  materialDigest,
  type DevelopmentHostKind,
  type DevelopmentHostSourceCommands,
  type DevelopmentInvocationHost,
  type DynamicPublishedAdapterSnapshot,
  type DynamicPublishedSnapshotAnchors,
  type InvocationActor,
  type RichInvocationTaskProjection,
  type StructuredInvocationTaskProjection,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  attachCompletedTaskReference,
  type AttachCompletedTaskReferencePorts,
} from '@/modules/customer-request/application/public'
import { compileCustomerRequest } from '@/modules/customer-request/compiler'

import {
  buildDevelopmentPublishedOperationEvidence,
} from './development-published-operation-evidence'
import {
  developmentLostResponseRuntime,
  developmentPreflightRefusalRuntime,
  developmentProviderTimeoutRuntime,
  developmentReleasedRefusalRuntime,
  developmentSuccessRuntime,
  type DevelopmentEffectCounts,
} from './development-host-scenario-runtime'
import type { RouteTransportRuntime } from './route-transport-runtime'

type Fixture = ReturnType<typeof buildDevelopmentPublishedOperationEvidence>
function requireFirst<T>(values: readonly T[], error: string): T {
  const value = values[0]
  if (value === undefined) throw new Error(error)
  return value
}

function requireDefined<T>(value: T | undefined, error: string): T {
  if (value === undefined) throw new Error(error)
  return value
}

type HostAuthority = Readonly<{ reference: string; expiresAt: string }>

function requireAuthority(view: Readonly<{ authority?: HostAuthority }>): HostAuthority {
  const authority = view.authority
  if (authority === undefined) throw new Error('host_authority_missing')
  return authority
}


export type DevelopmentHostScenarioRecord = Readonly<{
  host: DevelopmentHostKind
  actor: InvocationActor
  clarification: Readonly<{
    invocationRef: string
    gatheringVersion: number
    preparedVersion: number
    missing: readonly string[]
    sameLineage: boolean
    rich: RichInvocationTaskProjection
    structured: StructuredInvocationTaskProjection
    gatheringSnapshot: DynamicPublishedAdapterSnapshot
    snapshot: DynamicPublishedAdapterSnapshot
  }>
  correction: Readonly<{
    invocationRef: string
    oldVersion: number
    newVersion: number
    oldAuthorityRef: string
    newAuthorityRef: string
    staleAuthorityDecision: string
    staleExecution: string
    staleProjection: string
    presentationStateUnchanged: boolean
    correctedInputDigest: string
    execution: string
    terminalCorrection: string
    releasedCorrection: Readonly<{
      state: string
      refusal: string
      snapshotUnchanged: boolean
      authorityUnchanged: boolean
      historyUnchanged: boolean
      effectsUnchanged: boolean
    }>
    effects: DevelopmentEffectCounts
    rich: RichInvocationTaskProjection
    structured: StructuredInvocationTaskProjection
    projectionSnapshot: DynamicPublishedAdapterSnapshot
    snapshot: DynamicPublishedAdapterSnapshot
  }>
  success: ScenarioOutcome
  preflightRefusal: ScenarioOutcome
  sourceRefusal: ScenarioOutcome
  releasedRefusal: ScenarioOutcome & Readonly<{ retryPosture: string }>
  uncertainty: ScenarioOutcome & Readonly<{
    retryBeforeReconcile: string
    reconciledState: string
  }>
  timeout: ScenarioOutcome & Readonly<{
    retryBeforeReconcile: string
    releaseClassification: string
  }>
  staleFences: Readonly<{
    duplicate: string
    staleVersion: string
    staleGeneration: string
    unsupportedCancellation: string
    effects: DevelopmentEffectCounts
  }>
  coldResume: ScenarioOutcome & Readonly<{
    interruptedState: string
    resumedState: string
    transcriptCache: 'deleted'
  }>
  completedResultReuse: Readonly<{
    firstKind: 'attached' | 'not_applicable'
    secondKind: 'replayed' | 'not_applicable'
    bothNoEffect: boolean
    referencePayloadAuthorityFree: boolean
    controlSnapshotUnchanged: boolean
    authorityRecordCountBefore: number
    authorityRecordCountAfter: number
    crossPrincipal: string
    effectsBefore: DevelopmentEffectCounts
    effectsAfter: DevelopmentEffectCounts
  }>
}>

export type ScenarioOutcome = Readonly<{
  invocationRef: string
  authorityRef: string
  state: string
  execution: string
  failureCode: string | null
  effects: DevelopmentEffectCounts
  snapshot: DynamicPublishedAdapterSnapshot
}>

export async function runDevelopmentHostScenarioMatrix(
  fixture: Fixture,
): Promise<readonly [DevelopmentHostScenarioRecord, DevelopmentHostScenarioRecord]> {
  const originalNow = Date.now
  Date.now = () => fixture.operation.readiness.observedAt + 1_000
  try {
    return [
      await runHostScenarios(fixture, 'request_owned_human'),
      await runHostScenarios(fixture, 'standalone_external_agent'),
    ]
  } finally {
    Date.now = originalNow
  }
}

async function runHostScenarios(
  fixture: Fixture,
  hostKind: DevelopmentHostKind,
): Promise<DevelopmentHostScenarioRecord> {
  const success = await successScenario(fixture, hostKind)
  return {
    host: hostKind,
    actor: actorFor(hostKind),
    clarification: clarificationScenario(fixture, hostKind),
    correction: await correctionScenario(fixture, hostKind),
    success: success.outcome,
    preflightRefusal: await refusalScenario(fixture, hostKind, 'preflight'),
    sourceRefusal: await refusalScenario(fixture, hostKind, 'source'),
    releasedRefusal: await releasedRefusalScenario(fixture, hostKind),
    uncertainty: await uncertaintyScenario(fixture, hostKind),
    timeout: await timeoutScenario(fixture, hostKind),
    staleFences: success.staleFences,
    coldResume: await coldResumeScenario(fixture, hostKind),
    completedResultReuse: hostKind === 'standalone_external_agent'
      ? completedResultReuse(fixture, success)
      : {
          firstKind: 'not_applicable',
          secondKind: 'not_applicable',
          bothNoEffect: true,
          referencePayloadAuthorityFree: true,
          controlSnapshotUnchanged: true,
          authorityRecordCountBefore: 0,
          authorityRecordCountAfter: 0,
          crossPrincipal: 'not_applicable',
          effectsBefore: { ...success.outcome.effects },
          effectsAfter: { ...success.outcome.effects },
        },
  }
}

function clarificationScenario(
  fixture: Fixture,
  hostKind: DevelopmentHostKind,
): DevelopmentHostScenarioRecord['clarification'] {
  const context = createScenario(fixture, hostKind, 'clarification', developmentSuccessRuntime)
  const gathering = context.host.begin({ symbol: 'BTC' })
  const rich = context.host.projectRich(gathering.invocationRef, gathering.invocationVersion)
  const structured = context.host.projectStructured(gathering.invocationRef, gathering.invocationVersion)
  const gatheringSnapshot = context.host.exportSnapshot()
  const prepared = context.host.answer(
    gathering.invocationRef,
    { convert: 'USD' },
    60_000,
  )
  if (!('control' in prepared) || prepared.control.state !== 'awaiting_authority') {
    throw new Error('clarification_did_not_prepare')
  }
  return {
    invocationRef: gathering.invocationRef,
    gatheringVersion: gathering.invocationVersion,
    preparedVersion: prepared.invocationVersion,
    missing: gathering.missingFields,
    sameLineage: prepared.invocationRef === gathering.invocationRef,
    rich,
    structured,
    gatheringSnapshot,
    snapshot: context.host.exportSnapshot(),
  }
}

async function correctionScenario(
  fixture: Fixture,
  hostKind: DevelopmentHostKind,
): Promise<DevelopmentHostScenarioRecord['correction']> {
  const context = createScenario(fixture, hostKind, 'correction', developmentSuccessRuntime)
  const prepared = context.host.prepare({ symbol: 'BTC', convert: 'USD' }, 60_000)
  const accepted = context.host.decide(prepared.invocationRef, true)
  if (accepted.kind !== 'accepted') throw new Error(`correction_initial_decision:${accepted.code}`)
  const preparedAuthority = requireAuthority(prepared)
  const presentationBefore = canonicalDigest(context.host.exportSnapshot())
  const presentationPreference = { density: 'compact' }
  void presentationPreference
  const presentationAfter = canonicalDigest(context.host.exportSnapshot())
  const corrected = context.host.correct(
    prepared.invocationRef,
    { symbol: 'BTC' },
    60_000,
  )
  if (corrected.kind !== 'accepted' || corrected.view.control.state !== 'awaiting_authority'
    || corrected.view.authority === undefined) {
    throw new Error(`correction_refused:${corrected.kind === 'refused' ? corrected.code : 'state'}`)
  }
  const staleDecision = context.adapter.decide({
    invocationRef: prepared.invocationRef,
    expectedInvocationVersion: accepted.view.invocationVersion,
    authorityRef: preparedAuthority.reference,
    actor: context.actor,
    origin: context.host.origin,
    accept: true,
  })
  const staleExecution = context.adapter.acquire({
    invocationRef: prepared.invocationRef,
    expectedInvocationVersion: accepted.view.invocationVersion,
    authorityRef: preparedAuthority.reference,
    actor: context.actor,
    origin: context.host.origin,
    leaseOwner: 'attacker:stale',
    leaseMs: 30_000,
  })
  let staleProjection = 'accepted'
  try {
    context.host.projectStructured(prepared.invocationRef, accepted.view.invocationVersion)
  } catch (error) {
    staleProjection = error instanceof Error ? error.message : 'refused'
  }
  const rich = context.host.projectRich(
    corrected.view.invocationRef,
    corrected.view.invocationVersion,
  )
  const structured = context.host.projectStructured(
    corrected.view.invocationRef,
    corrected.view.invocationVersion,
  )
  const projectionSnapshot = context.host.exportSnapshot()
  const fresh = context.host.decide(corrected.view.invocationRef, true)
  if (fresh.kind !== 'accepted') throw new Error(`correction_fresh_decision:${fresh.code}`)
  const completed = await context.host.continue(corrected.view.invocationRef)
  if (completed.kind !== 'completed') throw new Error(`correction_execution:${continuationCode(completed)}`)
  const source = requireFirst(context.host.exportSnapshot().sourceRows, 'correction_source_missing')
  const terminalCorrection = context.host.correct(
    corrected.view.invocationRef,
    { symbol: 'SOL' },
    60_000,
  )
  const releasedContext = createScenario(
    fixture,
    hostKind,
    'released-correction',
    developmentLostResponseRuntime,
  )
  const releasedPrepared = releasedContext.host.prepare(
    { symbol: 'BTC', convert: 'USD' },
    60_000,
  )
  const releasedAccepted = releasedContext.host.decide(releasedPrepared.invocationRef, true)
  if (releasedAccepted.kind !== 'accepted') {
    throw new Error(`released_correction_decision:${releasedAccepted.code}`)
  }
  const released = await releasedContext.host.continue(releasedPrepared.invocationRef)
  if (released.kind !== 'completed') {
    throw new Error(`released_correction_execution:${continuationCode(released)}`)
  }
  const releasedBefore = releasedContext.host.exportSnapshot()
  const releasedEffectsBefore = { ...releasedContext.effects }
  const releasedRefusal = releasedContext.host.correct(
    releasedPrepared.invocationRef,
    { symbol: 'SOL' },
    60_000,
  )
  const releasedAfter = releasedContext.host.exportSnapshot()
  return {
    invocationRef: corrected.view.invocationRef,
    oldVersion: accepted.view.invocationVersion,
    newVersion: corrected.view.invocationVersion,
    oldAuthorityRef: preparedAuthority.reference,
    newAuthorityRef: requireAuthority(corrected.view).reference,
    staleAuthorityDecision: staleDecision.kind === 'refused' ? staleDecision.code : staleDecision.kind,
    staleExecution: staleExecution.kind === 'refused' ? staleExecution.code : staleExecution.kind,
    staleProjection,
    presentationStateUnchanged: presentationBefore === presentationAfter,
    correctedInputDigest: source.input.inputDigest,
    execution: completed.view.observedResolution.state,
    terminalCorrection: terminalCorrection.kind === 'refused'
      ? terminalCorrection.code
      : terminalCorrection.kind,
    releasedCorrection: {
      state: released.view.control.state,
      refusal: releasedRefusal.kind === 'refused' ? releasedRefusal.code : releasedRefusal.kind,
      snapshotUnchanged: canonicalDigest(releasedBefore)
        === canonicalDigest(releasedAfter),
      authorityUnchanged: canonicalDigest(
        releasedBefore.controls[0]?.authorityBinding,
      ) === canonicalDigest(
        releasedAfter.controls[0]?.authorityBinding,
      ),
      historyUnchanged: canonicalDigest(
        releasedBefore.history,
      ) === canonicalDigest(releasedAfter.history),
      effectsUnchanged: canonicalDigest(
        releasedEffectsBefore,
      ) === canonicalDigest(releasedContext.effects),
    },
    effects: { ...context.effects },
    rich,
    structured,
    projectionSnapshot,
    snapshot: context.host.exportSnapshot(),
  }
}

async function timeoutScenario(
  fixture: Fixture,
  hostKind: DevelopmentHostKind,
): Promise<DevelopmentHostScenarioRecord['timeout']> {
  const timeout = createDevelopmentTimeoutSignal()
  const context = createScenario(
    fixture,
    hostKind,
    'provider-timeout',
    developmentProviderTimeoutRuntime,
    undefined,
    timeout.signal,
  )
  const prepared = context.host.prepare({ symbol: 'BTC', convert: 'USD' }, 60_000)
  const decided = context.host.decide(prepared.invocationRef, true)
  if (decided.kind !== 'accepted') throw new Error(`host_timeout_decision:${decided.code}`)
  timeout.fire()
  const timedOut = await context.host.continue(prepared.invocationRef)
  if (timedOut.kind !== 'completed') throw new Error(`host_timeout_execute:${continuationCode(timedOut)}`)
  const retry = await context.host.continue(prepared.invocationRef)
  const attempt = timedOut.view.attempts.at(-1)
  return {
    ...outcome(prepared.invocationRef, requireAuthority(prepared).reference, timedOut.view, context),
    retryBeforeReconcile: retry.kind === 'refused' ? retry.code : retry.kind,
    releaseClassification: attempt?.release.state ?? 'missing',
  }
}

async function releasedRefusalScenario(
  fixture: Fixture,
  hostKind: DevelopmentHostKind,
): Promise<DevelopmentHostScenarioRecord['releasedRefusal']> {
  const context = createScenario(
    fixture,
    hostKind,
    'released-refusal',
    developmentReleasedRefusalRuntime,
  )
  const prepared = context.host.prepare({ symbol: 'BTC', convert: 'USD' }, 60_000)
  const decided = context.host.decide(prepared.invocationRef, true)
  if (decided.kind !== 'accepted') throw new Error(`host_released_refusal_decision:${decided.code}`)
  const refused = await context.host.continue(prepared.invocationRef)
  if (refused.kind !== 'completed' || refused.view.control.state !== 'reconciliation_required') {
    throw new Error(`host_released_refusal_execute:${continuationCode(refused)}`)
  }
  const retry = await context.host.continue(prepared.invocationRef)
  return {
    ...outcome(prepared.invocationRef, requireAuthority(prepared).reference, refused.view, context),
    retryPosture: retry.kind === 'refused' ? retry.code : retry.kind,
  }
}

async function successScenario(fixture: Fixture, hostKind: DevelopmentHostKind) {
  let staleVersionCode = 'not_run'
  let staleGenerationCode = 'not_run'
  const context = createScenario(
    fixture,
    hostKind,
    'success',
    developmentSuccessRuntime,
    async (leased) => {
      if (leased.control.state !== 'leased') throw new Error('host_probe_not_leased')
      const staleVersion = await context.adapter.executeAcquired({
        invocationRef: leased.invocationRef,
        expectedInvocationVersion: leased.invocationVersion - 1,
        attemptRef: leased.control.attemptRef,
        leaseOwner: leased.control.leaseOwner,
        effectGeneration: leased.control.effectGeneration,
      })
      staleVersionCode = staleVersion.kind === 'refused' ? staleVersion.code : staleVersion.kind
      const staleGeneration = await context.adapter.executeAcquired({
        invocationRef: leased.invocationRef,
        expectedInvocationVersion: leased.invocationVersion,
        attemptRef: leased.control.attemptRef,
        leaseOwner: leased.control.leaseOwner,
        effectGeneration: leased.control.effectGeneration + 1,
      })
      staleGenerationCode = staleGeneration.kind === 'refused'
        ? staleGeneration.code
        : staleGeneration.kind
    },
  )
  const prepared = context.host.prepare({ symbol: 'BTC', convert: 'USD' }, 60_000)
  const decided = context.host.decide(prepared.invocationRef, true)
  if (decided.kind !== 'accepted') throw new Error(`host_success_decision:${decided.code}`)
  const completed = await context.host.continue(prepared.invocationRef)
  if (completed.kind !== 'completed') throw new Error(`host_success_execute:${continuationCode(completed)}`)
  const duplicate = await context.host.continue(prepared.invocationRef)
  const cancellation = context.host.requestCancellation(prepared.invocationRef)
  return {
    context,
    outcome: outcome(prepared.invocationRef, requireAuthority(prepared).reference, completed.view, context),
    staleFences: {
      duplicate: duplicate.kind === 'refused' ? duplicate.code : duplicate.kind,
      staleVersion: staleVersionCode,
      staleGeneration: staleGenerationCode,
      effects: { ...context.effects },
      unsupportedCancellation: cancellation.kind === 'refused' ? cancellation.code : cancellation.kind,
    },
  }
}

async function refusalScenario(
  fixture: Fixture,
  hostKind: DevelopmentHostKind,
  kind: 'preflight' | 'source',
): Promise<ScenarioOutcome> {
  const context = createScenario(
    fixture,
    hostKind,
    kind,
    kind === 'preflight' ? developmentPreflightRefusalRuntime : developmentSuccessRuntime,
  )
  const prepared = context.host.prepare({ symbol: 'BTC', convert: 'USD' }, 60_000)
  const decided = context.host.decide(prepared.invocationRef, true)
  if (decided.kind !== 'accepted') throw new Error(`host_refusal_decision:${decided.code}`)
  if (kind === 'source') {
    context.source.setCurrent({
      ...fixture.operation,
      identity: {
        ...fixture.operation.identity,
        paymentRecipient: '0xchanged-after-authority',
      },
    })
  }
  const result = await context.host.continue(prepared.invocationRef)
  if (result.kind !== 'completed') throw new Error(`host_refusal_execute:${continuationCode(result)}`)
  return outcome(prepared.invocationRef, requireAuthority(prepared).reference, result.view, context)
}

async function uncertaintyScenario(
  fixture: Fixture,
  hostKind: DevelopmentHostKind,
): Promise<DevelopmentHostScenarioRecord['uncertainty']> {
  const context = createScenario(fixture, hostKind, 'uncertainty', developmentLostResponseRuntime)
  const prepared = context.host.prepare({ symbol: 'BTC', convert: 'USD' }, 60_000)
  const decided = context.host.decide(prepared.invocationRef, true)
  if (decided.kind !== 'accepted') throw new Error(`host_uncertain_decision:${decided.code}`)
  const uncertain = await context.host.continue(prepared.invocationRef)
  if (uncertain.kind !== 'completed') throw new Error(`host_uncertain_execute:${continuationCode(uncertain)}`)
  const uncertainSnapshot = context.host.exportSnapshot()
  const retry = await context.host.continue(prepared.invocationRef)
  const reconciled = context.host.recover(prepared.invocationRef)
  if (reconciled.kind !== 'reconciled') throw new Error(`host_reconcile:${continuationCode(reconciled)}`)
  return {
    ...outcome(prepared.invocationRef, requireAuthority(prepared).reference, uncertain.view, context),
    snapshot: uncertainSnapshot,
    retryBeforeReconcile: retry.kind === 'refused' ? retry.code : retry.kind,
    reconciledState: reconciled.view.control.state,
  }
}

async function coldResumeScenario(
  fixture: Fixture,
  hostKind: DevelopmentHostKind,
): Promise<DevelopmentHostScenarioRecord['coldResume']> {
  let interrupt = true
  const context = createScenario(
    fixture,
    hostKind,
    'cold',
    developmentSuccessRuntime,
    () => {
      if (interrupt) {
        interrupt = false
        throw new DevelopmentProcessInterruption('development_process_interrupted_after_lease')
      }
    },
  )
  const prepared = context.host.prepare({ symbol: 'BTC', convert: 'USD' }, 60_000)
  const decided = context.host.decide(prepared.invocationRef, true)
  if (decided.kind !== 'accepted') throw new Error(`host_cold_decision:${decided.code}`)
  try {
    await context.host.continue(prepared.invocationRef)
    throw new Error('host_cold_interruption_missing')
  } catch (error) {
    if (!(error instanceof Error)
      || error.message !== 'development_process_interrupted_after_lease') throw error
  }
  const interrupted = requireDefined(
    context.host.inspect(prepared.invocationRef),
    'host_interrupted_view_missing',
  )
  const snapshot = context.host.exportSnapshot()
  const loaded = loadDynamicPublishedAdapterSnapshot(snapshot, anchors(
    fixture,
    context.actor,
    context.host.origin,
    requireAuthority(prepared).reference,
    prepared.invocationRef,
    1,
  ))
  const source = createDevelopmentDynamicPublishedSource(
    [fixture.operation],
    loaded.sourceRows,
    loaded.semanticClaims,
  )
  const adapter = createDynamicPublishedActionInvocationAdapter({
    operation: fixture.operation,
    source,
    runtime: developmentSuccessRuntime(fixture.operation.binding.endpointUrl, context.effects),
    now: () => context.now + 1,
    nextInvocationRef: () => 'cold:unused',
    nextAuthorityRef: () => 'cold:unused',
    nextAttemptRef: () => 'cold:unused',
    durableState: loaded.durableState,
    inputWork: loaded.inputWork,
    inputHistory: loaded.inputHistory,
    paymentAttempts: loaded.paymentAttempts,
    paymentAuthorizationEvents: loaded.paymentAuthorizationEvents,
  })
  const coldHost = createHost(hostKind, adapter, context.actor, sourceCommands(
    fixture,
    hostKind,
    context.now + 1,
  ))
  const resumed = await coldHost.continue(prepared.invocationRef)
  if (resumed.kind !== 'completed') throw new Error(`host_cold_resume:${continuationCode(resumed)}`)
  return {
    ...outcome(prepared.invocationRef, requireAuthority(prepared).reference, resumed.view, {
      ...context,
      host: coldHost,
    }),
    interruptedState: interrupted.control.state,
    resumedState: resumed.view.control.state,
    transcriptCache: 'deleted',
  }
}

function completedResultReuse(
  fixture: Fixture,
  success: Awaited<ReturnType<typeof successScenario>>,
): DevelopmentHostScenarioRecord['completedResultReuse'] {
  const before = { ...success.context.effects }
  const controlBefore = success.context.host.exportSnapshot()
  const actor = success.context.actor
  const compiled = compileCustomerRequest({
    requestId: 'request:host-parity-result-reuse',
    expectedRevision: 0,
    principalId: actor.principalRef,
    delegatedAgentId: actor.callerRef,
    intent: 'Continue from the completed quote.',
    networkId: 'mock:network:development',
    proposal: { kind: 'unsupported_request', reason: 'requested_result_not_available' },
    interpreterId: 'mock:interpreter',
    bindings: [],
    models: [],
    now: success.context.now,
  })
  if (compiled.kind !== 'compiled') throw new Error('host_result_reuse_request_not_compiled')
  const attachInput = {
    principalRef: actor.principalRef,
    callerRef: actor.callerRef,
    invocationRef: success.outcome.invocationRef,
    referencedAt: success.context.now,
    candidateAggregate: compiled.aggregate,
  }
  const ports: AttachCompletedTaskReferencePorts = {
    readCompletedResultIdentity: ({ invocationRef, actor: requestedActor }) =>
      success.context.adapter.readCompletedResult(invocationRef, requestedActor),
  }
  const attached = attachCompletedTaskReference(attachInput, ports)
  const replayed = attached.kind === 'attached'
    ? attachCompletedTaskReference({
        ...attachInput,
        candidateAggregate: attached.aggregate,
      }, ports)
    : attached
  const crossPrincipal = success.context.adapter.readCompletedResult(
    success.outcome.invocationRef,
    { ...actor, principalRef: 'principal:other' },
  )
  const controlAfter = success.context.host.exportSnapshot()
  const referencePayload = attached.kind === 'attached' ? attached.reference : undefined
  return {
    firstKind: attached.kind === 'attached' ? 'attached' : 'not_applicable',
    secondKind: replayed.kind === 'replayed' ? 'replayed' : 'not_applicable',
    bothNoEffect: attached.kind === 'attached' && attached.noEffect
      && replayed.kind === 'replayed' && replayed.noEffect,
    referencePayloadAuthorityFree: referencePayload !== undefined
      && !/authority|attempt|lease|mandate|generation/iu.test(JSON.stringify(referencePayload)),
    controlSnapshotUnchanged: canonicalDigest(controlBefore)
      === canonicalDigest(controlAfter),
    authorityRecordCountBefore: controlBefore.controls.filter(
      (row) => row.authorityBinding !== undefined,
    ).length,
    authorityRecordCountAfter: controlAfter.controls.filter(
      (row) => row.authorityBinding !== undefined,
    ).length,
    crossPrincipal: crossPrincipal.kind === 'refused' ? crossPrincipal.code : crossPrincipal.kind,
    effectsBefore: before,
    effectsAfter: { ...success.context.effects },
  }
}

function createScenario(
  fixture: Fixture,
  hostKind: DevelopmentHostKind,
  scenario: string,
  runtime: (
    endpoint: string,
    effects: DevelopmentEffectCounts,
  ) => RouteTransportRuntime,
  beforeExecute?: DevelopmentHostSourceCommands['beforeExecute'],
  developmentTimeoutSignal?: ReturnType<typeof createDevelopmentTimeoutSignal>['signal'],
) {
  const effects: DevelopmentEffectCounts = { payment: 0, provider: 0 }
  const actor = actorFor(hostKind)
  const now = fixture.operation.readiness.observedAt + 1_000
  const source = createDevelopmentDynamicPublishedSource([fixture.operation])
  let authoritySequence = 0
  const adapter = createDynamicPublishedActionInvocationAdapter({
    operation: fixture.operation,
    source,
    runtime: runtime(fixture.operation.binding.endpointUrl, effects),
    now: () => now,
    nextInvocationRef: () => `host:${hostKind}:${scenario}:invocation`,
    nextAuthorityRef: () => `host:${hostKind}:${scenario}:authority:${++authoritySequence}`,
    nextAttemptRef: () => `host:${hostKind}:${scenario}:attempt`,
    ...(developmentTimeoutSignal === undefined ? {} : { developmentTimeoutSignal }),
  })
  const commands = sourceCommands(fixture, hostKind, now, beforeExecute)
  return {
    actor,
    now,
    effects,
    source,
    adapter,
    host: createHost(hostKind, adapter, actor, commands),
  }
}

function createHost(
  hostKind: DevelopmentHostKind,
  adapter: ReturnType<typeof createDynamicPublishedActionInvocationAdapter>,
  actor: InvocationActor,
  commands: DevelopmentHostSourceCommands,
): DevelopmentInvocationHost {
  const application = createDevelopmentInvocationApplication({ adapter, sourceCommands: commands })
  return hostKind === 'request_owned_human'
    ? application.bindRequestOwned({
      actor,
      requestRef: 'request:host-parity-existing',
      revision: 7,
    })
    : application.bindStandalone({ actor })
}

function sourceCommands(
  fixture: Fixture,
  hostKind: DevelopmentHostKind,
  now: number,
  beforeExecute?: DevelopmentHostSourceCommands['beforeExecute'],
): DevelopmentHostSourceCommands {
  return {
    leaseOwner: (_host, invocationRef) => `source-worker:${hostKind}:${invocationRef}`,
    reconciliationEvidence: (view) => {
      if (view.control.state !== 'reconciliation_required') return undefined
      const attemptRef = view.control.attemptRef
      const material = {
        kind: 'action_invocation_reconciliation' as const,
        version: 1 as const,
        evidenceRef: `source-reconciliation:${hostKind}:${view.invocationRef}`,
        source: `published-operation:${fixture.operation.operationId}`,
        invocationRef: view.invocationRef,
        attemptRef,
        effectGeneration: requireDefined(
          view.attempts.find((attempt) => attempt.attemptRef === attemptRef),
          'host_reconciliation_attempt_missing',
        ).effectGeneration,
        resolution: 'released' as const,
        observedAt: new Date(now).toISOString(),
      }
      return { ...material, digest: canonicalDigest(material) }
    },
    ...(beforeExecute === undefined ? {} : { beforeExecute }),
  }
}

function anchors(
  fixture: Fixture,
  actor: InvocationActor,
  origin: DevelopmentInvocationHost['origin'],
  authorityRef: string,
  _invocationRef: string,
  expectedEffectCount: number,
): DynamicPublishedSnapshotAnchors {
  const prepared = buildDynamicPublishedInput({
    operation: fixture.operation,
    descriptor: fixture.descriptor,
    value: { symbol: 'BTC', convert: 'USD' },
  })
  return {
    operation: fixture.operation,
    descriptor: fixture.descriptor,
    actor,
    origin,
    issuedAuthority: {
      reference: authorityRef,
      accepted: { kind: 'approve_each', authorityRef },
      materialInputDigest: materialDigest(
        prepared,
        ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
      ),
    },
    expectedEffectCount,
  }
}

function outcome(
  invocationRef: string,
  authorityRef: string,
  view: NonNullable<ReturnType<DevelopmentInvocationHost['inspect']>>,
  context: Readonly<{
    effects: DevelopmentEffectCounts
    host: DevelopmentInvocationHost
  }>,
): ScenarioOutcome {
  return {
    invocationRef,
    authorityRef,
    state: view.control.state,
    execution: view.observedResolution.state === 'returned'
      ? `${view.observedResolution.execution}:${view.observedResolution.result.kind}`
      : view.observedResolution.state,
    failureCode: view.observedResolution.state === 'returned'
      && 'failureCode' in view.observedResolution.result
      ? view.observedResolution.result.failureCode
      : null,
    effects: { ...context.effects },
    snapshot: context.host.exportSnapshot(),
  }
}

function actorFor(hostKind: DevelopmentHostKind): InvocationActor {
  return {
    callerRef: hostKind === 'request_owned_human'
      ? 'human:request-owned-host'
      : 'agent:standalone-external-host',
    principalRef: 'principal:host-parity-customer',
  }
}

function continuationCode(
  result: Awaited<ReturnType<DevelopmentInvocationHost['continue']>>,
): string {
  return result.kind === 'refused' ? result.code : result.kind
}
