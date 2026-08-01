import { z } from 'zod'

import type { AnswerArtifact } from '@/modules/answer/answer-schema'
import type { AnswerSource, AnswerWorkStep } from '@/modules/answer/answer-synthesizer'
import type { AnswerLayoutProfile } from '@/modules/answer/layout-profile'
import type { HarnessRunReport } from '@/modules/harness/public'
import type { WebDiscoveryClaim } from '@/modules/storefront/public'
import {
  AeSearchContextSchema,
  type AeSearchContext,
} from '@/modules/answer/search-context'

export const FollowUpIntentValues = [
  'refine_search',
  'filter_known',
  'compare_known',
  'inquiry_handoff',
  'explain_boundary',
  'unsupported',
] as const

export type FollowUpIntent = (typeof FollowUpIntentValues)[number]

export const AnswerTurnStatusValues = ['pending', 'complete', 'error'] as const
export type AnswerTurnStatus = (typeof AnswerTurnStatusValues)[number]

export const AnswerToolCallStatusValues = ['complete', 'error', 'refused'] as const
export type AnswerToolCallStatus = (typeof AnswerToolCallStatusValues)[number]
export const AnswerToolIdValues = ['registry.search', 'registry.detail', 'sandbox.checkup_quote', 'web.discover'] as const
export type AnswerToolId = (typeof AnswerToolIdValues)[number]

export const AnswerThreadSharePolicyValues = ['public', 'unlisted'] as const
export type AnswerThreadSharePolicy = (typeof AnswerThreadSharePolicyValues)[number]

const ThinkingStepValues = ['search', 'read', 'write'] as const
export type ThinkingStep = (typeof ThinkingStepValues)[number]

export type AnswerThreadRecord = {
  threadId: string
  pseudonymousSessionId: string
  title: string
  sharePolicy: AnswerThreadSharePolicy
  createdAt: number
  updatedAt: number
}

export type AnswerTurnRecord = {
  turnId: string
  threadId: string
  seq: number
  query: string
  intent: FollowUpIntent
  evidenceJson: string
  snapshotHash: string
  proseJson: string
  artifactKindsJson: string
  status: AnswerTurnStatus
  errorCopyId?: string
  createdAt: number
}

export type AnswerToolCallResultSummary = {
  slugs: readonly string[]
  count: number
  /** Present only on error/refused records. */
  errorCode?: string
}

export type AnswerToolCallRecord = {
  toolCallId: string
  turnId: string
  seq: number
  toolId: AnswerToolId
  inputJson: string
  resultSummaryJson: string
  resultJson: string
  resultHash: string
  status: AnswerToolCallStatus
  createdAt: number
}

export type AnswerTurnTimingEntry = {
  name: string
  durationMs: number
  atMs: number
  metadata?: Record<string, string | number | boolean | null>
}

export type AnswerRunToolCounters = {
  total: number
  complete: number
  error: number
  refused: number
  totalDurationMs: number
}

export type AnswerRunWorkLogCounters = {
  total: number
  complete: number
  running: number
  skipped: number
  error: number
  stopped: number
}

export type AnswerRunTimingCounters = {
  count: number
  totalDurationMs: number
}

export type AnswerRunGateSummary = {
  ok: boolean
  source: 'answer_gate' | 'turn_status'
  code?: string
}

export type AnswerRunSummary = {
  schemaVersion: 1
  turn: {
    intent: FollowUpIntent
    status: AnswerTurnStatus
  }
  tools: {
    total: number
    complete: number
    error: number
    refused: number
    totalDurationMs: number
    byName: Partial<Record<AnswerToolId, AnswerRunToolCounters>>
  }
  evidence: {
    providerCount: number
    allowedSlugCount: number
    resultHashes: readonly string[]
    snapshotHash: string
  }
  workLog: AnswerRunWorkLogCounters
  timings: {
    totalEntries: number
    totalDurationMs: number
    byName: Record<string, AnswerRunTimingCounters>
  }
  gates: AnswerRunGateSummary
}

export type AnswerRunCoverage = {
  toolsAvailable: readonly AnswerToolId[]
  toolsInvoked: readonly AnswerToolId[]
  toolsUnused: readonly AnswerToolId[]
  workLogPhases: readonly string[]
  hasProviders: boolean
  hasAllowedSlugs: boolean
  hasSnapshotHash: boolean
}

export type AnswerRunReport = {
  summary: AnswerRunSummary
  coverage: AnswerRunCoverage
}

export type PublicAnswerCheckSummary = {
  catalogSearches: number
  listingsRead: number
  listedBusinesses: number
  checksPassed: number
  checksFailed: number
  elapsedMs: number
}

export type PublicThreadTurn = {
  turnId: string
  seq: number
  query: string
  intent: FollowUpIntent
  status: AnswerTurnStatus
  workLog: readonly AnswerWorkStep[]
  artifacts: readonly AnswerArtifact[]
  oneLine: string
  layoutProfile?: AnswerLayoutProfile
  decisionMapRevision?: number
  answerCheckSummary?: PublicAnswerCheckSummary
  timing?: AeSearchContext['timing']
  timingDate?: string
  createdAt?: number
}

export type PublicThreadProjection = {
  threadId: string
  title: string
  turns: readonly PublicThreadTurn[]
}

export type AnswerTurnRequest = {
  threadId?: string
  query: string
  searchContext?: AeSearchContext
}

export const answerTurnRequestSchema = z.object({
  threadId: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).max(200),
  searchContext: AeSearchContextSchema.optional(),
})

export type FrozenTurnEvidence = {
  providers: readonly AnswerSource[]
  importedClaims?: readonly WebDiscoveryClaim[]
  allowedSlugs: readonly string[]
  agentJsonUrl: string
  searchContext?: AeSearchContext
  toolCalls?: readonly AnswerToolCallRecord[]
  /** Internal timing trace for answer quality/performance audits. */
  timings?: readonly AnswerTurnTimingEntry[]
  /** Public work log persisted so replay shows the same visible process as the live stream. */
  workLog?: readonly AnswerWorkStep[]
  /** Private OMP-style rollup used for debugging/evals; public projection exposes only sanitized counts. */
  answerRun?: AnswerRunReport
  /** Internal reusable harness rollup; never exposed through public thread projection. */
  harnessRun?: HarnessRunReport
  /** Private source-write receipt proving the final harness report and replay journal landed together. */
  harnessFinalization?: {
    schemaVersion: 1
    status: 'accepted' | 'replayed'
    finalizationHash: string
    journalEntryCount: number
    finalizedAt: number
  }
}

export type FrozenTurnProse = {
  oneLine: string
  summary: string
  nextStep: string
  compactLayout?: boolean
  layoutProfile?: AnswerLayoutProfile
  decisionMapRevision?: number
}
