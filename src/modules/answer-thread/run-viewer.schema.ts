import type { AnswerTurnRecord } from '@/modules/answer-thread/answer-thread.schema'
import type {
  AnswerTurnStatus,
  PublicThreadTurn,
} from '@/modules/answer-thread/public'
import type { AnswerToolCallRecord } from '@/modules/answer-thread/harness'
import type {
  HarnessRunReport,
  HarnessRunStatus,
  HarnessToolStatus,
} from '@/modules/harness/harness.schema'

export const HarnessRunViewerStatusFilterValues = [
  'any',
  'pending',
  'complete',
  'ok',
  'error',
  'refused',
  'blocked',
  'timeout',
  'aborted',
  'skipped',
  'missing',
] as const
export type HarnessRunViewerStatusFilter = (typeof HarnessRunViewerStatusFilterValues)[number]

export const HarnessRunViewerEvidenceFilterValues = ['any', 'yes', 'no'] as const
export type HarnessRunViewerEvidenceFilter = (typeof HarnessRunViewerEvidenceFilterValues)[number]

export type HarnessRunViewerFilters = {
  status?: HarnessRunViewerStatusFilter | undefined
  turnId?: string | undefined
  threadId?: string | undefined
  date?: string | undefined
  hasRunEvidence?: HarnessRunViewerEvidenceFilter | undefined
}

export type HarnessRunViewerSourceState = { kind: 'configured' }

export type HarnessRunViewerDeniedReason =
  | 'missing_membership'
  | 'inactive_membership'
  | 'action_not_allowed'

export type HarnessRunViewerAccessDenied = {
  kind: 'denied'
  httpStatus: 401 | 403
  reason: HarnessRunViewerDeniedReason
  generatedAt: number
  publicMessage: string
  filters: HarnessRunViewerFilters
  rows: readonly []
}

export type HarnessRunViewerRunSource = 'harnessRun' | 'missing'

export type HarnessRunViewerSummary = {
  turns: number
  withHarnessRun: number
  missingRunEvidence: number
  attention: number
}

export type HarnessRunViewerListRow = {
  rowId: string
  turnId: string
  threadId: string
  seq: number
  queryPreview: string
  turnStatus: AnswerTurnStatus
  runStatus: HarnessRunStatus | 'missing'
  runSource: HarnessRunViewerRunSource
  hasRunEvidence: boolean
  hasAnswerRun: boolean
  providerCount: number
  toolCallCount: number
  catalogSearches: number
  listingsRead: number
  checksPassed: number
  checksFailed: number
  elapsedMs: number
  createdAt: number
  runId?: string | undefined
  sessionId?: string | undefined
}

export type HarnessRunViewerListAllowed = {
  kind: 'allowed'
  httpStatus: 200
  generatedAt: number
  actorRef: string
  filters: HarnessRunViewerFilters
  source?: HarnessRunViewerSourceState | undefined
  summary: HarnessRunViewerSummary
  rows: readonly HarnessRunViewerListRow[]
}

export type HarnessRunViewerListResult = HarnessRunViewerAccessDenied | HarnessRunViewerListAllowed

export type HarnessRunViewerTurnRef = Pick<
  AnswerTurnRecord,
  | 'turnId'
  | 'threadId'
  | 'seq'
  | 'query'
  | 'intent'
  | 'status'
  | 'snapshotHash'
  | 'createdAt'
  | 'errorCopyId'
>

export type HarnessRunViewerRunOverview = {
  source: HarnessRunViewerRunSource
  status: HarnessRunStatus | 'missing'
  hasHarnessRun: boolean
  hasAnswerRun: boolean
  runId?: string | undefined
  sessionId?: string | undefined
  startedAt?: number | undefined
  endedAt?: number | undefined
  durationMs: number
  report?: HarnessRunReport | undefined
}

export type HarnessRunViewerToolRow = {
  id: string
  toolId: string
  status: HarnessToolStatus | AnswerToolCallRecord['status']
  count: number
  durationMs: number
  errorCode?: string | undefined
  resultHash?: string | undefined
  seq?: number | undefined
}

export type HarnessRunViewerPhaseRow = {
  id: string
  phase: string
  status: HarnessToolStatus
  count: number
  durationMs: number
  errorCode?: string | undefined
}

export type HarnessRunViewerEvidenceSummary = {
  providerCount: number
  allowedSlugCount: number
  toolCallCount: number
  timingCount: number
  workLogCount: number
  resultHashes: readonly string[]
  agentJsonUrl?: string | undefined
  artifactKinds: readonly string[]
}

export type HarnessRunViewerPublicProjectionDiff = {
  publicTurn: PublicThreadTurn
  serializedPublicProjection: string
  forbiddenMarkers: readonly string[]
  leakedMarkers: readonly string[]
  excludedPrivateMarkers: readonly string[]
}

export type HarnessRunViewerRawJson = {
  turnJson: string
  evidenceJson: string
  proseJson: string
  artifactKindsJson: string
}

export type HarnessRunViewerDetail = {
  turn: HarnessRunViewerTurnRef
  run: HarnessRunViewerRunOverview
  tools: readonly HarnessRunViewerToolRow[]
  phases: readonly HarnessRunViewerPhaseRow[]
  evidence: HarnessRunViewerEvidenceSummary
  publicProjection: HarnessRunViewerPublicProjectionDiff
  rawJson: HarnessRunViewerRawJson
}

export type HarnessRunViewerDetailAllowed = {
  kind: 'allowed'
  httpStatus: 200
  generatedAt: number
  actorRef: string
  filters: HarnessRunViewerFilters
  source?: HarnessRunViewerSourceState | undefined
  rows: readonly HarnessRunViewerListRow[]
  detail: HarnessRunViewerDetail
}

export type HarnessRunViewerDetailNotFound = {
  kind: 'not_found'
  httpStatus: 404
  generatedAt: number
  filters: HarnessRunViewerFilters
  source?: HarnessRunViewerSourceState | undefined
  turnId: string
  publicMessage: string
  rows: readonly []
}

export type HarnessRunViewerDetailResult =
  | HarnessRunViewerAccessDenied
  | HarnessRunViewerDetailNotFound
  | HarnessRunViewerDetailAllowed

export type HarnessRunViewerSourceTurn = AnswerTurnRecord

export type HarnessRunViewerDetailInput = {
  turnId: string
  turns: readonly HarnessRunViewerSourceTurn[]
  actorRef: string
  generatedAt?: number | undefined
  filters?: HarnessRunViewerFilters | undefined
  source?: HarnessRunViewerSourceState | undefined
}

export type HarnessRunViewerListInput = {
  turns: readonly HarnessRunViewerSourceTurn[]
  actorRef: string
  generatedAt?: number | undefined
  filters?: HarnessRunViewerFilters | undefined
  source?: HarnessRunViewerSourceState | undefined
}

export type HarnessRunViewerDeniedInput = {
  reason: HarnessRunViewerDeniedReason
  generatedAt?: number | undefined
  filters?: HarnessRunViewerFilters | undefined
  publicMessage?: string | undefined
}

export type HarnessRunViewerAccess =
  | { kind: 'allowed'; actorRef: string }
  | { kind: 'denied'; reason: HarnessRunViewerDeniedReason; publicMessage?: string | undefined }

export type HarnessRunViewerListAccessInput = {
  access: HarnessRunViewerAccess
  turns: readonly HarnessRunViewerSourceTurn[]
  generatedAt?: number | undefined
  filters?: HarnessRunViewerFilters | undefined
  source?: HarnessRunViewerSourceState | undefined
}

export type HarnessRunViewerDetailAccessInput = HarnessRunViewerListAccessInput & {
  turnId: string
}
