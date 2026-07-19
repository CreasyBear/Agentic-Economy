import {
  buildDynamicPublishedInput,
  createDevelopmentDynamicPublishedSource,
  createDynamicPublishedActionInvocationAdapter,
  createRequestOwnedDevelopmentHost,
  createStandaloneAgentDevelopmentHost,
  loadDynamicPublishedAdapterSnapshot,
  materialDigest,
  type DevelopmentHostKind,
  type DevelopmentHostSourceCommands,
  type DevelopmentInvocationHost,
  type DynamicPublishedAdapterSnapshot,
  type DynamicPublishedSnapshotAnchors,
  type InvocationActor,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  attachCompletedTaskReference,
} from '@/modules/customer-request/application/public'
import { compileCustomerRequest } from '@/modules/customer-request/compiler'

import {
  buildDevelopmentPublishedOperationEvidence,
} from './development-published-operation-evidence'
import {
  developmentLostResponseRuntime,
  developmentPreflightRefusalRuntime,
  developmentSuccessRuntime,
  type DevelopmentEffectCounts,
} from './development-host-scenario-runtime'

type Fixture = ReturnType<typeof buildDevelopmentPublishedOperationEvidence>

export type DevelopmentHostScenarioRecord = Readonly<{
  host: DevelopmentHostKind
  actor: InvocationActor
  success: ScenarioOutcome
  preflightRefusal: ScenarioOutcome
  sourceRefusal: ScenarioOutcome
  uncertainty: ScenarioOutcome & Readonly<{
    retryBeforeReconcile: string
    reconciledState: string
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
    kind: 'attached' | 'not_applicable'
    noEffect: boolean
    authorityInherited: false
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
    success: success.outcome,
    preflightRefusal: await refusalScenario(fixture, hostKind, 'preflight'),
    sourceRefusal: await refusalScenario(fixture, hostKind, 'source'),
    uncertainty: await uncertaintyScenario(fixture, hostKind),
    staleFences: success.staleFences,
    coldResume: await coldResumeScenario(fixture, hostKind),
    completedResultReuse: hostKind === 'standalone_external_agent'
      ? completedResultReuse(fixture, success)
      : {
          kind: 'not_applicable',
          noEffect: true,
          authorityInherited: false,
          crossPrincipal: 'not_applicable',
          effectsBefore: { ...success.outcome.effects },
          effectsAfter: { ...success.outcome.effects },
        },
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
    outcome: outcome(prepared.invocationRef, prepared.authority!.reference, completed.view, context),
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
  return outcome(prepared.invocationRef, prepared.authority!.reference, result.view, context)
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
    ...outcome(prepared.invocationRef, prepared.authority!.reference, uncertain.view, context),
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
        throw new Error('development_process_interrupted_after_lease')
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
  const interrupted = context.host.inspect(prepared.invocationRef)!
  const snapshot = JSON.parse(JSON.stringify(context.host.exportSnapshot()))
  const loaded = loadDynamicPublishedAdapterSnapshot(snapshot, anchors(
    fixture,
    context.actor,
    context.host.origin,
    prepared.authority!.reference,
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
  })
  const coldHost = createHost(hostKind, adapter, context.actor, sourceCommands(
    fixture,
    hostKind,
    context.now + 1,
  ))
  const resumed = await coldHost.continue(prepared.invocationRef)
  if (resumed.kind !== 'completed') throw new Error(`host_cold_resume:${continuationCode(resumed)}`)
  return {
    ...outcome(prepared.invocationRef, prepared.authority!.reference, resumed.view, {
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
  const attached = attachCompletedTaskReference({
    principalRef: actor.principalRef,
    callerRef: actor.callerRef,
    invocationRef: success.outcome.invocationRef,
    referencedAt: success.context.now,
    candidateAggregate: compiled.aggregate,
  }, {
    readCompletedResultIdentity: ({ invocationRef, actor: requestedActor }) =>
      success.context.adapter.readCompletedResult(invocationRef, requestedActor),
  })
  const crossPrincipal = success.context.adapter.readCompletedResult(
    success.outcome.invocationRef,
    { ...actor, principalRef: 'principal:other' },
  )
  return {
    kind: attached.kind === 'attached' ? 'attached' : 'not_applicable',
    noEffect: attached.kind === 'attached' && attached.noEffect,
    authorityInherited: false,
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
  ) => ReturnType<typeof developmentSuccessRuntime>,
  beforeExecute?: DevelopmentHostSourceCommands['beforeExecute'],
) {
  const effects: DevelopmentEffectCounts = { payment: 0, provider: 0 }
  const actor = actorFor(hostKind)
  const now = fixture.operation.readiness.observedAt + 1_000
  const source = createDevelopmentDynamicPublishedSource([fixture.operation])
  const adapter = createDynamicPublishedActionInvocationAdapter({
    operation: fixture.operation,
    source,
    runtime: runtime(fixture.operation.binding.endpointUrl, effects),
    now: () => now,
    nextInvocationRef: () => `host:${hostKind}:${scenario}:invocation`,
    nextAuthorityRef: () => `host:${hostKind}:${scenario}:authority`,
    nextAttemptRef: () => `host:${hostKind}:${scenario}:attempt`,
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
  return hostKind === 'request_owned_human'
    ? createRequestOwnedDevelopmentHost({
        adapter,
        actor,
        requestRef: 'request:host-parity-existing',
        revision: 7,
        sourceCommands: commands,
      })
    : createStandaloneAgentDevelopmentHost({ adapter, actor, sourceCommands: commands })
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
        effectGeneration: view.attempts.find(
          (attempt) => attempt.attemptRef === attemptRef,
        )!.effectGeneration,
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
