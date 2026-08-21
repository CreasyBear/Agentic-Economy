import {
  classifyAnswerRequestPreflight,
  type AnswerEvent,
  type AnswerPriorTurnContext,
} from '@/modules/answer/public'
import {
  convexKeylessExecutableSource,
} from '@/modules/capability-execution'
import type { HarnessRunLoopPhaseHandlers } from '@/modules/harness/public'
import {
  aeSearchContextLocationQuery,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import { buildAnswerTurnProblem } from '@/lib/errors'
import type { AnswerRunGateSummary } from '../answer-thread.schema'
import { safeWorkLogUserText } from './public-worklog'
import {
  collectLatestFrozenAllowedSlugs,
  collectLatestFrozenSelectedOperationRef,
  collectLatestFrozenProviders,
  readPriorCompleteTurns,
} from './answer-turn-evidence-freeze'
import { persistAnswerTurnWithResult } from './answer-turn-persist-result'
import { finalizeAnswerTurnSnapshot } from './answer-turn-safety'
import {
  latestPriorOperationPresentation,
  priorTurnOperation,
  priorTurnStatus,
  readPriorContinuationState,
  readPriorOperationInput,
  readPriorSearchContext,
} from './answer-continuation-state'
import { agentTurnPath } from './turns/agent'
import { boundaryTurnPath } from './turns/boundary'
import {
  makeCopyId,
  type TurnPathContext,
  type TurnPathResult,
  type TurnTimingCollector,
  type WorkStepEmitter,
} from './turns/types'
import { appendModelRequests } from './answer-turn-timing'
import { emitSnapshotWithAssembly } from './answer-turn-snapshots'
import {
  buildPersistAnswerTurnInput,
  reportStreamAnswerTurnPhase,
} from './answer-turn-persist'
import type { LiveAnswerHarnessOperation } from './answer-harness-operation'
import type {
  RuntimeAnswerRoute,
  StreamAnswerTurnInput,
  StreamAnswerTurnRuntimeState,
} from './turn-orchestrator'

export type CreateStreamAnswerTurnPhasesInput = {
  input: StreamAnswerTurnInput
  interpretStartedAt: number
  stopContextTiming: (
    metadata?: Record<string, string | number | boolean | null>,
  ) => void
  send: (event: AnswerEvent) => void
  timings: TurnTimingCollector
  workLog: WorkStepEmitter
  harness: LiveAnswerHarnessOperation
  stopLeaseHeartbeat: () => void
  turnPathContext: (
    state: StreamAnswerTurnRuntimeState,
    options?: { deferAssembly?: boolean },
  ) => TurnPathContext
  runAgentTurn: typeof agentTurnPath.run
  runBoundaryTurn: typeof boundaryTurnPath.run
}

function describeSearchContext(
  searchContext: AeSearchContext | undefined,
): string {
  if (searchContext?.mode === 'whole_catalogue') {
    return 'All available options'
  }
  return aeSearchContextLocationQuery(searchContext) ?? 'Your request'
}

function applyToolLedResult(
  state: StreamAnswerTurnRuntimeState,
  result: TurnPathResult | undefined,
): StreamAnswerTurnRuntimeState {
  if (result === undefined) {
    return state
  }

  return {
    ...state,
    captured: result.snapshot,
    errorCopyId: result.errorCopyId,
    ...(result.errorProblem === undefined
      ? {}
      : {
          errorProblem: result.errorProblem,
          errorProblemJson: JSON.stringify(result.errorProblem),
        }),
    toolCalls: result.toolCalls,
    ...(result.modelRequests === undefined
      ? {}
      : {
          modelRequests: appendModelRequests(
            state.modelRequests,
            result.modelRequests,
          ),
        }),
    allowedSlugs: result.allowedSlugs,
    ...(result.operationArtifacts === undefined
      ? {}
      : { operationArtifacts: result.operationArtifacts }),
    gate: result.gate,
    ...(result.assembly === undefined ? {} : { assembly: result.assembly }),
  }
}

export function createStreamAnswerTurnPhases(
  input: CreateStreamAnswerTurnPhasesInput,
): HarnessRunLoopPhaseHandlers<StreamAnswerTurnRuntimeState> {
  return {
    context: async ({ state }) => {
      if (state.resumeCheckpoint !== undefined) {
        return state
      }
      const priorTurns =
        input.input.preloadedPriorTurns === undefined
          ? await readPriorCompleteTurns(
              input.input.admission.threadId,
              input.input.sessionId,
            )
          : input.input.preloadedPriorTurns.filter(
              (turn) => turn.status === 'complete',
            )
      const priorContinuation = readPriorContinuationState(priorTurns)
      const priorContext: readonly AnswerPriorTurnContext[] = priorTurns.map(
        (turn) => {
          const operation = priorTurnOperation(turn)
          return {
            seq: turn.seq,
            query: turn.query,
            status: priorTurnStatus(turn),
            ...(operation === undefined ? {} : { operation }),
            ...(priorContinuation.source?.priorTurnId === turn.turnId
              && priorContinuation.pendingDecision !== undefined
              ? {
                  pendingDecision: {
                    kind: priorContinuation.pendingDecision.kind,
                    operationRef: priorContinuation.pendingDecision.operationRef,
                  },
                }
              : {}),
          }
        },
      )
      const querySafety = await (
        input.input.querySafetyClassifier ?? classifyAnswerRequestPreflight
      )({
        query: state.query,
        priorTurns: priorContext,
        ...(input.input.signal === undefined
          ? {}
          : { signal: input.input.signal }),
      })
      input.harness.recordModelRequest(querySafety.modelRequest)
      input.timings.record(
        'model.answer_request_preflight',
        querySafety.modelRequest.durationMs,
        {
          decision: querySafety.kind,
          ...(querySafety.kind === 'refused'
            ? { reason: querySafety.reason }
            : {}),
        },
      )
      const interpretation = querySafety.interpretation
      const priorOperationInput = readPriorOperationInput(priorTurns)
      const canReusePriorOperationInput =
        interpretation?.continuation === 'resolve_pending'
        || (
          interpretation?.route === 'operation'
          && interpretation.continuation === 'refine_prior_operation'
        )
      const priorOperationRef =
        collectLatestFrozenSelectedOperationRef(priorTurns)
      return {
        ...state,
        querySafety,
        ...(interpretation === undefined ? {} : { interpretation }),
        modelRequests: [querySafety.modelRequest],
        searchContext:
          querySafety.kind === 'refused'
            ? undefined
            : (input.input.searchContext ?? readPriorSearchContext(priorTurns)),
        priorTurns,
        priorTurnCount: priorTurns.length,
        ...(canReusePriorOperationInput && priorOperationInput !== undefined
          ? {
              priorOperationInput,
              ...(priorOperationRef === undefined ? {} : { priorOperationRef }),
            }
          : {}),
        ...(interpretation === undefined
          || interpretation.continuation === 'new'
          || priorContinuation.source === undefined
          ? {}
          : { continuationSource: priorContinuation.source }),
        ...(interpretation?.continuation !== 'resolve_pending'
          || priorContinuation.pendingDecision === undefined
          ? {}
          : { pendingDecision: priorContinuation.pendingDecision }),
      }
    },
    intent: ({ state }) => {
      if (state.resumeCheckpoint !== undefined) {
        return state
      }
      const intent = 'refine_search'

      input.stopContextTiming({
        priorTurns: state.priorTurns.length,
        accessTurnCount: state.priorTurnCount,
        intent,
        isNewThread: input.input.threadId === undefined,
      })
      input.workLog.emit({
        id: 'interpret.request',
        phase: 'interpret',
        status: 'complete',
        title: 'Reading your request',
        summary:
          state.priorTurnCount > 0
            ? 'Checking the latest answer to see whether this is a follow-up.'
            : 'Starting with this request.',
        detailRows: [
          ...(state.interpretation === undefined
            ? []
            : [
                {
                  label: 'Interpretation',
                  value: `${state.interpretation.route}/${state.interpretation.continuation}`,
                },
                {
                  label: 'Requested intents',
                  value: state.interpretation.requestedIntents
                    .map((intent) => intent.phrase)
                    .join(', '),
                },
              ]),
          { label: 'Request', value: safeWorkLogUserText(state.query) },
          { label: 'Earlier answers', value: String(state.priorTurnCount) },
          {
            label: 'Search area',
            value: describeSearchContext(state.searchContext),
          },
        ],
        startedAtMs: input.interpretStartedAt,
        completedAtMs: Date.now(),
      })
      return {
        ...state,
        intent,
        priorProviders: collectLatestFrozenProviders(state.priorTurns),
        priorAllowedSlugs: collectLatestFrozenAllowedSlugs(state.priorTurns),
      }
    },
    route: ({ state }) => {
      const route: RuntimeAnswerRoute =
        state.querySafety?.kind === 'refused'
          ? { kind: 'safety_refusal' }
          : {
              kind: 'tool_search',
              agent: {
                lane: 'operation',
                continuation: 'new',
                allowedReadToolFamily: 'shared',
                exactOperationDetailRequired: false,
                effectAllowed: true,
              },
            }
      return {
        ...state,
        route,
      }
    },
    retrieval: async ({ state }) => state,
    model: async ({ state }) => {
      if (
        state.captured !== undefined
        || state.errorCopyId !== undefined
        || state.errorProblem !== undefined
      ) {
        return state
      }

      const route = state.route
      if (route === undefined) {
        return state
      }
      switch (route.kind) {
        case 'safety_refusal':
          return applyToolLedResult(
            state,
            await input.runBoundaryTurn(
              input.turnPathContext(state),
              {
                kind: 'safety_refusal',
                safetyReason:
                  state.querySafety?.kind === 'refused'
                    ? state.querySafety.reason
                    : 'unsafe_request',
              },
            ),
          )
        case 'tool_search': {
          const seedToolCalls =
            state.resumeCheckpoint === undefined ? state.toolCalls : []
          const keylessExecutableSource =
            input.input.keylessExecutableSource ?? convexKeylessExecutableSource
          const priorOperationPresentation = latestPriorOperationPresentation(state.priorTurns)
          const result = await input.runAgentTurn(
            input.turnPathContext(state),
            {
              query: state.query,
              searchContext: state.searchContext,
              priorProviders: [],
              priorAllowedSlugs: [],
              effectiveRoute: route.agent,
              ...(state.priorOperationInput === undefined
                ? {}
                : {
                    priorOperationInput: state.priorOperationInput,
                    ...(state.priorOperationRef === undefined
                      ? {}
                      : { priorOperationRef: state.priorOperationRef }),
                  }),
              ...(state.priorOperationRef === undefined
              || priorOperationPresentation === undefined
                ? {}
                : { priorOperationPresentation }),
              keylessExecutableSource,
              ...(input.input.operationExecuteDeps === undefined
                ? {}
                : {
                    operationExecuteDeps:
                      input.input.operationExecuteDeps,
                  }),
            },
            seedToolCalls,
            undefined,
          )
          return applyToolLedResult(state, result)
        }
        default: {
          const _exhaustive: never = route
          return _exhaustive
        }
      }
    },
    gate: async ({ state }) => {
      let captured = state.captured
      let errorCopyId = state.errorCopyId
      let errorProblem = state.errorProblem
      let gate = state.gate
      const toolCalls = [...state.toolCalls]
      const allowedSlugs = state.allowedSlugs

      if (
        captured === undefined &&
        errorCopyId === undefined &&
        errorProblem === undefined
      ) {
        const copyId = makeCopyId()
        errorCopyId = copyId
        errorProblem = buildAnswerTurnProblem('answer_turn_failed')
      } else if (captured !== undefined) {
        const finalized = finalizeAnswerTurnSnapshot({
          snapshot: captured,
          allowedSlugs,
        })
        if (!finalized.ok) {
          captured = undefined
          errorCopyId = finalized.copyId
          errorProblem = buildAnswerTurnProblem(finalized.code)
          gate = finalized.gate
        } else {
          captured = finalized.snapshot
          gate = finalized.gate
        }
      }

      const finalTurnStatus = captured === undefined ? 'error' : 'complete'
      const finalGate =
        gate ??
        ({
          ok: finalTurnStatus === 'complete',
          source: 'turn_status',
          ...(finalTurnStatus === 'error' ? { code: 'turn_error' } : {}),
        } satisfies AnswerRunGateSummary)
      await input.harness.evaluateGate(finalGate, finalTurnStatus)

      return {
        ...state,
        captured,
        errorCopyId,
        ...(errorProblem === undefined
          ? {}
          : { errorProblem, errorProblemJson: JSON.stringify(errorProblem) }),
        toolCalls,
        allowedSlugs,
        gate,
        finalGate,
        finalTurnStatus,
      }
    },
    assemble: async ({ state }) => {
      if (
        state.captured === undefined ||
        state.assembly === undefined ||
        state.assembled
      ) {
        return state
      }
      await emitSnapshotWithAssembly(
        {
          signal: input.input.signal,
          send: input.send,
          timings: input.timings,
          workLog: input.workLog,
        },
        state.captured,
        state.assembly.path,
        state.assembly.metadata ?? {},
      )
      return { ...state, assembled: true }
    },
    persist: async ({ state }) => {
      input.timings.record('turn.persistence_prepare', 0)
      const persistInput = buildPersistAnswerTurnInput({
        input: input.input,
        state,
        timings: input.timings,
        workLog: input.workLog,
        harness: input.harness,
      })

      const persistResult = await input.harness.persist(() =>
        persistAnswerTurnWithResult(persistInput),
      )
      return {
        ...state,
        persistInput,
        persistResult,
      }
    },
    report: async ({ state }) =>
      reportStreamAnswerTurnPhase(
        {
          input: input.input,
          timings: input.timings,
          workLog: input.workLog,
          harness: input.harness,
          stopLeaseHeartbeat: input.stopLeaseHeartbeat,
        },
        state,
      ),
  }
}
