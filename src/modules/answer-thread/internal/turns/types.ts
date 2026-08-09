import { createPrefixedRandomId } from '@/modules/common/random-id'

import {
  buildAnswerTurnProblem,
  type AnswerEvent,
  type AnswerSnapshot,
  type AnswerSource,
  type AnswerTurnProblem,
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
  errorProblem?: AnswerTurnProblem
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
  /** Canonical query used for a fresh registry search; display query stays user-authored. */
  registryQuery?: string
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
  toolCalls: readonly AnswerToolCallRecord[],
  allowedSlugs: ReadonlySet<string>,
  blocked: Extract<FinalizeAnswerTurnSnapshotResult, { ok: false }>,
): TurnPathResult {
  const errorProblem = buildAnswerTurnProblem(blocked.code)
  return {
    snapshot: undefined,
    toolCalls: [...toolCalls],
    allowedSlugs,
    errorCopyId: blocked.copyId,
    errorProblem,
    gate: blocked.gate,
  }
}
export function reindexProviders(providers: readonly AnswerSource[]): AnswerSource[] {
  return providers.map((provider, index) => ({
    ...provider,
    citationIndex: index + 1,
  }))
}

export function makeCopyId(): string {
  return createPrefixedRandomId(`turn-${Date.now().toString(36)}-`)
}

export function describeProviderCount(count: number, _noun: string): string {
  if (count === 0) {
    return 'No matches found yet.'
  }
  if (count === 1) {
    return '1 match found.'
  }
  return `${count} matches found.`
}

export function emitReadAndCompareSteps(
  workLog: WorkStepEmitter,
  providers: readonly AnswerSource[],
): void {
  if (providers.length === 0) {
    return
  }

  const completedAt = Date.now()
  workLog.emit({
    id: 'read.providers',
    phase: 'read',
    status: 'complete',
    title: 'Reading the details',
    summary: describeProviderCount(providers.length, 'match'),
    detailRows: [{ label: 'Matches', value: String(providers.length) }],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    completedAtMs: completedAt,
  })

  workLog.emit({
    id: 'compare.fit',
    phase: 'compare',
    status: 'complete',
    title: 'Comparing the matches',
    summary: 'Keeping matches whose published details match what you need.',
    detailRows: [{ label: 'Kept for answer', value: String(providers.length) }],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    completedAtMs: completedAt,
  })
}
