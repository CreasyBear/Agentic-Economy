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
        price: { amountMinor: 24_500, currency: 'AUD' },
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
    source.prepared = prepared.view.prepared
    const decided = tracer.decide({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: prepared.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference, actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    events.push({ kind: 'approval_policy', policy: 'prompt', reason: 'exact invocation authority' })
    events.push({ kind: 'action_invocation', invocationRef: prepared.view.invocationRef })
    const executed = await tracer.execute({
      invocationRef: prepared.view.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.view.authority!.reference, actor, origin, materialInput: input,
    })
    if (executed.kind !== 'accepted') throw new Error(executed.code)
    source.observedResolution = executed.view.observedResolution
    const cold = tracer.coldResume(prepared.view.invocationRef).inspect(prepared.view.invocationRef)!
    views.push(cold)
    if (origin.kind === 'standalone') {
      standalone = {
        state, port, result, sourceResultRef: source.resultIdentity.sourceResultRef,
        sourceInput: input, sourcePrepared: prepared.view.prepared!, effectCalls, events,
      }
    }
  }
  if (standalone === undefined) throw new Error('standalone_scenario_missing')
  return {
    views,
    standalone,
    recovery: await runRecovery(graph, input, origins[1]!),
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
  const create = (resume?: string) => createDurableActionInvocationTracer({
    action: collectSuppliedCandidateQuoteAction, port, now,
    nextInvocationRef: () => 'mock:invocation:recovery',
    nextAuthorityRef: () => 'mock:authority:recovery',
    nextAttemptRef: () => 'mock:attempt:recovery',
    developmentReleaseSignal: release,
    verifyReconciliationEvidence: verifier.verify,
    resolveSourceState: () => source,
  }, resume)
  const first = create()
  const prepared = await prepareSuppliedCandidateQuote({
    tracer: first, qualificationPorts: graph, invocationInput: input,
    origin, actor, context: source.context, now: () => nowMs,
  })
  if (prepared.kind !== 'prepared') throw new Error(prepared.code)
  source.prepared = prepared.view.prepared
  const decided = first.decide({
    invocationRef: prepared.view.invocationRef,
    expectedInvocationVersion: prepared.view.invocationVersion,
    authorityRef: prepared.view.authority!.reference, actor, origin, accept: true,
  })
  if (decided.kind !== 'accepted') throw new Error(decided.code)
  const uncertain = await first.execute({
    invocationRef: prepared.view.invocationRef,
    expectedInvocationVersion: decided.view.invocationVersion,
    authorityRef: prepared.view.authority!.reference, actor, origin, materialInput: input,
  })
  if (uncertain.kind !== 'accepted') throw new Error(uncertain.code)
  source.observedResolution = uncertain.view.observedResolution
  const cold = create(uncertain.view.invocationRef)
  const coldContinuation = structuredClone(cold.inspect(uncertain.view.invocationRef)!.control)
  const attempt = uncertain.view.attempts[0]!
  const evidence = verifier.issue({
    kind: 'action_invocation_reconciliation', version: 1,
    evidenceRef: 'mock:evidence:reconciliation',
    source: 'supply.collectDevelopmentQuote:provider-observer:v1',
    invocationRef: uncertain.view.invocationRef, attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration, resolution: 'released', observedAt: now(),
  })
  const reconciled = cold.reconcile({
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
