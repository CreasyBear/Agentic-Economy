import type {
  ChoiceCriteria,
  ChoiceQuestion,
  ChoiceResponse,
  Description,
  EntryType,
  NoulQuestion,
  NoulResponse,
  Question,
  Questions,
  ScoreCriteria,
  ScoreQuestion,
  ScoreResponse,
  SystemOneRequest,
  SystemOneResult,
  Usage,
} from '@typesafe-ai/sdk'

export type JevChoiceQuestion = ChoiceQuestion
export type JevChoiceAnswer = ChoiceResponse
export type JevDescription = Description
export type JevEntryType = EntryType
export type JevNoulQuestion = NoulQuestion
export type JevNoulAnswer = NoulResponse
export type JevQuestion = Question
export type JevQuestions = Questions
export type JevScoreQuestion = ScoreQuestion
export type JevScoreAnswer = ScoreResponse
export type JevUsage = Usage

export type {
  ChoiceCriteria,
  Description,
  EntryType,
  ScoreCriteria,
  SystemOneRequest,
  SystemOneResult,
}

export type JevAnswer = JevChoiceAnswer | JevScoreAnswer | JevNoulAnswer

export type DecisionTier =
  | 'jev_system_one'
  | 'secondary_llm_adapter'
  | 'deterministic_rule_engine'
  | 'safe_refusal'

export type DecisionGatewayRequest = Readonly<{
  state: EntryType | Record<string, unknown>
  questions: Questions
}>

export type DecisionGatewayUsage = Readonly<{
  /** Observed totals only. Null means unknown, including an unmetered failed attempt. */
  inputTokens: number | null
  outputTokens: number | null
  /** No estimate is supplied without a versioned rate and currency policy. */
  estimatedCostAud: string | null
}>

export type DecisionGatewayResponse = Readonly<{
  tier: DecisionTier
  model: string
  answers: Readonly<Record<string, JevAnswer>>
  usage: DecisionGatewayUsage
  durationMs: number
  attemptedTiers: readonly DecisionTier[]
}>

export type DecisionGatewayOptions = Readonly<{
  timeoutMs?: number
  signal?: AbortSignal
  deadlineAt?: number
  purpose?: 'discovery' | 'provider_source'
  maxRetries?: number
  openrouterApiKey?: string
  typesafeApiKey?: string
  baseURL?: string
  jevModel?: string
  secondaryModel?: string
  disableJev?: boolean
  disableSecondaryLlm?: boolean
  fetchImpl?: typeof fetch
}>

/** Operational inference failure; contains no upstream payload or credential. */
export class JevUnavailableError extends Error {
  constructor(readonly reason:
    | 'disabled' | 'missing_key' | 'cancelled' | 'timeout' | 'rate_limited'
    | 'authentication' | 'service_unavailable' | 'connection' | 'invalid_response'
    | 'evidence_too_large') {
    super(`jev_${reason}`)
    this.name = 'JevUnavailableError'
  }
}
