import { buildArtifactsFromSnapshot } from '@/modules/answer/artifacts'
import type { AnswerSnapshot } from '@/modules/answer/answer-synthesizer'

import type {
  AnswerTurnRecord,
  AnswerThreadRecord,
  FrozenTurnEvidence,
  FrozenTurnProse,
  PublicThreadProjection,
  PublicThreadTurn,
} from '../answer-thread.schema'

export function buildPublicThreadProjection(
  thread: AnswerThreadRecord,
  turns: readonly AnswerTurnRecord[],
): PublicThreadProjection {
  return {
    threadId: thread.threadId,
    title: thread.title,
    turns: turns
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((turn) => buildPublicTurn(turn)),
  }
}

function buildPublicTurn(turn: AnswerTurnRecord): PublicThreadTurn {
  const evidence = parseJson<FrozenTurnEvidence>(turn.evidenceJson)
  const prose = parseJson<FrozenTurnProse>(turn.proseJson)

  const snapshot: AnswerSnapshot = {
    query: turn.query,
    oneLine: prose.oneLine,
    providers: evidence.providers,
    summary: prose.summary,
    nextStep: prose.nextStep,
    agentJsonUrl: evidence.agentJsonUrl,
    ...(prose.compactLayout === true ? { compactLayout: true } : {}),
    ...(prose.layoutProfile === undefined ? {} : { layoutProfile: prose.layoutProfile }),
  }

  return {
    turnId: turn.turnId,
    seq: turn.seq,
    query: turn.query,
    intent: turn.intent,
    status: turn.status,
    artifacts: buildArtifactsFromSnapshot(snapshot),
    oneLine: prose.oneLine,
    ...(prose.layoutProfile === undefined ? {} : { layoutProfile: prose.layoutProfile }),
  }
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

export function parseFrozenEvidence(value: string): FrozenTurnEvidence {
  return parseJson<FrozenTurnEvidence>(value)
}

export function parseFrozenProse(value: string): FrozenTurnProse {
  return parseJson<FrozenTurnProse>(value)
}
