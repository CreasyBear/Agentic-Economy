import { z } from 'zod'

import type { AnswerArtifact } from '@/modules/answer/answer-schema'
import type { AnswerSource } from '@/modules/answer/answer-synthesizer'
import type { AnswerLayoutProfile } from '@/modules/answer/layout-profile'

export const FollowUpIntentValues = [
  'refine_search',
  'filter_known',
  'compare_known',
  'explain_boundary',
  'unsupported',
] as const

export type FollowUpIntent = (typeof FollowUpIntentValues)[number]

export const AnswerTurnStatusValues = ['pending', 'complete', 'error'] as const
export type AnswerTurnStatus = (typeof AnswerTurnStatusValues)[number]

export const AnswerToolCallStatusValues = ['complete', 'error', 'refused'] as const
export type AnswerToolCallStatus = (typeof AnswerToolCallStatusValues)[number]

export const AnswerToolIdValues = ['registry.search', 'registry.detail'] as const
export type AnswerToolId = (typeof AnswerToolIdValues)[number]

export const AnswerThreadSharePolicyValues = ['public', 'unlisted'] as const
export type AnswerThreadSharePolicy = (typeof AnswerThreadSharePolicyValues)[number]

export const ThinkingStepValues = ['search', 'read', 'write'] as const
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
  resultHash: string
  status: AnswerToolCallStatus
  createdAt: number
}

export type PublicThreadTurn = {
  turnId: string
  seq: number
  query: string
  intent: FollowUpIntent
  status: AnswerTurnStatus
  artifacts: readonly AnswerArtifact[]
  oneLine: string
  layoutProfile?: AnswerLayoutProfile
}

export type PublicThreadProjection = {
  threadId: string
  title: string
  turns: readonly PublicThreadTurn[]
}

export type AnswerTurnRequest = {
  threadId?: string
  query: string
}

export const answerTurnRequestSchema = z.object({
  threadId: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).max(200),
})

export type FrozenTurnEvidence = {
  providers: readonly AnswerSource[]
  allowedSlugs: readonly string[]
  agentJsonUrl: string
  /** Tool-call evidence persisted per turn; absent on legacy frozen turns. */
  toolCalls?: readonly AnswerToolCallRecord[]
}

export type FrozenTurnProse = {
  oneLine: string
  summary: string
  nextStep: string
  compactLayout?: boolean
  layoutProfile?: AnswerLayoutProfile
}
