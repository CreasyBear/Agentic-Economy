import type { AnswerLayoutProfile, AnswerArtifact, AnswerEvent } from '@/modules/answer/public'
import { mergeAnswerArtifact } from '@/modules/answer/public'
import type { ThinkingStep } from '@/modules/answer-thread/public'

import { appendThinkingStep } from './answer-stream'

export type AnswerTurnPhase = 'idle' | 'streaming' | 'complete' | 'stopped' | 'error'

export type AnswerTurnUiState = {
  phase: AnswerTurnPhase
  artifacts: AnswerArtifact[]
  oneLineFallback: string
  thinkingLabel: string
  thinkingSteps: readonly string[]
  thinkingStep: ThinkingStep | undefined
  layoutProfile: AnswerLayoutProfile | undefined
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
  layoutProfile: undefined,
  errorMessage: null,
  complete: false,
}

export function reduceAnswerTurnEvent(state: AnswerTurnUiState, event: AnswerEvent): AnswerTurnUiState {
  switch (event.type) {
    case 'thread':
      return state
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
    case 'one-line':
      return { ...state, oneLineFallback: event.oneLine }
    case 'sources':
    case 'summary-delta':
    case 'next-step':
      return state
    case 'artifact':
      return {
        ...state,
        artifacts: mergeAnswerArtifact(state.artifacts, event.artifact),
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
        errorMessage: 'The answer could not be built right now. Try again or browse the registry.',
      }
    default: {
      const _exhaustive: never = event
      void _exhaustive
      return state
    }
  }
}
