import type { FollowUpIntent, PublicThreadProjection } from '@/modules/answer-thread/public'

export type FollowUpComposerCopy = {
  placeholder: string
  loopHint: string
}

export function buildFollowUpComposerCopy(
  completedTurns: readonly NonNullable<PublicThreadProjection>['turns'][number][],
  liveIntent: FollowUpIntent | null = null,
): FollowUpComposerCopy | null {
  if (liveIntent !== null) {
    return {
      placeholder: 'Working on your ask',
      loopHint: '',
    }
  }

  if (completedTurns.length === 0) {
    return null
  }

  return {
    placeholder: 'Ask a follow-up',
    loopHint: '',
  }
}
