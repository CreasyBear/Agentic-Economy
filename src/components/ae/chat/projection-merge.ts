import type {
  PublicThreadProjection,
  PublicThreadTurn,
} from '@/modules/answer-thread/public'

export type OptimisticTurnRecord = {
  threadId: string
  stableKey: string
  turn: PublicThreadTurn
}

export function mergeProjectionWithOptimisticTurns(input: {
  serverProjection: PublicThreadProjection | null
  streamingThreadId: string | null
  optimisticTurns: readonly OptimisticTurnRecord[]
  omitTurnId?: string | null
}): PublicThreadProjection | null {
  if (input.streamingThreadId === null) {
    return input.serverProjection
  }

  const localTurns: PublicThreadTurn[] = []
  for (const record of input.optimisticTurns) {
    if (record.threadId !== input.streamingThreadId || record.turn.turnId === input.omitTurnId) {
      continue
    }
    localTurns.push(record.turn)
  }
  if (localTurns.length === 0) {
    return input.serverProjection
  }

  const serverProjection = input.serverProjection
  if (serverProjection === null) {
    const seenIds = new Set<string>()
    const seenSeqs = new Set<number>()
    const accepted = localTurns
      .toSorted((left, right) => left.seq - right.seq)
      .filter((turn) => {
        if (seenIds.has(turn.turnId) || seenSeqs.has(turn.seq)) {
          return false
        }
        seenIds.add(turn.turnId)
        seenSeqs.add(turn.seq)
        return true
      })
    return accepted.length === 0
      ? null
      : {
          threadId: input.streamingThreadId,
          title: accepted[0]?.query ?? 'New search',
          turns: accepted,
        }
  }

  const serverIds = new Set(serverProjection.turns.map((turn) => turn.turnId))
  const serverSeqs = new Set(serverProjection.turns.map((turn) => turn.seq))
  const localIds = new Set<string>()
  const localSeqs = new Set<number>()
  const pendingTurns = localTurns
    .toSorted((left, right) => left.seq - right.seq)
    .filter((turn) => {
      // A durable row wins by turn id, including pending/stopped/error rows.
      if (serverIds.has(turn.turnId) || localIds.has(turn.turnId)) {
        return false
      }
      // A client-generated sequence collision is never allowed to reorder durable rows.
      if (serverSeqs.has(turn.seq) || localSeqs.has(turn.seq)) {
        return false
      }
      localIds.add(turn.turnId)
      localSeqs.add(turn.seq)
      return true
    })

  if (pendingTurns.length === 0) {
    return serverProjection
  }
  return {
    ...serverProjection,
    turns: [...serverProjection.turns, ...pendingTurns].toSorted((left, right) => left.seq - right.seq),
  }
}
