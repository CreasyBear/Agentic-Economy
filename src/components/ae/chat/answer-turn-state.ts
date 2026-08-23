import type {
  AnswerLayoutProfile,
  AnswerArtifact,
  AnswerEvent,
  AnswerWorkStep,
} from '@/modules/answer/public'
import { mergeAnswerArtifact } from '@/modules/answer/public'
import type { AnswerTurnProblem } from '@/lib/errors'
import type { AnswerTurnStatus, PublicThreadTurn, ThinkingStep } from '@/modules/answer-thread/public'
import type {
  AnswerStreamFrame,
  AnswerTurnTransportError,
  StreamAnswerResult,
} from './answer-stream'
import { appendThinkingStep } from './answer-stream'

export type AnswerTurnPhase = 'streaming' | 'settling' | 'pending' | 'complete' | 'stopped' | 'error'
export type AnswerTurnStopState = 'idle' | 'requested' | 'accepted' | 'too_late' | 'failed'
export type AnswerTurnReadbackState = 'pending' | 'ok' | 'not_found' | 'failed'

type AnswerPlanState = Pick<
  Extract<AnswerEvent, { type: 'plan' }>,
  'providerBudget' | 'artifactBudget'
>

export type AnswerTurnMeta = {
  threadId: string
  turnId: string
  turnSeq: number
}

export type AnswerTurnUiState = {
  phase: AnswerTurnPhase
  stopState: AnswerTurnStopState
  readbackState: AnswerTurnReadbackState
  lastFrameSeq: number
  threadMeta: AnswerTurnMeta | null
  artifacts: AnswerArtifact[]
  oneLineFallback: string
  thinkingLabel: string
  thinkingSteps: readonly string[]
  thinkingStep: ThinkingStep | undefined
  workLog: readonly AnswerWorkStep[]
  layoutProfile: AnswerLayoutProfile | undefined
  plan: AnswerPlanState | undefined
  problem: AnswerTurnProblem | null
  transportError: AnswerTurnTransportError | null
  stopFailure: AnswerTurnProblem | AnswerTurnTransportError | null
  /** Kept as a read-only convenience for existing renderers; durable state owns truth. */
  complete: boolean
}

export type AnswerTurnAction =
  | { type: 'reset' }
  | { type: 'frame'; frame: AnswerStreamFrame }
  | { type: 'stream_result'; result: StreamAnswerResult }
  | { type: 'stop_requested' }
  | { type: 'stop_accepted' }
  | { type: 'stop_too_late'; status: Extract<AnswerTurnStatus, 'complete' | 'error' | 'stopped'> }
  | { type: 'stop_failed'; problem?: AnswerTurnProblem; transportError?: AnswerTurnTransportError }
  | { type: 'readback_turn'; turn: PublicThreadTurn }
  | { type: 'readback_not_found' }
  | { type: 'readback_failed'; problem?: AnswerTurnProblem; transportError?: AnswerTurnTransportError }

export const initialAnswerTurnUiState: AnswerTurnUiState = {
  phase: 'streaming',
  stopState: 'idle',
  readbackState: 'pending',
  lastFrameSeq: -1,
  threadMeta: null,
  artifacts: [],
  oneLineFallback: '',
  thinkingLabel: 'Searching for matches…',
  thinkingSteps: [],
  thinkingStep: 'search',
  workLog: [],
  layoutProfile: undefined,
  plan: undefined,
  problem: null,
  transportError: null,
  stopFailure: null,
  complete: false,
}

export function reduceAnswerTurnState(
  state: AnswerTurnUiState,
  action: AnswerTurnAction,
): AnswerTurnUiState {
  switch (action.type) {
    case 'reset':
      return initialAnswerTurnUiState
    case 'frame':
      if (action.frame.seq <= state.lastFrameSeq) {
        return state
      }
      return applyAnswerEvent(
        { ...state, lastFrameSeq: action.frame.seq },
        action.frame.event,
      )
    case 'stream_result':
      if (action.result.kind === 'complete') {
        return { ...state, phase: 'settling', complete: false }
      }
      if (action.result.kind === 'pending') {
        return { ...state, phase: 'pending', complete: false }
      }
      if (action.result.kind === 'stopped') {
        return {
          ...stopRunningWorkSteps(state),
          phase: 'stopped',
          stopState: 'accepted',
          complete: false,
        }
      }
      if (action.result.kind === 'aborted') {
        return state
      }
      if (action.result.kind === 'problem') {
        return {
          ...state,
          phase: state.threadMeta === null ? 'error' : 'settling',
          problem: action.result.problem,
          transportError: null,
          complete: false,
        }
      }
      return {
        ...state,
        phase: state.threadMeta === null ? 'error' : 'settling',
        transportError: action.result.error,
        complete: false,
      }
    case 'stop_requested':
      return state.stopState === 'idle'
        ? { ...state, stopState: 'requested', stopFailure: null }
        : state
    case 'stop_accepted':
      return {
        ...stopRunningWorkSteps(state),
        phase: 'stopped',
        stopState: 'accepted',
        readbackState: 'pending',
        problem: null,
        transportError: null,
        complete: false,
      }
    case 'stop_too_late':
      return {
        ...state,
        phase: 'settling',
        stopState: 'too_late',
        readbackState: 'pending',
        stopFailure: null,
      }
    case 'stop_failed':
      return {
        ...state,
        stopState: 'failed',
        stopFailure: action.problem ?? action.transportError ?? null,
      }
    case 'readback_turn':
      return applyDurableTurn(state, action.turn)
    case 'readback_not_found':
      return {
        ...state,
        phase: 'error',
        readbackState: 'not_found',
        complete: false,
      }
    case 'readback_failed':
      return {
        ...state,
        phase: 'error',
        readbackState: 'failed',
        problem: action.problem ?? null,
        transportError: action.transportError ?? null,
        complete: false,
      }
    default: {
      const _exhaustive: never = action
      void _exhaustive
      return state
    }
  }
}

function applyAnswerEvent(state: AnswerTurnUiState, event: AnswerEvent): AnswerTurnUiState {
  switch (event.type) {
    case 'thread':
      return {
        ...state,
        threadMeta: {
          threadId: event.threadId,
          turnId: event.turnId,
          turnSeq: event.turnSeq,
        },
      }
    case 'work-step':
      return {
        ...state,
        workLog: upsertWorkStep(state.workLog, event.step),
        thinkingLabel: event.step.status === 'running' ? `${event.step.title}…` : state.thinkingLabel,
      }
    case 'thinking': {
      let next = state
      if (event.label !== undefined && event.label !== state.thinkingLabel) {
        next = {
          ...next,
          thinkingSteps: appendThinkingStep(state.thinkingSteps, state.thinkingLabel),
          thinkingLabel: event.label,
        }
      } else if (event.label !== undefined) {
        next = { ...next, thinkingLabel: event.label }
      }
      if (event.step !== undefined) {
        next = { ...next, thinkingStep: event.step }
      }
      return next
    }
    case 'plan':
      return {
        ...state,
        layoutProfile: event.layoutProfile,
        plan: {
          providerBudget: event.providerBudget,
          artifactBudget: event.artifactBudget,
        },
      }
    case 'one-line':
      return {
        ...state,
        oneLineFallback: event.oneLine,
        artifacts: mergeAnswerArtifact(state.artifacts, { kind: 'one-line', text: event.oneLine }),
      }
    case 'sources':
      return state
    case 'summary-delta': {
      const prior = state.artifacts.find((artifact) => artifact.kind === 'prose' && artifact.block === 'summary')
      const priorText = prior?.kind === 'prose' && prior.block === 'summary' ? prior.text : ''
      const text = [priorText, event.delta].filter((value) => value.trim().length > 0).join(' ')
      return {
        ...state,
        artifacts: mergeAnswerArtifact(state.artifacts, { kind: 'prose', block: 'summary', text }),
      }
    }
    case 'next-step':
      return {
        ...state,
        artifacts: mergeAnswerArtifact(state.artifacts, { kind: 'what-to-do-now', text: event.nextStep }),
      }
    case 'artifact': {
      const artifact = artifactForPlan(state, event.artifact)
      if (artifact === undefined) {
        return state
      }
      return {
        ...state,
        artifacts: mergeAnswerArtifact(state.artifacts, artifact),
      }
    }
    case 'complete':
      return {
        ...state,
        layoutProfile: event.answer.layoutProfile,
      }
    case 'pending':
      return {
        ...state,
        phase: 'pending',
      }
    case 'stopped':
      return {
        ...stopRunningWorkSteps(state),
        phase: 'stopped',
        stopState: 'accepted',
        complete: false,
      }
    case 'error':
      return {
        ...state,
        problem: event.problem,
      }
    default: {
      const _exhaustive: never = event
      void _exhaustive
      return state
    }
  }
}

function applyDurableTurn(state: AnswerTurnUiState, turn: PublicThreadTurn): AnswerTurnUiState {
  const problem = 'problem' in turn ? (turn.problem ?? null) : null
  const next = {
    ...state,
    readbackState: 'ok' as const,
    workLog: turn.workLog,
    artifacts: [...turn.artifacts],
    oneLineFallback: turn.oneLine,
    layoutProfile: turn.layoutProfile,
    problem,
    transportError: null,
    stopFailure: null,
  }

  switch (turn.status) {
    case 'pending':
      return { ...next, phase: 'pending', complete: false }
    case 'complete':
      return { ...next, phase: 'complete', complete: true }
    case 'stopped':
      return { ...next, phase: 'stopped', stopState: 'accepted', complete: false }
    case 'error':
      return { ...next, phase: 'error', complete: false }
    default: {
      const _exhaustive: never = turn.status
      void _exhaustive
      return next
    }
  }
}

function artifactForPlan(
  state: AnswerTurnUiState,
  artifact: AnswerArtifact,
): AnswerArtifact | undefined {
  const budget = state.plan?.artifactBudget
  if (budget === undefined) {
    return artifact
  }
  if (!budget.allowedKinds.includes(artifact.kind)) {
    return undefined
  }
  const alreadyHasKind = state.artifacts.some((candidate) => candidate.kind === artifact.kind)
  if (!alreadyHasKind && state.artifacts.length >= budget.maxArtifactCount) {
    return undefined
  }
  if (artifact.kind !== 'provider-cards') {
    return artifact
  }
  const providers = artifact.providers.slice(0, Math.max(0, budget.maxProviderCards))
  return providers.length === 0 ? undefined : { kind: 'provider-cards', providers }
}

function stopRunningWorkSteps(state: AnswerTurnUiState): AnswerTurnUiState {
  const stoppedAt = Date.now()
  const workLog = state.workLog.map((step) => {
    if (step.status !== 'running') {
      return step
    }
    const durationMs = step.startedAtMs === undefined ? undefined : Math.max(0, stoppedAt - step.startedAtMs)
    return {
      ...step,
      status: 'stopped' as const,
      completedAtMs: stoppedAt,
      ...(durationMs === undefined ? {} : { durationMs }),
    }
  })
  return { ...state, workLog }
}

function upsertWorkStep(
  steps: readonly AnswerWorkStep[],
  incoming: AnswerWorkStep,
): AnswerWorkStep[] {
  const index = steps.findIndex((step) => step.id === incoming.id)
  if (index === -1) {
    return [...steps, incoming]
  }

  return steps.map((step, currentIndex) => {
    if (currentIndex !== index) {
      return step
    }
    return {
      ...step,
      ...incoming,
      ...(incoming.detailRows === undefined ? {} : { detailRows: incoming.detailRows }),
      ...(incoming.relatedProviderSlugs === undefined ? {} : { relatedProviderSlugs: incoming.relatedProviderSlugs }),
    }
  })
}
