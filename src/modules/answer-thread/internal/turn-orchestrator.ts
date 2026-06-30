import { stableHash } from '@/modules/common/stable-hash'
import {
  buildArtifactsFromSnapshot,
  type AnswerEvent,
  type AnswerSnapshot,
  type AnswerSource,
} from '@/modules/answer/public'
import {
  buildBoundaryNextStep,
  buildBoundaryOneLine,
  buildBoundarySummary,
  buildUnsupportedNextStep,
  buildUnsupportedOneLine,
  buildUnsupportedSummary,
} from '@/modules/answer/public'
import {
  buildAgentJsonUrl,
  computeLayoutProfile,
  emitSnapshotEvents,
  runAnswerToolUseAgent,
} from '@/modules/answer/public'
import { resolveIntentRoute } from './intent-router'

import type {
  AnswerToolCallRecord,
  AnswerTurnRecord,
  FollowUpIntent,
  FrozenTurnEvidence,
  FrozenTurnProse,
} from '../answer-thread.schema'
import {
  appendAnswerTurnWithToolCalls,
  createAnswerThread,
  getThreadTurns,
} from '../answer-thread.functions'
import { assertAnswerTurnAccess } from './turn-guard'
import { classifyFollowUpIntent, buildThreadTitle } from './follow-up-intent'
import { parseFrozenEvidence } from './public-projection'

const DEFAULT_LIMIT = 10

export type StreamAnswerTurnInput = {
  sessionId: string
  threadId?: string
  query: string
  signal?: AbortSignal
}

export type StreamAnswerTurnResult = {
  threadId: string
  turnId: string
  turnSeq: number
}

export async function streamAnswerTurn(
  input: StreamAnswerTurnInput,
  onEvent: (frame: { seq: number; event: AnswerEvent }) => void,
): Promise<StreamAnswerTurnResult | undefined> {
  const query = input.query.trim().slice(0, 200)
  if (query.length === 0) {
    return undefined
  }

  const access = await assertAnswerTurnAccess({
    sessionId: input.sessionId,
    ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
  })

  const priorTurns = await readPriorCompleteTurns(input.threadId)
  const intent = classifyFollowUpIntent(query, priorTurns.length)

  const threadId = input.threadId ?? crypto.randomUUID()
  const turnId = crypto.randomUUID()
  const turnSeq = priorTurns.length + 1

  let seq = -1
  const send = (event: AnswerEvent) => {
    if (input.signal?.aborted === true) {
      return
    }
    seq += 1
    onEvent({ seq, event })
  }

  if (access.kind === 'denied') {
    send({ type: 'error', code: access.code, copyId: makeCopyId() })
    return undefined
  }

  send({ type: 'thread', threadId, turnId, turnSeq })

  const priorFrozen = collectFrozenProviders(priorTurns)
  const priorAllowedSlugs = collectFrozenAllowedSlugs(priorTurns)
  let captured: AnswerSnapshot | undefined
  let errorCopyId: string | undefined
  let bufferedToolCalls: AnswerToolCallRecord[] = []

  const toolLed = await streamToolLedTurn({
    query,
    intent,
    priorTurnsCount: priorTurns.length,
    priorProviders: priorFrozen,
    priorAllowedSlugs,
    signal: input.signal,
    send,
  })
  captured = toolLed?.snapshot
  errorCopyId = toolLed?.errorCopyId
  bufferedToolCalls = toolLed?.toolCalls ?? []
  if (captured === undefined && errorCopyId === undefined) {
    const copyId = makeCopyId()
    errorCopyId = copyId
    send({ type: 'error', code: 'answer_turn_failed', copyId })
  }

  if (input.signal?.aborted === true) {
    return { threadId, turnId, turnSeq }
  }

  const persisted = await persistTurn({
    sessionId: input.sessionId,
    threadId,
    isNewThread: input.threadId === undefined,
    title: buildThreadTitle(query),
    turnId,
    turnSeq,
    query,
    intent,
    captured,
    errorCopyId,
    toolCalls: bufferedToolCalls,
  })

  if (captured !== undefined) {
    if (!persisted) {
      send({ type: 'error', code: 'answer_turn_persist_failed', copyId: makeCopyId() })
      return { threadId, turnId, turnSeq }
    }
    send({ type: 'complete', answer: captured })
  }

  return { threadId, turnId, turnSeq }
}

async function streamToolLedTurn(input: {
  query: string
  intent: FollowUpIntent
  priorTurnsCount: number
  priorProviders: AnswerSource[]
  priorAllowedSlugs: readonly string[]
  signal: AbortSignal | undefined
  send: (event: AnswerEvent) => void
}): Promise<{ snapshot: AnswerSnapshot | undefined; toolCalls: AnswerToolCallRecord[]; errorCopyId: string | undefined } | undefined> {
  const route = resolveIntentRoute(input.intent)

  switch (route.kind) {
    case 'boundary_explain':
    case 'unsupported':
      // Boundary-prose intents answer from deterministic copy with no LLM call.
      return streamBoundaryTurn(input, route.kind)
    case 'frozen_filter':
    case 'frozen_compare': {
      // Frozen-evidence intents reuse prior providers with no registry tool call.
      const frozen = selectFrozenProviders(route.kind, input.priorProviders)
      return streamAgentTurn(input, {
        query: input.query,
        priorProviders: frozen,
        priorAllowedSlugs: input.priorAllowedSlugs,
        followUpIntent: input.intent,
        disableTools: true,
      })
    }
    case 'tool_search':
      // refine_search: the only route that exposes registry tools to the agent.
      return streamAgentTurn(input, {
        query: input.query,
        followUpIntent: input.intent,
      })
  }
}

function selectFrozenProviders(
  routeKind: 'frozen_filter' | 'frozen_compare',
  priorProviders: readonly AnswerSource[],
): AnswerSource[] {
  if (routeKind === 'frozen_filter') {
    return reindexProviders(priorProviders.filter((provider) => provider.inquiryUrl !== undefined))
  }
  return reindexProviders(priorProviders.slice(0, 2))
}

async function streamAgentTurn(
  input: {
    query: string
    intent: FollowUpIntent
    priorTurnsCount: number
    signal: AbortSignal | undefined
    send: (event: AnswerEvent) => void
  },
  agentInput: Parameters<typeof runAnswerToolUseAgent>[0],
): Promise<{ snapshot: AnswerSnapshot | undefined; toolCalls: AnswerToolCallRecord[]; errorCopyId: string | undefined } | undefined> {
  input.send({ type: 'thinking', step: 'search', label: 'Searching the catalog…' })

  try {
    const result = await runAnswerToolUseAgent(agentInput)
    if (!result.gate.ok) {
      const copyId = result.gate.copyId
      input.send({ type: 'error', code: result.gate.code, copyId })
      return { snapshot: undefined, toolCalls: result.toolCalls, errorCopyId: copyId }
    }

    const snapshot = withFollowUpLayout(result.snapshot, input.priorTurnsCount, input.intent)
    for await (const event of emitSnapshotEvents(snapshot, {
      emitThinking: true,
      emitComplete: false,
    })) {
      if (input.signal?.aborted === true) {
        break
      }
      input.send(event)
    }
    return { snapshot, toolCalls: result.toolCalls, errorCopyId: undefined }
  } catch {
    const copyId = makeCopyId()
    input.send({ type: 'error', code: 'answer_turn_failed', copyId })
    return { snapshot: undefined, toolCalls: [], errorCopyId: copyId }
  }
}

async function streamBoundaryTurn(
  input: {
    query: string
    intent: FollowUpIntent
    priorTurnsCount: number
    priorProviders: AnswerSource[]
    signal: AbortSignal | undefined
    send: (event: AnswerEvent) => void
  },
  kind: 'boundary_explain' | 'unsupported',
): Promise<{ snapshot: AnswerSnapshot | undefined; toolCalls: AnswerToolCallRecord[]; errorCopyId: string | undefined }> {
  const providers = reindexProviders(input.priorProviders)
  const oneLine = kind === 'boundary_explain' ? buildBoundaryOneLine() : buildUnsupportedOneLine()
  const summary =
    kind === 'boundary_explain'
      ? buildBoundarySummary(providers)
      : buildUnsupportedSummary(providers)
  const nextStep =
    kind === 'boundary_explain'
      ? buildBoundaryNextStep(providers)
      : buildUnsupportedNextStep(providers)

  const snapshot = withFollowUpLayout(
    {
      query: input.query,
      oneLine,
      providers,
      summary,
      nextStep,
      agentJsonUrl: buildAgentJsonUrl(input.query, DEFAULT_LIMIT),
    },
    input.priorTurnsCount,
    input.intent,
  )

  for await (const event of emitSnapshotEvents(snapshot, {
    emitThinking: true,
    emitComplete: false,
  })) {
    if (input.signal?.aborted === true) {
      break
    }
    input.send(event)
  }
  return { snapshot, toolCalls: [], errorCopyId: undefined }
}

function withFollowUpLayout(
  snapshot: AnswerSnapshot,
  priorTurnsCount: number,
  intent: FollowUpIntent,
): AnswerSnapshot {
  const compactLayout = priorTurnsCount > 0
  const layoutProfile = computeLayoutProfile({
    providerCount: snapshot.providers.length,
    ...(compactLayout ? { compactLayout: true } : {}),
    followUpIntent: intent,
  })
  return {
    ...snapshot,
    ...(compactLayout ? { compactLayout: true } : {}),
    layoutProfile,
  }
}

async function readPriorCompleteTurns(threadId: string | undefined) {
  if (threadId === undefined) {
    return [] as AnswerTurnRecordLite[]
  }

  try {
    return (await getThreadTurns(threadId)).turns.filter((turn) => turn.status === 'complete')
  } catch {
    return []
  }
}

type AnswerTurnRecordLite = Pick<AnswerTurnRecord, 'evidenceJson' | 'query' | 'status'>

async function persistTurn(input: {
  sessionId: string
  threadId: string
  isNewThread: boolean
  title: string
  turnId: string
  turnSeq: number
  query: string
  intent: FollowUpIntent
  captured: AnswerSnapshot | undefined
  errorCopyId: string | undefined
  toolCalls: readonly AnswerToolCallRecord[]
}): Promise<boolean> {
  const status = input.captured !== undefined ? 'complete' : 'error'
  const evidence = input.captured !== undefined ? buildFrozenEvidence(input.captured, input.toolCalls) : emptyEvidence()
  const prose = input.captured !== undefined ? buildFrozenProse(input.captured) : emptyProse()
  const snapshotHash = stableHash({
    query: input.query,
    intent: input.intent,
    providers: evidence.providers.map((provider) => provider.slug),
    prose,
    ...(input.toolCalls.length === 0 ? {} : { toolCalls: input.toolCalls.map((call) => call.resultHash) }),
  }).toString()

  try {
    if (input.isNewThread) {
      await createAnswerThread({
        threadId: input.threadId,
        pseudonymousSessionId: input.sessionId,
        title: input.title,
      })
    }

    await appendAnswerTurnWithToolCalls({
      turnId: input.turnId,
      threadId: input.threadId,
      pseudonymousSessionId: input.sessionId,
      seq: input.turnSeq,
      query: input.query,
      intent: input.intent,
      evidenceJson: JSON.stringify(evidence),
      snapshotHash,
      proseJson: JSON.stringify(prose),
      artifactKindsJson: JSON.stringify(
        input.captured === undefined ? [] : buildArtifactsFromSnapshot(input.captured).map((artifact) => artifact.kind),
      ),
      status,
      ...(input.errorCopyId === undefined ? {} : { errorCopyId: input.errorCopyId }),
      toolCalls: input.toolCalls.map((call) => ({
        toolCallId: call.toolCallId,
        seq: call.seq,
        toolId: call.toolId,
        inputJson: call.inputJson,
        resultSummaryJson: call.resultSummaryJson,
        resultHash: call.resultHash,
        status: call.status,
      })),
    })
    return true
  } catch {
    return false
  }
}

function collectFrozenProviders(priorTurns: readonly { evidenceJson: string }[]): AnswerSource[] {
  const slugs = new Set<string>()
  const providers: AnswerSource[] = []

  for (const turn of priorTurns) {
    const evidence = parseFrozenEvidence(turn.evidenceJson)
    for (const provider of evidence.providers) {
      if (slugs.has(provider.slug)) {
        continue
      }
      slugs.add(provider.slug)
      providers.push(provider)
    }
  }

  return providers
}

function collectFrozenAllowedSlugs(priorTurns: readonly { evidenceJson: string }[]): string[] {
  const slugs = new Set<string>()
  for (const turn of priorTurns) {
    const evidence = parseFrozenEvidence(turn.evidenceJson)
    for (const slug of evidence.allowedSlugs) {
      slugs.add(slug)
    }
  }
  return [...slugs]
}

function reindexProviders(providers: readonly AnswerSource[]): AnswerSource[] {
  return providers.map((provider, index) => ({
    ...provider,
    citationIndex: index + 1,
  }))
}

function buildFrozenEvidence(
  snapshot: AnswerSnapshot,
  toolCalls: readonly AnswerToolCallRecord[],
): FrozenTurnEvidence {
  return {
    providers: snapshot.providers,
    allowedSlugs: snapshot.providers.map((provider) => provider.slug),
    agentJsonUrl: snapshot.agentJsonUrl,
    ...(toolCalls.length === 0 ? {} : { toolCalls }),
  }
}

function buildFrozenProse(snapshot: AnswerSnapshot): FrozenTurnProse {
  return {
    oneLine: snapshot.oneLine,
    summary: snapshot.summary,
    nextStep: snapshot.nextStep,
    ...(snapshot.compactLayout === true ? { compactLayout: true } : {}),
    ...(snapshot.layoutProfile === undefined ? {} : { layoutProfile: snapshot.layoutProfile }),
  }
}

function emptyEvidence(): FrozenTurnEvidence {
  return { providers: [], allowedSlugs: [], agentJsonUrl: '' }
}

function emptyProse(): FrozenTurnProse {
  return { oneLine: '', summary: '', nextStep: '' }
}

function makeCopyId(): string {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
