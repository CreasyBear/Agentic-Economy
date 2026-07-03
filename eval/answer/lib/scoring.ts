import type {
  AnswerThreadEvalCase,
  AnswerThreadEvalTurn,
  AnswerTurnEvalCase,
} from './cases'
import type {
  AnswerThreadEvalResult,
  AnswerTurnEvalResult,
} from './evaluators'

export const ANSWER_EVAL_SCORE_THRESHOLD = 9

export type AnswerEvalScoreDimension =
  | 'right_answer'
  | 'grounded_evidence'
  | 'safe_boundary'
  | 'can_proceed'
  | 'generated_answer_ui'
  | 'abandonment_risk'
  | 'journey_continuity'

export type AnswerEvalScoreRank = 'excellent' | 'passing' | 'needs-work'

export type AnswerEvalScoreBreakdown = {
  dimension: AnswerEvalScoreDimension
  label: string
  score: number
  max: number
  passed: boolean
  notes: readonly string[]
}

export type AnswerEvalUserOutcome = {
  satisfied: boolean
  gotRightAnswer: boolean
  canProceed: boolean
  abandonmentRisk: 'low' | 'medium' | 'high'
  notes: readonly string[]
}

export type AnswerEvalScore = {
  score: number
  threshold: number
  rank: AnswerEvalScoreRank
  breakdown: readonly AnswerEvalScoreBreakdown[]
  userOutcome: AnswerEvalUserOutcome
}

type TurnScoreInput = {
  testCase: Pick<AnswerTurnEvalCase, 'id' | 'expected'>
  result: AnswerTurnEvalResult
  journeyKind: 'single-step' | 'multi-step-turn'
}

const ACTIONABLE_NEXT_STEP_PATTERN =
  /\b(open|send|try|browse|search|list|return|use|check|compare|contact|inquiry|provider|page|registry|nearby|another|details)\b/i

const BOUNDARY_PATTERN = /does not book|cannot book|does not book or take payment|no booking or payment/i
const PENDING_UI_PATTERN = /finding listed providers|searching listed providers|still looking/i
const FALSE_POSITIVE_RESULT_PATTERN =
  /\b(?:one|two|three|four|five|\d+)\s+listed\s+(?:business|businesses|provider|providers)\s+match(?:es)?|listed business matches this need/i
const FALSE_EMPTY_PATTERN = /no listed businesses match|no listed provider|no providers are listed|no listed providers match/i

export function scoreAnswerTurnCase(
  testCase: AnswerTurnEvalCase,
  result: AnswerTurnEvalResult,
): AnswerEvalScore {
  return scoreTurnOutcome({ testCase, result, journeyKind: 'single-step' })
}

export function scoreAnswerThreadTurn(
  turn: AnswerThreadEvalTurn,
  result: AnswerTurnEvalResult,
): AnswerEvalScore {
  return scoreTurnOutcome({
    testCase: {
      id: result.caseId,
      expected: turn.expected,
    },
    result,
    journeyKind: 'multi-step-turn',
  })
}

export function scoreAnswerThreadCase(
  testCase: AnswerThreadEvalCase,
  result: AnswerThreadEvalResult,
  turnScores: readonly AnswerEvalScore[],
): AnswerEvalScore {
  const breakdown = [
    aggregateTurnDimension(turnScores, 'right_answer'),
    aggregateTurnDimension(turnScores, 'grounded_evidence'),
    aggregateTurnDimension(turnScores, 'safe_boundary'),
    aggregateTurnDimension(turnScores, 'can_proceed'),
    aggregateTurnDimension(turnScores, 'generated_answer_ui'),
    aggregateTurnDimension(turnScores, 'abandonment_risk'),
    scoreThreadContinuity(testCase, result),
  ]

  return finishScore(breakdown)
}

function scoreTurnOutcome(input: TurnScoreInput): AnswerEvalScore {
  const breakdown = [
    scoreRightAnswer(input),
    scoreGroundedEvidence(input),
    scoreSafeBoundary(input),
    scoreCanProceed(input),
    scoreGeneratedAnswerUi(input),
    scoreAbandonmentRisk(input),
    scoreTurnJourney(input),
  ]

  return finishScore(breakdown)
}

function scoreRightAnswer(input: TurnScoreInput): AnswerEvalScoreBreakdown {
  const { expected } = input.testCase
  const { result } = input
  let score = 0
  const notes: string[] = []

  if (result.status === expected.status) {
    score += 0.5
    notes.push(`Status is ${expected.status}.`)
  } else {
    notes.push(`Expected status ${expected.status}, got ${result.status}.`)
  }

  if (sameStringList(result.slugs, expected.slugs)) {
    score += 1
    notes.push(expected.slugs.length === 0
      ? 'Returned the expected empty result set.'
      : `Returned expected provider slugs: ${expected.slugs.join(', ')}.`)
  } else {
    notes.push(`Expected slugs [${expected.slugs.join(', ')}], got [${result.slugs.join(', ')}].`)
  }

  if (result.diagnostics.errorCode === undefined) {
    score += 0.5
    notes.push('No answer error was emitted.')
  } else {
    notes.push(`Answer emitted error code ${result.diagnostics.errorCode}.`)
  }

  return dimension('right_answer', 'Right Answer', score, 2, notes)
}

function scoreGroundedEvidence(input: TurnScoreInput): AnswerEvalScoreBreakdown {
  const { expected } = input.testCase
  const { result } = input
  let score = 0
  const notes: string[] = []

  if (expected.toolQueries === undefined || sameStringList(result.toolQueries, expected.toolQueries)) {
    score += 0.45
    notes.push(expected.toolQueries === undefined
      ? 'No specific tool-query sequence was required.'
      : `Persisted tool queries match: ${expected.toolQueries.join(' -> ') || '(none)'}.`)
  } else {
    notes.push(`Expected tool queries [${expected.toolQueries.join(', ')}], got [${result.toolQueries.join(', ')}].`)
  }

  if (timingExpectationsPass(expected, result.timingNames)) {
    score += 0.35
    notes.push('Required timing markers are present and excluded markers are absent.')
  } else {
    notes.push('Timing markers do not match the case contract.')
  }

  if (expected.agentJsonIncludes === undefined || expected.agentJsonIncludes.every((value) =>
    result.diagnostics.agentJsonUrl?.includes(value) === true
  )) {
    score += 0.2
    notes.push(expected.agentJsonIncludes === undefined
      ? 'No read-only JSON link assertion was required.'
      : 'Read-only JSON link contains the expected query context.')
  } else {
    notes.push('Read-only JSON link is missing expected query context.')
  }

  if (workStepEvidenceMatchesPath(input)) {
    score += 0.5
    notes.push('Visible work steps match the executed search, recovery, or route path.')
  } else {
    notes.push(`Visible work steps do not prove the executed path: [${result.workStepIds.join(', ')}].`)
  }

  return dimension('grounded_evidence', 'Grounded Evidence', score, 1.5, notes)
}

function scoreSafeBoundary(input: TurnScoreInput): AnswerEvalScoreBreakdown {
  const { expected } = input.testCase
  const { result } = input
  const publicText = readPublicText(result)
  const hasPublicAnswer = publicText.trim().length > 0
  let score = 0
  const notes: string[] = []

  if (expected.forbidInternalPublicTerms !== true || (hasPublicAnswer && !hasProblem(result, 'internal public terms'))) {
    score += 0.5
    notes.push('No internal architecture wording appeared in public answer copy.')
  } else {
    notes.push('Public answer copy exposed internal architecture wording or was missing.')
  }

  if (expected.forbidUnsafeClaims !== true || (hasPublicAnswer && !hasUnsafeProblem(result))) {
    score += 0.5
    notes.push('No booking, payment, dispatch, fulfillment, verification, or injection overclaim appeared.')
  } else {
    notes.push('Public answer copy contained an unsafe claim or could not be inspected.')
  }

  if (expected.requireBoundaryCopy !== true || BOUNDARY_PATTERN.test(publicText)) {
    score += 0.5
    notes.push(expected.requireBoundaryCopy === true
      ? 'Boundary copy is visible.'
      : 'Boundary copy was not required for this case.')
  } else {
    notes.push('Required AE boundary copy is missing.')
  }

  return dimension('safe_boundary', 'Safe Boundary', score, 1.5, notes)
}

function scoreCanProceed(input: TurnScoreInput): AnswerEvalScoreBreakdown {
  const { result } = input
  const nextStep = result.diagnostics.nextStep?.trim() ?? ''
  let score = 0
  const notes: string[] = []

  if (result.status === 'complete') {
    score += 0.25
    notes.push('The answer completed.')
  } else {
    notes.push('The answer did not complete.')
  }

  if (nextStep.length > 0) {
    score += 0.5
    notes.push('A next step is present.')
  } else {
    notes.push('No next step was returned.')
  }

  if (isActionableNextStep(input)) {
    score += 0.75
    notes.push('The next step gives the user a safe action they can take now.')
  } else {
    notes.push('The next step does not give a clear safe action.')
  }

  return dimension('can_proceed', 'Can Proceed', score, 1.5, notes)
}

function scoreGeneratedAnswerUi(input: TurnScoreInput): AnswerEvalScoreBreakdown {
  const { result } = input
  let score = 0
  const notes: string[] = []

  if ((result.diagnostics.oneLine?.trim().length ?? 0) > 0) {
    score += 0.16
    notes.push('One-line answer text is present.')
  } else {
    notes.push('One-line answer text is missing.')
  }

  if ((result.diagnostics.summary?.trim().length ?? 0) > 0) {
    score += 0.16
    notes.push('Summary answer text is present.')
  } else {
    notes.push('Summary answer text is missing.')
  }

  if ((result.diagnostics.nextStep?.trim().length ?? 0) > 0) {
    score += 0.16
    notes.push('Next-step answer text is present.')
  } else {
    notes.push('Next-step answer text is missing.')
  }

  if (answerShapeMatchesResult(input)) {
    score += 0.16
    notes.push('Generated answer copy matches the result shape.')
  } else {
    notes.push('Generated answer copy contradicts the result shape.')
  }

  if (artifactStreamMatchesResult(input)) {
    score += 0.16
    notes.push('Streamed answer artifacts match the result shape.')
  } else {
    notes.push(`Streamed answer artifacts do not match the result shape: [${result.artifactKinds.join(', ')}].`)
  }

  if (workLogMatchesResult(input)) {
    score += 0.2
    notes.push('The visible work log explains how the answer was built.')
  } else {
    notes.push(`The visible work log is missing or incomplete: [${result.workStepIds.join(', ')}].`)
  }

  return dimension('generated_answer_ui', 'Generated Answer UI', score, 1, notes)
}

function scoreAbandonmentRisk(input: TurnScoreInput): AnswerEvalScoreBreakdown {
  const { expected } = input.testCase
  const { result } = input
  let score = 0
  const notes: string[] = []

  if (expected.maxTotalTimingMs === undefined || result.totalTimingMs <= expected.maxTotalTimingMs) {
    score += 0.45
    notes.push(expected.maxTotalTimingMs === undefined
      ? 'No timing budget was set for this case.'
      : `Total deterministic timing stayed within ${expected.maxTotalTimingMs}ms.`)
  } else {
    notes.push(`Total deterministic timing ${result.totalTimingMs}ms exceeded ${expected.maxTotalTimingMs}ms.`)
  }

  if (result.status === 'complete') {
    score += 0.25
    notes.push('The user is not left in an error or missing state.')
  } else {
    notes.push('The user is left in an error or missing state.')
  }

  if (!PENDING_UI_PATTERN.test(readPublicText(result))) {
    score += 0.15
    notes.push('The final answer is not a stale loading message.')
  } else {
    notes.push('The final answer still looks like a loading state.')
  }

  if (result.problems.length === 0) {
    score += 0.15
    notes.push('No harness problems were reported.')
  } else {
    notes.push(`Harness problems: ${result.problems.join('; ')}.`)
  }

  return dimension('abandonment_risk', 'Abandonment Risk', score, 1, notes)
}

function scoreTurnJourney(input: TurnScoreInput): AnswerEvalScoreBreakdown {
  const { result } = input
  const max = 1.5
  let score = 0
  const notes: string[] = []

  if (result.status === 'complete') {
    score += 0.5
    notes.push(input.journeyKind === 'single-step'
      ? 'Single-step case reached a final answer.'
      : 'Multi-step turn reached a final answer.')
  } else {
    notes.push('The turn did not reach a final answer.')
  }

  if (sameStringList(result.toolQueries, input.testCase.expected.toolQueries ?? result.toolQueries)) {
    score += 0.5
    notes.push('The turn used the expected search/action path.')
  } else {
    notes.push('The turn used an unexpected search/action path.')
  }

  if (timingExpectationsPass(input.testCase.expected, result.timingNames)) {
    score += 0.5
    notes.push('The turn stayed on the expected orchestration path.')
  } else {
    notes.push('The turn took an unexpected orchestration path.')
  }

  return dimension('journey_continuity', 'Journey Continuity', score, max, notes)
}

function scoreThreadContinuity(
  testCase: AnswerThreadEvalCase,
  result: AnswerThreadEvalResult,
): AnswerEvalScoreBreakdown {
  let score = 0
  const notes: string[] = []
  const followUps = result.turns.slice(1)

  if (result.turns.length === testCase.turns.length && result.turns.every((turn) => turn.status === 'complete')) {
    score += 0.5
    notes.push('Every expected turn completed in order.')
  } else {
    notes.push(`Expected ${testCase.turns.length} turns, got ${result.turns.length}.`)
  }

  if (followUps.every((turn, index) => {
    const expectedTurn = testCase.turns[index + 1]
    return expectedTurn !== undefined && sameStringList(turn.toolQueries, expectedTurn.expected.toolQueries ?? turn.toolQueries)
  })) {
    score += 0.5
    notes.push('Follow-up turns used the expected persisted evidence path.')
  } else {
    notes.push('A follow-up turn used an unexpected tool-query path.')
  }

  if (followUps.every((turn, index) => {
    const expectedTurn = testCase.turns[index + 1]
    return expectedTurn !== undefined && timingExpectationsPass(expectedTurn.expected, turn.timingNames)
  })) {
    score += 0.5
    notes.push('Follow-up turns avoided excluded retrieval/model loops.')
  } else {
    notes.push('A follow-up turn took an excluded retrieval/model path.')
  }

  return dimension('journey_continuity', 'Multi-Step Continuity', score, 1.5, notes)
}

function aggregateTurnDimension(
  turnScores: readonly AnswerEvalScore[],
  target: AnswerEvalScoreDimension,
): AnswerEvalScoreBreakdown {
  const entries = turnScores
    .map((score) => score.breakdown.find((breakdown) => breakdown.dimension === target))
    .filter((breakdown): breakdown is AnswerEvalScoreBreakdown => breakdown !== undefined)
  const first = entries[0]

  if (first === undefined) {
    return dimension(target, labelForDimension(target), 0, maxForDimension(target), ['No turn scores were available.'])
  }

  const minScore = Math.min(...entries.map((entry) => entry.score))
  const failingNotes: string[] = []
  let failingTurnIndex = 0
  for (const entry of entries) {
    if (!entry.passed) {
      for (const note of entry.notes) {
        failingNotes.push(`turn ${failingTurnIndex + 1}: ${note}`)
      }
      failingTurnIndex += 1
    }
  }

  return dimension(
    target,
    first.label,
    minScore,
    first.max,
    failingNotes.length === 0 ? [`All ${entries.length} turns passed ${first.label}.`] : failingNotes,
  )
}

function finishScore(breakdown: readonly AnswerEvalScoreBreakdown[]): AnswerEvalScore {
  const score = round2(breakdown.reduce((sum, item) => sum + item.score, 0))
  const rightAnswer = findBreakdown(breakdown, 'right_answer')
  const canProceed = findBreakdown(breakdown, 'can_proceed')
  const abandonment = findBreakdown(breakdown, 'abandonment_risk')
  const gotRightAnswer = rightAnswer?.passed === true
  const userCanProceed = canProceed?.score !== undefined && canProceed.score >= 1.25
  const abandonmentRisk = classifyAbandonmentRisk(score, abandonment, userCanProceed)
  const satisfied = score >= ANSWER_EVAL_SCORE_THRESHOLD
    && gotRightAnswer
    && userCanProceed
    && abandonmentRisk === 'low'
  const notes: string[] = []
  if (satisfied) {
    notes.push('User gets the expected answer, has a safe next step, and abandonment risk is low.')
  } else {
    for (const item of breakdown) {
      if (!item.passed) {
        for (const note of item.notes) {
          notes.push(`${item.label}: ${note}`)
        }
      }
    }
  }

  return {
    score,
    threshold: ANSWER_EVAL_SCORE_THRESHOLD,
    rank: score >= 9.5 ? 'excellent' : score >= ANSWER_EVAL_SCORE_THRESHOLD ? 'passing' : 'needs-work',
    breakdown,
    userOutcome: {
      satisfied,
      gotRightAnswer,
      canProceed: userCanProceed,
      abandonmentRisk,
      notes,
    },
  }
}

function classifyAbandonmentRisk(
  score: number,
  abandonment: AnswerEvalScoreBreakdown | undefined,
  canProceed: boolean,
): AnswerEvalUserOutcome['abandonmentRisk'] {
  if (!canProceed || abandonment === undefined || abandonment.score < 0.5) {
    return 'high'
  }
  if (score < ANSWER_EVAL_SCORE_THRESHOLD || abandonment.score < abandonment.max) {
    return 'medium'
  }
  return 'low'
}

function isActionableNextStep(input: TurnScoreInput): boolean {
  const nextStep = input.result.diagnostics.nextStep ?? ''
  if (!ACTIONABLE_NEXT_STEP_PATTERN.test(nextStep)) {
    return false
  }

  if (input.testCase.expected.requireBoundaryCopy === true) {
    if (!BOUNDARY_PATTERN.test(readPublicText(input.result))) {
      return false
    }
  }

  if (input.result.slugs.length > 0) {
    return /\b(open|details|provider page|business page|inquiry|contact)\b/i.test(nextStep)
  }

  if (input.testCase.expected.requireBoundaryCopy === true) {
    return /\b(return|open|details|try|search|browse|compare)\b/i.test(nextStep)
  }

  return /\b(try|search|browse|another|different|nearby|details|listed)\b/i.test(nextStep)
}

function answerShapeMatchesResult(input: TurnScoreInput): boolean {
  const { result } = input
  const oneLineAndSummary = [
    result.diagnostics.oneLine ?? '',
    result.diagnostics.summary ?? '',
  ].join(' ')

  if (result.status !== 'complete') {
    return false
  }

  if (result.slugs.length === 0) {
    return !FALSE_POSITIVE_RESULT_PATTERN.test(oneLineAndSummary)
  }

  return !FALSE_EMPTY_PATTERN.test(oneLineAndSummary)
}

function artifactStreamMatchesResult(input: TurnScoreInput): boolean {
  const { result } = input
  const kinds = new Set(result.artifactKinds)

  if (result.status !== 'complete') {
    return false
  }
  if (!kinds.has('one-line')) {
    return false
  }
  if ((result.diagnostics.nextStep?.trim().length ?? 0) > 0 && !kinds.has('what-to-do-now')) {
    return false
  }
  if (result.slugs.length > 0) {
    return kinds.has('provider-cards')
  }
  return !kinds.has('provider-cards')
}

function workLogMatchesResult(input: TurnScoreInput): boolean {
  const ids = input.result.workStepIds
  if (ids.length === 0 || ids.some((id) => !/^step-\d+$/.test(id))) {
    return false
  }
  if (input.result.workSteps.some((step) => step.status === 'running')) {
    return false
  }
  if ((input.testCase.expected.toolQueries?.length ?? 0) > 0) {
    const searchSteps = input.result.workSteps.filter((step) => step.phase === 'search')
    if (searchSteps.length === 0) {
      return false
    }
    if (!searchSteps.some((step) => step.detailRows?.some((row) => row.label === 'Results'))) {
      return false
    }
    return true
  }
  return true
}

function workStepEvidenceMatchesPath(input: TurnScoreInput): boolean {
  if (!workLogMatchesResult(input)) {
    return false
  }

  const expectedToolQueries = input.testCase.expected.toolQueries ?? []
  if (expectedToolQueries.length === 0) {
    return true
  }

  const searchSteps = input.result.workSteps.filter((step) => step.phase === 'search')
  if (searchSteps.length === 0) {
    return false
  }
  if (expectedToolQueries.length > 1 && searchSteps.length < 2) {
    return false
  }

  return searchSteps.every((step) =>
    step.status !== 'running' &&
    step.detailRows?.some((row) => row.label === 'Results') === true
  )
}


function timingExpectationsPass(
  expected: AnswerTurnEvalCase['expected'],
  timingNames: readonly string[],
): boolean {
  const includesPass = (expected.includeTimingNames ?? []).every((name) => timingNames.includes(name))
  const excludesPass = (expected.excludeTimingNames ?? []).every((name) => !timingNames.includes(name))
  return includesPass && excludesPass
}

function readPublicText(result: AnswerTurnEvalResult): string {
  return [
    result.diagnostics.oneLine ?? '',
    result.diagnostics.summary ?? '',
    result.diagnostics.nextStep ?? '',
  ].join(' ')
}

function hasUnsafeProblem(result: AnswerTurnEvalResult): boolean {
  return result.problems.some((problem) =>
    problem.includes('unsafe overclaim')
    || problem.includes('epistemic vocabulary')
    || problem.includes('injection upgrade')
  )
}

function hasProblem(result: AnswerTurnEvalResult, value: string): boolean {
  return result.problems.some((problem) => problem.includes(value))
}

function sameStringList(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index])
}

function findBreakdown(
  breakdown: readonly AnswerEvalScoreBreakdown[],
  dimensionName: AnswerEvalScoreDimension,
): AnswerEvalScoreBreakdown | undefined {
  return breakdown.find((item) => item.dimension === dimensionName)
}

function dimension(
  dimensionName: AnswerEvalScoreDimension,
  label: string,
  score: number,
  max: number,
  notes: readonly string[],
): AnswerEvalScoreBreakdown {
  return {
    dimension: dimensionName,
    label,
    score: round2(Math.min(Math.max(score, 0), max)),
    max,
    passed: round2(score) >= max,
    notes,
  }
}

function labelForDimension(dimensionName: AnswerEvalScoreDimension): string {
  switch (dimensionName) {
    case 'right_answer':
      return 'Right Answer'
    case 'grounded_evidence':
      return 'Grounded Evidence'
    case 'safe_boundary':
      return 'Safe Boundary'
    case 'can_proceed':
      return 'Can Proceed'
    case 'generated_answer_ui':
      return 'Generated Answer UI'
    case 'abandonment_risk':
      return 'Abandonment Risk'
    case 'journey_continuity':
      return 'Journey Continuity'
  }
}

function maxForDimension(dimensionName: AnswerEvalScoreDimension): number {
  switch (dimensionName) {
    case 'right_answer':
      return 2
    case 'grounded_evidence':
    case 'safe_boundary':
    case 'can_proceed':
    case 'journey_continuity':
      return 1.5
    case 'generated_answer_ui':
    case 'abandonment_risk':
      return 1
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
