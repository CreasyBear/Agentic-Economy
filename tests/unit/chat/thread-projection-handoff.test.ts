import { describe, expect, it } from 'vitest'

import {
  takeThreadProjectionHandoff,
  writeThreadProjectionHandoff,
} from '@/components/ae/chat/thread-projection-handoff'
import type { PublicThreadProjection } from '@/modules/answer-thread/public'

describe('thread projection handoff', () => {
  it('is a one-use in-process display handoff', () => {
    const projection = {
      threadId: 'thread-handoff',
      title: 'Question',
      turns: [],
    } satisfies PublicThreadProjection

    writeThreadProjectionHandoff(projection)

    expect(takeThreadProjectionHandoff(projection.threadId)).toBe(projection)
    expect(takeThreadProjectionHandoff(projection.threadId)).toBeNull()
  })
})
