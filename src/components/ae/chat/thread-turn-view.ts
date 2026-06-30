import type { AnswerLayoutProfile } from '@/modules/answer/public'
import type { AnswerArtifact } from '@/modules/answer/public'
import type { FollowUpIntent, PublicThreadTurn } from '@/modules/answer-thread/public'

/** Shared replay/collapsed turn payload for generative answer panels. */
export type ThreadTurnViewModel = {
  query: string
  intent: FollowUpIntent
  seq: number
  oneLine: string
  artifacts: readonly AnswerArtifact[]
  layoutProfile?: AnswerLayoutProfile
}

export function toThreadViewModel(turn: PublicThreadTurn): ThreadTurnViewModel {
  return {
    query: turn.query,
    intent: turn.intent,
    seq: turn.seq,
    oneLine: turn.oneLine,
    artifacts: turn.artifacts,
    ...(turn.layoutProfile === undefined ? {} : { layoutProfile: turn.layoutProfile }),
  }
}
