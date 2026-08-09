import type { AnswerLayoutProfile, AnswerWorkStep } from '@/modules/answer/public'
import type { AnswerArtifact } from '@/modules/answer/public'
import type { FollowUpIntent, PublicAnswerCheckSummary, PublicThreadTurn } from '@/modules/answer-thread/public'
import { orderShortlistArtifacts } from './shortlist-projection'

/** Assistant answer block: "AE" monogram avatar + vertical connector, bridge-only. */
export const ANSWER_SECTION_CLASS =
  "relative max-w-full ps-9 before:absolute before:left-0 before:top-[0.15rem] before:inline-grid before:size-[1.625rem] before:place-items-center before:rounded-sm before:border before:border-border-strong before:bg-inverted before:font-mono before:text-[0.72rem] before:font-semibold before:leading-none before:text-on-dark before:content-['AE'] after:absolute after:left-[0.79rem] after:top-9 after:bottom-1 after:w-px after:bg-border after:content-['']"

/** Shared replay/collapsed turn payload for generative answer panels. */
export type ThreadTurnViewModel = {
  query: string
  intent: FollowUpIntent
  seq: number
  status: PublicThreadTurn['status']
  problem?: PublicThreadTurn['problem']
  oneLine: string
  artifacts: readonly AnswerArtifact[]
  workLog: readonly AnswerWorkStep[]
  layoutProfile?: AnswerLayoutProfile
  answerCheckSummary?: PublicAnswerCheckSummary
}
export function toThreadViewModel(turn: PublicThreadTurn): ThreadTurnViewModel {
  return {
    query: turn.query,
    intent: turn.intent,
    seq: turn.seq,
    status: turn.status,
    ...(turn.problem === undefined ? {} : { problem: turn.problem }),
    oneLine: turn.oneLine,
    artifacts: orderShortlistArtifacts(turn.artifacts, turn.timing),
    workLog: turn.workLog,
    ...(turn.layoutProfile === undefined ? {} : { layoutProfile: turn.layoutProfile }),
    ...(turn.answerCheckSummary === undefined ? {} : { answerCheckSummary: turn.answerCheckSummary }),
  }
}
export type ThreadTurnPresenterPhase = 'streaming' | 'stopped' | 'error' | 'complete'

export function presenterPhaseForTurnStatus(status: PublicThreadTurn['status']): ThreadTurnPresenterPhase {
  switch (status) {
    case 'pending':
      return 'streaming'
    case 'stopped':
      return 'stopped'
    case 'error':
      return 'error'
    case 'complete':
      return 'complete'
  }
}

export function turnStatusCopy(status: PublicThreadTurn['status']): string | null {
  switch (status) {
    case 'pending':
      return 'This answer is still pending. Reload to check its durable status.'
    case 'stopped':
      return 'Answer stopped.'
    case 'error':
      return null
    case 'complete':
      return null
  }
}
