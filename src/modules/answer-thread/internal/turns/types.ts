import {
  type AnswerEvent,
  type AnswerSnapshot,
  type AnswerSource,
  type AnswerWorkStep,
  computeLayoutProfile,
} from '@/modules/answer/public'
import type { HarnessModelRequestRecord } from '@/modules/harness/public'
import type { AeSearchContext } from '@/modules/answer/search-context'

import type {
  AnswerRunGateSummary,
  AnswerToolCallRecord,
  AnswerTurnTimingEntry,
  FollowUpIntent,
} from '../../answer-thread.schema'
import type { FinalizeAnswerTurnSnapshotResult } from '../answer-turn-safety'
import { ANSWER_SEARCH_PROVIDER_LIMIT } from '../answer-response-planner'
import type { LiveAnswerHarnessOperation } from '../answer-harness-operation'

export const DEFAULT_TURN_PROVIDER_LIMIT = ANSWER_SEARCH_PROVIDER_LIMIT

export type TurnPathId =
  | 'clarification'
  | 'retrieval_first'
  | 'retrieval_empty'
  | 'frozen_filter'
  | 'frozen_compare'
  | 'agent'
  | 'proposal'
  | 'inquiry_handoff'
  | 'boundary_explain'
  | 'unsupported'

type StreamPlanEvent = Extract<AnswerEvent, { type: 'plan' }>
export type StreamPlanMode = StreamPlanEvent['mode']
export type SnapshotPlanInput = Pick<StreamPlanEvent, 'mode' | 'providerBudget' | 'artifactBudget'>
export type SnapshotPlanMetadata = {
  plan?: SnapshotPlanInput
  planMode?: StreamPlanMode
}
export type SnapshotAssemblyPlan = {
  path: string
  metadata?: SnapshotPlanMetadata
}

export type TurnPathResult = {
  snapshot: AnswerSnapshot | undefined
  toolCalls: AnswerToolCallRecord[]
  modelRequests?: readonly HarnessModelRequestRecord[]
  allowedSlugs: ReadonlySet<string>
  errorCopyId: string | undefined
  gate: AnswerRunGateSummary | undefined
  assembly?: SnapshotAssemblyPlan
}

export type WorkStepEmitter = {
  emit: (step: AnswerWorkStep) => void
  entries: () => AnswerWorkStep[]
}

export type TurnTimingCollector = {
  start: (
    name: string,
    metadata?: Record<string, string | number | boolean | null>,
  ) => (metadata?: Record<string, string | number | boolean | null>) => void
  record: (
    name: string,
    durationMs: number,
    metadata?: Record<string, string | number | boolean | null>,
  ) => void
  add: (
    entries: readonly AnswerTurnTimingEntry[],
    metadata?: Record<string, string | number | boolean | null>,
  ) => void
  entries: () => readonly AnswerTurnTimingEntry[]
}

export type TurnPathContext = {
  sessionId: string
  threadId: string
  turnId: string
  sourceWriteRequest: Request | undefined
  query: string
  intent: FollowUpIntent
  priorTurnsCount: number
  priorProviders: AnswerSource[]
  priorAllowedSlugs: readonly string[]
  searchContext: AeSearchContext | undefined
  signal: AbortSignal | undefined
  send: (event: AnswerEvent) => void
  timings: TurnTimingCollector
  workLog: WorkStepEmitter
  harness: LiveAnswerHarnessOperation
  deferAssembly?: boolean
  emitOrDeferSnapshot: (
    snapshot: AnswerSnapshot,
    path: string,
    metadata?: SnapshotPlanMetadata,
  ) => Promise<SnapshotAssemblyPlan | undefined>
}

export type TurnPath<TArgs extends readonly unknown[] = readonly []> = {
  readonly id: TurnPathId
  run(ctx: TurnPathContext, ...args: TArgs): Promise<TurnPathResult | undefined>
}

export function withFollowUpLayout(
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

export function rejectBlockedSnapshot(
  ctx: Pick<TurnPathContext, 'send'>,
  toolCalls: readonly AnswerToolCallRecord[],
  allowedSlugs: ReadonlySet<string>,
  blocked: Extract<FinalizeAnswerTurnSnapshotResult, { ok: false }>,
): TurnPathResult {
  ctx.send({ type: 'error', code: blocked.code, copyId: blocked.copyId })
  return {
    snapshot: undefined,
    toolCalls: [...toolCalls],
    allowedSlugs,
    errorCopyId: blocked.copyId,
    gate: blocked.gate,
  }
}

export function reindexProviders(providers: readonly AnswerSource[]): AnswerSource[] {
  return providers.map((provider, index) => ({
    ...provider,
    citationIndex: index + 1,
  }))
}

export function providerNameList(providers: readonly AnswerSource[]): string {
  const names = providers.map((provider) => provider.name)
  if (names.length <= 2) {
    return names.join(' and ')
  }
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`
}

export function makeCopyId(): string {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function describeProviderCount(count: number, noun: string): string {
  if (count === 0) {
    return `No ${noun}es found.`
  }
  if (count === 1) {
    return `1 ${noun} found.`
  }
  return `${count} ${noun}es found.`
}

export function emitReadAndCompareSteps(
  workLog: WorkStepEmitter,
  providers: readonly AnswerSource[],
): void {
  const completedAt = Date.now()
  workLog.emit({
    id: 'read.providers',
    phase: 'read',
    status: 'complete',
    title: 'Reading listed businesses',
    summary: providers.length === 0
      ? 'No listed businesses were returned for this search.'
      : describeProviderCount(providers.length, 'listed business'),
    detailRows: [{ label: 'Listed businesses', value: String(providers.length) }],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    completedAtMs: completedAt,
  })

  workLog.emit({
    id: 'compare.fit',
    phase: 'compare',
    status: 'complete',
    title: 'Checking fit',
    summary: providers.length === 0
      ? 'No listed businesses fit this request yet.'
      : 'Keeping listed businesses whose published details fit this request.',
    detailRows: [{ label: 'Kept for answer', value: String(providers.length) }],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    completedAtMs: completedAt,
  })
}
