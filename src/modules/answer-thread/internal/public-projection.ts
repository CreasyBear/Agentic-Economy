import {
  buildArtifactsFromSnapshot,
  type AnswerSnapshot,
  type AnswerWorkStep,
} from '@/modules/answer/projection'
import { publicWorkLog, safeWorkLogUserText } from './public-worklog'

import type {
  AnswerTurnRecord,
  AnswerThreadRecord,
  FrozenTurnEvidence,
  FrozenTurnProse,
  PublicThreadProjection,
  PublicThreadTurn,
} from '../answer-thread.schema'
import { buildAnswerRunReport, buildPublicAnswerCheckSummary } from './answer-run-summary'

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
  const answerRun = evidence.answerRun ?? buildAnswerRunReport({
    intent: turn.intent,
    status: turn.status,
    snapshotHash: turn.snapshotHash,
    evidence,
  })

  const snapshot: AnswerSnapshot = {
    query: turn.query,
    oneLine: prose.oneLine,
    providers: evidence.providers,
    ...(evidence.offeringSources === undefined ? {} : { offeringSources: evidence.offeringSources }),
    ...(evidence.decisionSupport === undefined ? {} : { decisionSupport: evidence.decisionSupport }),
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
    workLog: publicWorkLog(evidence.workLog ?? deriveLegacyWorkLog(turn.query, evidence, prose)),
    artifacts: buildArtifactsFromSnapshot(snapshot),
    oneLine: prose.oneLine,
    answerCheckSummary: buildPublicAnswerCheckSummary(answerRun),
    ...(evidence.searchContext?.timing === undefined ? {} : { timing: evidence.searchContext.timing }),
    ...(evidence.searchContext?.timingDate === undefined ? {} : { timingDate: evidence.searchContext.timingDate }),
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

function deriveLegacyWorkLog(
  query: string,
  evidence: FrozenTurnEvidence,
  prose: FrozenTurnProse,
): AnswerWorkStep[] {
  const providers = evidence.providers ?? []
  const searchQueries = readSearchQueries(evidence)
  const completedAtMs = Date.now()
  const workLog: AnswerWorkStep[] = [
    {
      id: 'interpret.request',
      phase: 'interpret',
      status: 'complete',
      title: 'Reading your request',
      summary: 'Loaded from a saved answer.',
      detailRows: [{ label: 'Request', value: safeWorkLogUserText(query) }],
      completedAtMs,
    },
  ]

  if (searchQueries.length > 0) {
    workLog.push({
      id: 'search.registry.initial',
      phase: 'search',
      status: 'complete',
      title: 'Searching listed businesses',
      summary: describeProviderCount(providers.length),
      detailRows: [
        { label: 'Search words', value: safeWorkLogUserText(searchQueries[0] ?? query) },
        { label: 'Results', value: String(providers.length) },
      ],
      relatedProviderSlugs: providers.map((provider) => provider.slug),
      completedAtMs,
    })
  }

  workLog.push(
    {
      id: 'read.providers',
      phase: 'read',
      status: 'complete',
      title: 'Reading listed businesses',
      summary: providers.length === 0
        ? 'No listed businesses were returned for this answer.'
        : describeProviderCount(providers.length),
      detailRows: [{ label: 'Listed businesses', value: String(providers.length) }],
      relatedProviderSlugs: providers.map((provider) => provider.slug),
      completedAtMs,
    },
    {
      id: 'compare.fit',
      phase: 'compare',
      status: 'complete',
      title: 'Checking fit',
      summary: providers.length === 0
        ? 'No listed businesses fit this request yet.'
        : 'Keeping listed businesses whose published details fit this request.',
      detailRows: [{ label: 'Kept for answer', value: String(providers.length) }],
      relatedProviderSlugs: providers.map((provider) => provider.slug),
      completedAtMs,
    },
    {
      id: 'assemble.answer',
      phase: 'assemble',
      status: 'complete',
      title: 'Preparing the answer',
      summary: prose.oneLine.trim().length > 0 ? 'The answer is ready to inspect.' : 'The saved answer has no visible summary.',
      detailRows: [{ label: 'Listed businesses', value: String(providers.length) }],
      relatedProviderSlugs: providers.map((provider) => provider.slug),
      completedAtMs,
    },
  )

  return workLog
}

function readSearchQueries(evidence: FrozenTurnEvidence): string[] {
  return (evidence.toolCalls ?? []).flatMap((call) => {
    try {
      const parsed = JSON.parse(call.inputJson) as { query?: unknown }
      return typeof parsed.query === 'string' && parsed.query.trim().length > 0
        ? [parsed.query.trim()]
        : []
    } catch {
      return []
    }
  })
}

function describeProviderCount(count: number): string {
  if (count === 0) {
    return 'No listed businesses found.'
  }
  if (count === 1) {
    return '1 listed business found.'
  }
  return `${count} listed businesses found.`
}
