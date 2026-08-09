import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentReleaseSignal,
  createDurableActionInvocationTracer,
  type ActionInvocationOrigin,
  type ActionInvocationView,
  type PreparedInvocation,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { TransferBoundaryEvent } from '@/modules/action-invocation/transfer-evaluator'
import {
  collectSuppliedCandidateQuoteAction,
  prepareSuppliedCandidateQuote,
  type SuppliedCandidateQuoteInput,
  type SuppliedCandidateQuoteResult,
} from './server'
import {
  createDevelopmentEvidenceVerifier,
  developmentEvidenceActor as actor,
  developmentEvidenceNow as now,
  developmentEvidenceNowMs as nowMs,
} from './development-evidence-fixture'

type DurableState = ReturnType<typeof createDevelopmentDurableState<SuppliedCandidateQuoteResult>>
type DurablePort = ReturnType<typeof createDevelopmentDurablePort<SuppliedCandidateQuoteResult>>

function requireInvocationFixture<T>(value: T | undefined, errorCode: string): T {
  if (value === undefined) throw new Error(errorCode)
  return value
}

export type DevelopmentInvocationEvidence = Readonly<{
  views: readonly ActionInvocationView<SuppliedCandidateQuoteResult>[]
  standalone: Readonly<{
    state: DurableState
    port: DurablePort
    result: SuppliedCandidateQuoteResult
    sourceResultRef: string
    sourceInput: SuppliedCandidateQuoteInput
    sourcePrepared: PreparedInvocation
    effectCalls: number
    events: readonly TransferBoundaryEvent[]
  }>
  recovery: Readonly<{
    before: ActionInvocationView<SuppliedCandidateQuoteResult>['control']
    release: ActionInvocationView<SuppliedCandidateQuoteResult>['attempts'][number]['release']
    coldContinuation: ActionInvocationView<SuppliedCandidateQuoteResult>['control']
    evidence: Readonly<{ reference: string; source: string; resolution: string }>
    after: ActionInvocationView<SuppliedCandidateQuoteResult>['control']
  }>
}>

export async function runDevelopmentInvocations(
  graph: Parameters<typeof prepareSuppliedCandidateQuote>[0]['qualificationPorts'],
  input: SuppliedCandidateQuoteInput,
): Promise<DevelopmentInvocationEvidence> {
  const origins: ActionInvocationOrigin[] = [
    { kind: 'request_owned', requestRef: 'mock:request:owned', revision: 1 },
    { kind: 'standalone', callerRef: actor.callerRef, principalRef: actor.principalRef },
  ]
  const views: ActionInvocationView<SuppliedCandidateQuoteResult>[] = []
  let standalone: DevelopmentInvocationEvidence['standalone'] | undefined
  for (const origin of origins) {
    const state = createDevelopmentDurableState<SuppliedCandidateQuoteResult>()
    const port = createDevelopmentDurablePort(state)
    const release = createDevelopmentReleaseSignal()
    const events: TransferBoundaryEvent[] = []
    let effectCalls = 0
    const result: SuppliedCandidateQuoteResult = {
      kind: 'quote_returned', environment: 'MOCK/DEVELOPMENT ONLY',
      quote: {
        quoteRef: `mock:quote:${origin.kind}`,
        price: { currency: 'AUD', units: '24500', exponent: 2 },
        validUntil: nowMs + 3_600_000,
        terms: ['Fixture only; no provider commitment or fulfilment.'],
        evidenceRefs: [`mock:evidence:${origin.kind}`],
      },
    }
    const source = {
      input,
      context: {
        developmentOnlySuppliedQuoteAdapter: async () => {
          effectCalls += 1
          events.push({ kind: 'direct_runner_started', actionId: collectSuppliedCandidateQuoteAction.id })
          events.push({ kind: 'effect_call', actionId: collectSuppliedCandidateQuoteAction.id })
          release.markReleased()
          events.push({ kind: 'direct_runner_returned', actionId: collectSuppliedCandidateQuoteAction.id, outcome: result.kind })
          return result
        },
        developmentOnlySuppliedQuoteQualificationPorts: graph,
        developmentOnlySuppliedQuoteNow: () => nowMs,
      },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' } as ActionInvocationView<SuppliedCandidateQuoteResult>['observedResolution'],
      resultIdentity: {
        sourceResultRef: `mock:source-result:${origin.kind}`,
        resultDigest: canonicalDigest(result),
      },
    }
    const tracer = createDurableActionInvocationTracer({
      action: collectSuppliedCandidateQuoteAction, port, now,
      nextInvocationRef: () => `mock:invocation:${origin.kind}`,
      nextAuthorityRef: () => `mock:authority:${origin.kind}`,
      nextAttemptRef: () => `mock:attempt:${origin.kind}`,
      developmentReleaseSignal: release, resolveSourceState: () => source,
    })
    const prepared = await prepareSuppliedCandidateQuote({
      tracer, qualificationPorts: graph, invocationInput: input,
      origin, actor, context: source.context, now: () => nowMs,
    })
    if (prepared.kind !== 'prepared') throw new Error(prepared.code)
    const preparedState = prepared.view.prepared
    if (preparedState === undefined) throw new Error('prepared_invocation_state_missing')
    const preparedAuthority = requireInvocationFixture(
      prepared.view.authority,
      'prepared_invocation_authority_missing',
    )
    source.prepared = preparedState
    const decided = await tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: preparedAuthority.reference, actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    events.push({ kind: 'approval_policy', policy: 'prompt', reason: 'exact invocation authority' })
    events.push({ kind: 'action_invocation', invocationRef: prepared.view.invocationRef })
    const executed = await tracer.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: preparedAuthority.reference, actor, origin, materialInput: input,
    })
    if (executed.kind !== 'accepted') throw new Error(executed.code)
    source.observedResolution = executed.view.observedResolution
    const cold = await tracer.coldResume(prepared.view.invocationRef)
    const coldView = cold.inspect(prepared.view.invocationRef)
    if (coldView === undefined) throw new Error('cold_resume_invocation_view_missing')
    views.push(coldView)
    if (origin.kind === 'standalone') {
      standalone = {
        state, port, result, sourceResultRef: source.resultIdentity.sourceResultRef,
        sourceInput: input, sourcePrepared: preparedState, effectCalls, events,
      }
    }
  }
  const recoveryOrigin = origins[1]
  if (recoveryOrigin === undefined) throw new Error('recovery_origin_missing')
  if (standalone === undefined) throw new Error('standalone_scenario_missing')
  return {
    views,
    standalone,
    recovery: await runRecovery(graph, input, recoveryOrigin),
  }
}

async function runRecovery(
  graph: Parameters<typeof prepareSuppliedCandidateQuote>[0]['qualificationPorts'],
  input: SuppliedCandidateQuoteInput,
  origin: ActionInvocationOrigin,
): Promise<DevelopmentInvocationEvidence['recovery']> {
  const state = createDevelopmentDurableState<SuppliedCandidateQuoteResult>()
  const port = createDevelopmentDurablePort(state)
  const release = createDevelopmentReleaseSignal()
  const verifier = createDevelopmentEvidenceVerifier()
  const source = {
    input,
    context: {
      developmentOnlySuppliedQuoteAdapter: async () => {
        release.markReleased()
        throw new Error('mock_response_lost_after_possible_release')
      },
      developmentOnlySuppliedQuoteQualificationPorts: graph,
      developmentOnlySuppliedQuoteNow: () => nowMs,
    },
    prepared: undefined as PreparedInvocation | undefined,
    observedResolution: { state: 'pending' } as ActionInvocationView<SuppliedCandidateQuoteResult>['observedResolution'],
  }
  const create = () => createDurableActionInvocationTracer({
    action: collectSuppliedCandidateQuoteAction, port, now,
    nextInvocationRef: () => 'mock:invocation:recovery',
    nextAuthorityRef: () => 'mock:authority:recovery',
    nextAttemptRef: () => 'mock:attempt:recovery',
    developmentReleaseSignal: release,
    verifyReconciliationEvidence: verifier.verify,
    resolveSourceState: () => source,
  })
  const first = create()
  const prepared = await prepareSuppliedCandidateQuote({
    tracer: first, qualificationPorts: graph, invocationInput: input,
    origin, actor, context: source.context, now: () => nowMs,
  })
  if (prepared.kind !== 'prepared') throw new Error(prepared.code)
  const recoveryPreparedState = requireInvocationFixture(
    prepared.view.prepared,
    'recovery_prepared_invocation_state_missing',
  )
  const recoveryPreparedAuthority = requireInvocationFixture(
    prepared.view.authority,
    'recovery_prepared_invocation_authority_missing',
  )
  source.prepared = recoveryPreparedState
  const decided = await first.decide({
    invocationRef: prepared.view.invocationRef,
    expectedInvocationVersion: prepared.view.invocationVersion,
    authorityRef: recoveryPreparedAuthority.reference, actor, origin, accept: true,
  })
  if (decided.kind !== 'accepted') throw new Error(decided.code)
  const uncertain = await first.execute({
    invocationRef: prepared.view.invocationRef,
    expectedInvocationVersion: decided.view.invocationVersion,
    authorityRef: recoveryPreparedAuthority.reference, actor, origin, materialInput: input,
  })
  if (uncertain.kind !== 'accepted') throw new Error(uncertain.code)
  source.observedResolution = uncertain.view.observedResolution
  const cold = await first.coldResume(uncertain.view.invocationRef)
  const coldView = cold.inspect(uncertain.view.invocationRef)
  if (coldView === undefined) throw new Error('recovery_cold_view_missing')
  const coldContinuation = coldView.control
  const attempt = uncertain.view.attempts[0]
  if (attempt === undefined) throw new Error('recovery_attempt_missing')
  const evidence = verifier.issue({
    kind: 'action_invocation_reconciliation', version: 1,
    evidenceRef: 'mock:evidence:reconciliation',
    source: 'supply.collectDevelopmentQuote:provider-observer:v1',
    invocationRef: uncertain.view.invocationRef, attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration, resolution: 'released', observedAt: now(),
  })
  const reconciled = await cold.reconcile({
    invocationRef: uncertain.view.invocationRef,
    expectedInvocationVersion: uncertain.view.invocationVersion,
    attemptRef: attempt.attemptRef, actor, origin, evidence,
  })
  if (reconciled.kind !== 'accepted') throw new Error(reconciled.code)
  return {
    before: uncertain.view.control, release: attempt.release, coldContinuation,
    evidence: { reference: evidence.evidenceRef, source: evidence.source, resolution: evidence.resolution },
    after: reconciled.view.control,
  }
}
