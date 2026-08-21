import { describe, expect, it } from 'vitest'

import { buildFollowUpComposerCopy } from '@/components/ae/chat/composer-copy'
import type { PublicThreadTurn } from '@/modules/answer-thread/public'

describe('chat composer loop copy', () => {
  it('uses one live placeholder while a turn is in flight', () => {
    expect(buildFollowUpComposerCopy([], 'refine_search')).toEqual({
      placeholder: 'Working on your ask',
      loopHint: '',
    })
    expect(buildFollowUpComposerCopy([turn()], 'compare_known')).toEqual({
      placeholder: 'Working on your ask',
      loopHint: '',
    })
  })

  it('uses a settled follow-up placeholder without planner copy', () => {
    expect(buildFollowUpComposerCopy([turn()], null)).toEqual({
      placeholder: 'Ask a follow-up',
      loopHint: '',
    })
  })

  it('returns no copy on an empty thread', () => {
    expect(buildFollowUpComposerCopy([], null)).toBeNull()
  })
})

function turn(overrides: Partial<PublicThreadTurn> = {}): PublicThreadTurn {
  return {
    turnId: `turn-${overrides.seq ?? 1}`,
    seq: 1,
    query: 'EUR to USD',
    intent: 'refine_search',
    status: 'complete',
    workLog: [],
    artifacts: [{ kind: 'one-line', text: 'One listed operation matches.' }],
    oneLine: 'One listed operation matches.',
    ...overrides,
  }
}
