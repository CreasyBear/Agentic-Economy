export type JevChoiceQuestion = Readonly<{
  type: 'choice'
  instructions: string
  criteria: Readonly<Record<string, string | null>>
}>

export type JevScoreQuestion = Readonly<{
  type: 'score'
  instructions: string
  criteria: readonly string[]
}>

export type JevNoulQuestion = Readonly<{
  type: 'noul'
  instructions: string
  criteria?: Readonly<{ true?: string; false?: string }>
}>

export type JevQuestion = JevChoiceQuestion | JevScoreQuestion | JevNoulQuestion

export type JevChoiceAnswer = Readonly<{
  type: 'choice'
  choice: string
  probabilities: Readonly<Record<string, number>>
  confidence: number
}>

export type JevScoreAnswer = Readonly<{
  type: 'score'
  score: number
  legend: Readonly<Record<string, string>>
  probabilities: Readonly<Record<string, number>>
  confidence: number
}>

export type JevNoulAnswer = Readonly<{
  type: 'noul'
  noul: number
}>

export type JevAnswer = JevChoiceAnswer | JevScoreAnswer | JevNoulAnswer

export type DecisionTier =
  | 'jev_system_one'
  | 'secondary_llm_adapter'
  | 'deterministic_rule_engine'
  | 'safe_refusal'

export type DecisionGatewayRequest = Readonly<{
  state: Readonly<Record<string, unknown>> | string
  questions: Readonly<Record<string, JevQuestion>>
}>

export type DecisionGatewayUsage = Readonly<{
  inputTokens: number
  outputTokens: number
  estimatedCostAud: string
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
  openrouterApiKey?: string
  jevModel?: string
  secondaryModel?: string
  disableJev?: boolean
  disableSecondaryLlm?: boolean
  fetchImpl?: typeof fetch
}>
