import { describe, expect, it } from 'vitest'

import { mergeProjectionWithOptimisticTurns, type OptimisticTurnRecord } from '@/components/ae/chat/projection-merge'
import type { PublicThreadProjection, PublicThreadTurn } from '@/modules/answer-thread/public'

function turn(overrides: Partial<PublicThreadTurn> = {}): PublicThreadTurn {
  return {
    turnId: 'turn:1',
    seq: 1,
    query: 'Find a plumber',
    intent: 'refine_search',
    status: 'complete',
    workLog: [],
    artifacts: [],
    oneLine: 'One match',
    ...overrides,
  }
}

function projection(turns: readonly PublicThreadTurn[]): PublicThreadProjection {
  return { threadId: 'thread:1', title: 'Find a plumber', turns }
}

function optimistic(turnValue: PublicThreadTurn): OptimisticTurnRecord {
  return { threadId: 'thread:1', stableKey: `live-${turnValue.turnId}`, turn: turnValue }
}

describe('mergeProjectionWithOptimisticTurns', () => {
  it('lets a durable pending row win over optimistic complete content', () => {
    const serverTurn = turn({ status: 'pending', oneLine: '' })
    const localTurn = turn({ status: 'complete', oneLine: 'Optimistic answer' })
    const merged = mergeProjectionWithOptimisticTurns({
      serverProjection: projection([serverTurn]),
      streamingThreadId: 'thread:1',
      optimisticTurns: [optimistic(localTurn)],
    })

    expect(merged?.turns).toEqual([serverTurn])
  })

  it('rejects optimistic sequence collisions and sorts accepted local rows', () => {
    const merged = mergeProjectionWithOptimisticTurns({
      serverProjection: projection([turn()]),
      streamingThreadId: 'thread:1',
      optimisticTurns: [
        optimistic(turn({ turnId: 'turn:3', seq: 3 })),
        optimistic(turn({ turnId: 'turn:2', seq: 1 })),
      ],
    })

    expect(merged?.turns.map((item) => item.turnId)).toEqual(['turn:1', 'turn:3'])
    expect(mergeProjectionWithOptimisticTurns({
      serverProjection: merged,
      streamingThreadId: 'thread:1',
      optimisticTurns: [optimistic(turn({ turnId: 'turn:3', seq: 3 }))],
    })).toEqual(merged)
  })
})
