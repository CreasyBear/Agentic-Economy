import type {
  AnswerLayoutProfile,
  AnswerArtifact,
  AnswerEvent,
  AnswerWorkStep,
  AnswerSource,
} from '@/modules/answer/public'
import { mergeAnswerArtifact } from '@/modules/answer/public'
import type { ThinkingStep } from '@/modules/answer-thread/public'

import { appendThinkingStep } from './answer-stream'

export type AnswerTurnPhase = 'idle' | 'streaming' | 'complete' | 'stopped' | 'error'

type AnswerPlanState = Pick<
  Extract<AnswerEvent, { type: 'plan' }>,
  'providerBudget' | 'artifactBudget'
>

export type AnswerTurnUiState = {
  phase: AnswerTurnPhase
  artifacts: AnswerArtifact[]
  oneLineFallback: string
  thinkingLabel: string
  thinkingSteps: readonly string[]
  thinkingStep: ThinkingStep | undefined
  workLog: readonly AnswerWorkStep[]
  layoutProfile: AnswerLayoutProfile | undefined
  plan: AnswerPlanState | undefined
  errorMessage: string | null
  complete: boolean
}

export const initialAnswerTurnUiState: AnswerTurnUiState = {
  phase: 'streaming',
  artifacts: [],
  oneLineFallback: '',
  thinkingLabel: 'Searching listed businesses…',
  thinkingSteps: [],
  thinkingStep: 'search',
  workLog: [],
  layoutProfile: undefined,
  plan: undefined,
  errorMessage: null,
  complete: false,
}

export function reduceAnswerTurnEvent(state: AnswerTurnUiState, event: AnswerEvent): AnswerTurnUiState {
  switch (event.type) {
    case 'thread':
      return state
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
    case 'sources': {
      const providers = providersForSourcesEvent(state, event.providers)
      if (providers.length === 0) {
        return state
      }
      return {
        ...state,
        artifacts: mergeAnswerArtifact(state.artifacts, { kind: 'provider-cards', providers }),
      }
    }
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
        phase: 'complete',
        complete: true,
      }
    case 'error':
      return {
        ...state,
        phase: 'error',
        errorMessage: 'The answer could not be built right now. Try again or browse services.',
      }
    default: {
      const _exhaustive: never = event
      void _exhaustive
      return state
    }
  }
}

function providersForSourcesEvent(
  state: AnswerTurnUiState,
  providers: readonly AnswerSource[],
): readonly AnswerSource[] {
  const budget = state.plan?.artifactBudget
  if (budget === undefined) {
    return providers
  }
  if (!budget.allowedKinds.includes('provider-cards') || budget.maxProviderCards <= 0) {
    return []
  }
  return providers.slice(0, budget.maxProviderCards)
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

export function stopRunningWorkSteps(state: AnswerTurnUiState): AnswerTurnUiState {
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
