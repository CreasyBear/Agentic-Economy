import {
  buildArtifactsFromSnapshot,
  type AnswerSnapshot,
} from '@/modules/answer/projection'
import { isRecord } from '@/modules/common/is-record'

import type {
  AnswerTurnRecord,
  AnswerThreadRecord,
  FrozenTurnEvidence,
  FrozenTurnProse,
  PublicThreadProjection,
  PublicThreadTurn,
} from '../answer-thread.schema'
import { buildPublicAnswerCheckSummary } from './answer-run-summary'
import { publicWorkLog } from './public-worklog'

function isCurrentFrozenEvidence(value: unknown): value is FrozenTurnEvidence {
  if (!isRecord(value)) {
    return false
  }
  if (
    !Array.isArray(value.providers) ||
    !Array.isArray(value.allowedSlugs) ||
    typeof value.agentJsonUrl !== 'string' ||
    !Array.isArray(value.toolCalls) ||
    !Array.isArray(value.timings) ||
    !Array.isArray(value.workLog) ||
    !isRecord(value.answerRun)
  ) {
    return false
  }
  const summary = value.answerRun.summary
  const coverage = value.answerRun.coverage
  return isRecord(summary) &&
    isRecord(summary.tools) &&
    isRecord(summary.evidence) &&
    isRecord(summary.workLog) &&
    isRecord(summary.timings) &&
    isRecord(summary.gates) &&
    isRecord(coverage)
}


export function buildPublicThreadProjection(
  thread: AnswerThreadRecord,
  turns: readonly AnswerTurnRecord[],
): PublicThreadProjection {
  return {
    threadId: thread.threadId,
    title: thread.title,
    turns: turns
      .toSorted((a, b) => a.seq - b.seq)
      .map((turn) => buildPublicTurn(turn)),
  }
}

function buildPublicTurn(turn: AnswerTurnRecord): PublicThreadTurn {
  const evidence = parseFrozenEvidence(turn.evidenceJson)
  const prose = JSON.parse(turn.proseJson) as FrozenTurnProse

  const snapshot: AnswerSnapshot = {
    query: turn.query,
    oneLine: prose.oneLine,
    providers: evidence.providers,
    ...(evidence.importedClaims === undefined ? {} : { importedClaims: evidence.importedClaims }),
    ...(turn.intent === 'inquiry_handoff' && evidence.providers.length === 1
      ? { selectedProvider: evidence.providers[0] }
      : {}),
    summary: prose.summary,
    nextStep: prose.nextStep,
    agentJsonUrl: evidence.agentJsonUrl,
    ...(prose.compactLayout === true ? { compactLayout: true } : {}),
    ...(prose.layoutProfile === undefined ? {} : { layoutProfile: prose.layoutProfile }),
  }

  return {
    turnId: turn.turnId,
    seq: turn.seq,
    createdAt: turn.createdAt,
    query: turn.query,
    intent: turn.intent,
    status: turn.status,
    workLog: publicWorkLog(evidence.workLog),
    artifacts: buildArtifactsFromSnapshot(snapshot),
    oneLine: prose.oneLine,
    answerCheckSummary: buildPublicAnswerCheckSummary(evidence.answerRun),
    ...(evidence.searchContext?.timing === undefined ? {} : { timing: evidence.searchContext.timing }),
    ...(evidence.searchContext?.timingDate === undefined ? {} : { timingDate: evidence.searchContext.timingDate }),
    ...(prose.layoutProfile === undefined ? {} : { layoutProfile: prose.layoutProfile }),
  }
}


export function parseFrozenEvidence(value: string): FrozenTurnEvidence {
  const parsed: unknown = JSON.parse(value)
  if (!isCurrentFrozenEvidence(parsed)) {
    throw new Error('answer_evidence_invalid')
  }
  return parsed
}

