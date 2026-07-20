import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const INSTRUMENT_START = '<!-- PLAN06_INSTRUMENT_JSON_START -->'
const INSTRUMENT_END = '<!-- PLAN06_INSTRUMENT_JSON_END -->'
const INSTRUMENT_SCHEMA = 'ae-paid-operation-comprehension-instrument:v1'
const RESULTS_SCHEMA = 'ae-paid-operation-comprehension-results:v1'
const RESPONSE_SCHEMA = 'ae-paid-operation-comprehension-response:v1'
const HUMAN_CLASS = 'declared_human_comprehension_session'
const AUTOMATED_CLASS = 'automated_model_comprehension'
const REQUIRED_QUESTION_IDS = [
  'Q1',
  'Q2',
  'Q3',
  'Q4',
  'Q5',
  'Q6',
  'Q7',
  'Q8',
  'Q9',
  'Q10',
] as const
const MANDATORY_QUESTION_IDS = ['Q3', 'Q5', 'Q7', 'Q8', 'Q9', 'Q10'] as const
const REQUIRED_SCENARIO_IDS = [
  'GOLDEN',
  'AUTHORITY_REFUSAL',
  'POSSIBLY_SUBMITTED',
  'INVALID_RESULT',
  'RECONCILED_NOT_SETTLED',
  'STALE_DUPLICATE',
  'READ_OUTAGE',
  'COMPLETED_RESTORE',
] as const
const FOUNDER_OVERRIDE =
  'Real-human comprehension may remain unproven without blocking the already-authorized Plan07 source/deploy work, but that does not satisfy P3C-R8’s human-comprehension evidence or upgrade the claim.'
const NOT_RUN_CEILING =
  'Predeclared instrument, scorer, source inspection, and source-linked local fixture evidence only. Human comprehension, automated-model comprehension, hosted reachability, accessibility in use, provider fulfilment, payment, settlement, production safety, customer value, and non-paid compatibility remain unproven.'
const HUMAN_PASS_CEILING =
  'Declared human comprehension for the eligible recorded cohort only. This is not population usability, hosted reachability, accessibility in use, provider fulfilment, real payment or settlement, production safety, customer value, demand, or non-paid compatibility evidence.'
const HUMAN_FAIL_CEILING =
  'The recorded declared-human cohort did not satisfy the frozen comprehension gates. Human comprehension and P3C-R8 remain unproven; no broader claim is earned.'
const AUTOMATED_ONLY_CEILING =
  'Automated-model comprehension for exactly three eligible fresh-agent sessions only. It is adjunct model evidence and cannot satisfy or overwrite declared human comprehension or P3C-R8.'

// Replaced only once, after the instrument body is frozen and canonicalized.
const FROZEN_INSTRUMENT_DIGEST =
  'sha256:526b009ddbf476758a06abf5768fe8459a1a5c29411c98ebfd5d131084452719'

type JsonRecord = Record<string, unknown>
type EvidenceClass = typeof HUMAN_CLASS | typeof AUTOMATED_CLASS

type InstrumentOption = Readonly<{
  id: string
  label: string
  hardFailReason?: 'retry_during_uncertainty' | 'provider_switch_during_uncertainty'
}>

type InstrumentQuestion = Readonly<{
  id: string
  prompt: string
  mandatoryAllParticipantGate: boolean
  options: readonly InstrumentOption[]
  correctOptionId: string
}>

type Instrument = JsonRecord & {
  schema: typeof INSTRUMENT_SCHEMA
  displayedDigest: string
  questions: InstrumentQuestion[]
}

type SessionScore = Readonly<{
  correctAnswers: number
  totalAnswers: number
  mandatoryGatePassed: boolean
  goldenJourneyCompleted: boolean
  hardFailReasons: readonly string[]
}>

type CohortReport = Readonly<{
  decision: 'NOT_RUN' | 'PASS' | 'FAIL'
  eligibleSessions: number
  totalAnswers: number
  correctAnswers: number
  accuracy: number | null
  mandatoryGatePassed: boolean
  goldenJourneyGatePassed: boolean
  hardFailTriggered: boolean
  claimStatus:
    | 'unproven'
    | 'proven_for_declared_human_comprehension_session'
    | 'proven_for_automated_model_comprehension_only'
}>

type CohortScore = Readonly<{
  class: EvidenceClass
  report: CohortReport
}>

class ScorerRefusal extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ScorerRefusal'
    this.code = code
  }
}

function refuse(code: string, message: string): never {
  throw new ScorerRefusal(code, message)
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) refuse('canonicalization_failed', 'Non-finite number.')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const object = value as JsonRecord
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`
  }
  refuse('canonicalization_failed', `Unsupported JSON value: ${typeof value}.`)
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function computedInstrumentDigest(instrument: JsonRecord): string {
  const canonicalPayload = structuredClone(instrument)
  delete canonicalPayload.displayedDigest
  delete canonicalPayload.answerStorage
  return sha256(canonicalJson(canonicalPayload))
}

function extractInstrument(path: string): Instrument {
  const source = readFileSync(path, 'utf8')
  const start = source.indexOf(INSTRUMENT_START)
  const end = source.indexOf(INSTRUMENT_END)
  if (
    start < 0
    || end < 0
    || end <= start
    || source.indexOf(INSTRUMENT_START, start + INSTRUMENT_START.length) >= 0
    || source.indexOf(INSTRUMENT_END, end + INSTRUMENT_END.length) >= 0
  ) {
    refuse('instrument_block_invalid', 'Expected exactly one ordered instrument JSON block.')
  }
  const json = source.slice(start + INSTRUMENT_START.length, end).trim()
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch (error) {
    refuse('instrument_json_invalid', error instanceof Error ? error.message : String(error))
  }
  return expectRecord(value, 'instrument') as Instrument
}

function loadResults(path: string): JsonRecord {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    refuse('results_json_invalid', error instanceof Error ? error.message : String(error))
  }
  return expectRecord(value, 'results')
}

function validateInstrument(instrument: Instrument): void {
  if (instrument.schema !== INSTRUMENT_SCHEMA) {
    refuse('instrument_schema_mismatch', `Expected ${INSTRUMENT_SCHEMA}.`)
  }
  const actualDigest = computedInstrumentDigest(instrument)
  if (instrument.displayedDigest !== actualDigest) {
    refuse(
      'instrument_digest_mismatch',
      `Displayed ${String(instrument.displayedDigest)}; recomputed ${actualDigest}.`,
    )
  }
  if (actualDigest !== FROZEN_INSTRUMENT_DIGEST) {
    refuse(
      'instrument_drift',
      `Scorer is frozen to ${FROZEN_INSTRUMENT_DIGEST}; received ${actualDigest}.`,
    )
  }

  const answerStorage = expectRecord(instrument.answerStorage, 'instrument.answerStorage')
  expectExactKeys(
    answerStorage,
    ['excludedFromDigest', 'path', 'participantAnswers'],
    'instrument.answerStorage',
  )
  if (
    answerStorage.excludedFromDigest !== true
    || answerStorage.path
      !== '.planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-RESULTS.json'
    || !Array.isArray(answerStorage.participantAnswers)
    || answerStorage.participantAnswers.length !== 0
  ) {
    refuse(
      'instrument_answer_storage_invalid',
      'The frozen instrument must keep participant answer storage empty and external.',
    )
  }

  const evidenceBoundary = expectRecord(
    instrument.evidenceBoundary,
    'instrument.evidenceBoundary',
  )
  if (
    evidenceBoundary.label
      !== 'labelled local browser mechanics + authenticated route fixtures'
    || evidenceBoundary.protectedHostedBrowserSession !== false
  ) {
    refuse('evidence_class_mismatch', 'Instrument evidence boundary was promoted or changed.')
  }

  const founderOverride = expectRecord(instrument.founderOverride, 'instrument.founderOverride')
  if (
    founderOverride.statement !== FOUNDER_OVERRIDE
    || founderOverride.plan07MayProceedWithoutHumanPass !== true
    || founderOverride.satisfiesP3CR8HumanComprehension !== false
    || founderOverride.upgradesClaim !== false
  ) {
    refuse('founder_override_mismatch', 'Founder override is missing or has changed meaning.')
  }

  const scoring = expectRecord(instrument.scoringPolicy, 'instrument.scoringPolicy')
  if (
    scoring.minimumAccuracy !== 0.9
    || scoring.minimumEligibleHumanSessions !== 3
    || scoring.requiredHumanEvidenceClass !== HUMAN_CLASS
    || scoring.automatedAdjunctEvidenceClass !== AUTOMATED_CLASS
    || scoring.incompleteGoldenJourneyIsNonPass !== true
    || scoring.uncertaintyRetryOrProviderSwitchIsHardFail !== true
  ) {
    refuse('scoring_policy_mismatch', 'Frozen scoring gates have drifted.')
  }

  const responseContract = expectRecord(instrument.responseContract, 'instrument.responseContract')
  if (responseContract.schema !== RESPONSE_SCHEMA) {
    refuse('response_schema_mismatch', 'Frozen response schema has drifted.')
  }

  const scenarios = expectArray(instrument.stimuli, 'instrument.stimuli')
  const scenarioIds = scenarios.map((value, index) =>
    expectString(expectRecord(value, `instrument.stimuli[${index}]`).id, 'scenario id'))
  expectExactOrderedValues(scenarioIds, REQUIRED_SCENARIO_IDS, 'instrument scenario ids')

  const assignments = expectRecord(
    instrument.counterbalanceAssignments,
    'instrument.counterbalanceAssignments',
  )
  expectExactKeys(assignments, ['A', 'B', 'C'], 'instrument.counterbalanceAssignments')
  for (const assignment of ['A', 'B', 'C']) {
    const order = expectStringArray(assignments[assignment], `counterbalance ${assignment}`)
    if (
      order[0] !== 'GOLDEN'
      || order.length !== REQUIRED_SCENARIO_IDS.length
      || new Set(order).size !== REQUIRED_SCENARIO_IDS.length
      || REQUIRED_SCENARIO_IDS.some((scenarioId) => !order.includes(scenarioId))
    ) {
      refuse('counterbalance_invalid', `Assignment ${assignment} is incomplete or duplicated.`)
    }
  }

  const questions = expectArray(instrument.questions, 'instrument.questions')
  if (questions.length !== REQUIRED_QUESTION_IDS.length) {
    refuse('question_count_mismatch', 'The instrument must contain exactly ten questions.')
  }
  const questionIds = questions.map((value, index) =>
    expectString(expectRecord(value, `question ${index + 1}`).id, 'question id'))
  expectExactOrderedValues(questionIds, REQUIRED_QUESTION_IDS, 'question ids')

  for (const [index, value] of questions.entries()) {
    const question = expectRecord(value, `instrument.questions[${index}]`)
    expectExactKeys(
      question,
      [
        'concept',
        'correctOptionId',
        'id',
        'mandatoryAllParticipantGate',
        'options',
        'prompt',
        'scenarioRefs',
      ],
      `instrument.questions[${index}]`,
    )
    const id = expectString(question.id, 'question id')
    const mandatory = MANDATORY_QUESTION_IDS.includes(
      id as typeof MANDATORY_QUESTION_IDS[number],
    )
    if (question.mandatoryAllParticipantGate !== mandatory) {
      refuse('mandatory_gate_mismatch', `${id} mandatory-gate flag is incorrect.`)
    }
    const options = expectArray(question.options, `${id}.options`)
    if (options.length < 3) refuse('question_options_invalid', `${id} needs at least three options.`)
    const optionIds = options.map((option, optionIndex) => {
      const record = expectRecord(option, `${id}.options[${optionIndex}]`)
      const allowedKeys = record.hardFailReason === undefined
        ? ['id', 'label']
        : ['hardFailReason', 'id', 'label']
      expectExactKeys(record, allowedKeys, `${id}.options[${optionIndex}]`)
      if (
        record.hardFailReason !== undefined
        && record.hardFailReason !== 'retry_during_uncertainty'
        && record.hardFailReason !== 'provider_switch_during_uncertainty'
      ) {
        refuse('hard_fail_tag_invalid', `${id} has an unknown hard-fail tag.`)
      }
      return expectString(record.id, 'option id')
    })
    if (new Set(optionIds).size !== optionIds.length) {
      refuse('duplicate_option_id', `${id} has duplicate option IDs.`)
    }
    if (!optionIds.includes(expectString(question.correctOptionId, `${id}.correctOptionId`))) {
      refuse('answer_key_invalid', `${id} correct option is absent.`)
    }
    expectString(question.prompt, `${id}.prompt`)
    expectString(question.concept, `${id}.concept`)
    for (const scenarioRef of expectStringArray(question.scenarioRefs, `${id}.scenarioRefs`)) {
      if (!REQUIRED_SCENARIO_IDS.includes(scenarioRef as typeof REQUIRED_SCENARIO_IDS[number])) {
        refuse('question_scenario_invalid', `${id} references unknown scenario ${scenarioRef}.`)
      }
    }
  }
}

function validateResults(instrument: Instrument, results: JsonRecord): Readonly<{
  human: CohortScore
  automated: CohortScore
  overall: JsonRecord
}> {
  expectExactKeys(
    results,
    [
      'administration',
      'automatedModelCohort',
      'founderOverride',
      'generatedAt',
      'humanCohort',
      'instrumentDigest',
      'overall',
      'schema',
    ],
    'results',
  )
  if (results.schema !== RESULTS_SCHEMA) {
    refuse('results_schema_mismatch', `Expected ${RESULTS_SCHEMA}.`)
  }
  if (results.instrumentDigest !== instrument.displayedDigest) {
    refuse('results_instrument_mismatch', 'Results are not bound to the frozen instrument digest.')
  }

  const administration = expectRecord(results.administration, 'results.administration')
  expectExactKeys(
    administration,
    [
      'answerKeyExposedToParticipants',
      'coachingOccurred',
      'containsPii',
      'participantSafePacketOnly',
    ],
    'results.administration',
  )
  if (
    administration.answerKeyExposedToParticipants !== false
    || administration.coachingOccurred !== false
    || administration.containsPii !== false
    || administration.participantSafePacketOnly !== true
  ) {
    refuse(
      'answer_key_or_coaching_exposure',
      'Results record answer-key exposure, coaching, non-packet input, or PII.',
    )
  }

  const founderOverride = expectRecord(results.founderOverride, 'results.founderOverride')
  if (
    founderOverride.statement !== FOUNDER_OVERRIDE
    || founderOverride.plan07MayProceedWithoutHumanPass !== true
    || founderOverride.satisfiesP3CR8HumanComprehension !== false
    || founderOverride.upgradesClaim !== false
  ) {
    refuse('founder_override_mismatch', 'Results changed the founder override.')
  }

  const seenParticipantIds = new Set<string>()
  const human = scoreCohort(
    instrument,
    expectRecord(results.humanCohort, 'results.humanCohort'),
    HUMAN_CLASS,
    seenParticipantIds,
  )
  const automated = scoreCohort(
    instrument,
    expectRecord(results.automatedModelCohort, 'results.automatedModelCohort'),
    AUTOMATED_CLASS,
    seenParticipantIds,
  )
  const expectedOverall = overallReport(human.report, automated.report)
  const suppliedOverall = expectRecord(results.overall, 'results.overall')
  if (canonicalJson(suppliedOverall) !== canonicalJson(expectedOverall)) {
    refuse(
      'scorer_result_disagreement',
      `Recorded overall result differs from scorer: ${canonicalJson(expectedOverall)}.`,
    )
  }

  const anyRun = human.report.decision !== 'NOT_RUN'
    || automated.report.decision !== 'NOT_RUN'
  if (anyRun) {
    const generatedAt = expectString(results.generatedAt, 'results.generatedAt')
    if (Number.isNaN(Date.parse(generatedAt))) {
      refuse('generated_at_invalid', 'A completed result needs an ISO date-time.')
    }
  } else if (results.generatedAt !== null) {
    refuse('not_run_timestamp_invalid', 'Empty not-run results must use generatedAt: null.')
  }

  return { human, automated, overall: expectedOverall }
}

function scoreCohort(
  instrument: Instrument,
  cohort: JsonRecord,
  evidenceClass: EvidenceClass,
  seenParticipantIds: Set<string>,
): CohortScore {
  expectExactKeys(cohort, ['class', 'reported', 'sessions', 'status'], `${evidenceClass} cohort`)
  if (cohort.class !== evidenceClass) {
    refuse('cohort_class_mismatch', `Expected cohort class ${evidenceClass}.`)
  }
  const status = cohort.status
  if (status !== 'not_run' && status !== 'pass' && status !== 'fail') {
    refuse('cohort_status_invalid', `${evidenceClass} has invalid status ${String(status)}.`)
  }
  const sessions = expectArray(cohort.sessions, `${evidenceClass}.sessions`)
  const suppliedReport = expectRecord(cohort.reported, `${evidenceClass}.reported`)

  if (status === 'not_run') {
    if (sessions.length !== 0) {
      refuse('not_run_contains_sessions', `${evidenceClass} not-run cohort contains sessions.`)
    }
    const report = emptyReport()
    if (canonicalJson(suppliedReport) !== canonicalJson(report)) {
      refuse('scorer_result_disagreement', `${evidenceClass} not-run report differs from scorer.`)
    }
    return { class: evidenceClass, report }
  }

  if (sessions.length === 0) {
    refuse('missing_sessions', `${evidenceClass} status ${status} has no sessions.`)
  }
  if (status === 'pass' && evidenceClass === HUMAN_CLASS && sessions.length < 3) {
    refuse(
      'insufficient_human_sessions_for_pass',
      `Human PASS needs at least three eligible sessions; received ${sessions.length}.`,
    )
  }
  if (status === 'pass' && evidenceClass === AUTOMATED_CLASS && sessions.length !== 3) {
    refuse(
      'automated_session_count_mismatch',
      `Automated adjunct PASS is frozen to exactly three sessions; received ${sessions.length}.`,
    )
  }

  const sessionScores = sessions.map((value, index) =>
    scoreSession(
      instrument,
      expectRecord(value, `${evidenceClass}.sessions[${index}]`),
      evidenceClass,
      seenParticipantIds,
    ))
  const assignments = sessions.map((value, index) =>
    expectString(
      expectRecord(value, `${evidenceClass}.sessions[${index}]`).counterbalanceAssignment,
      `${evidenceClass}.sessions[${index}].counterbalanceAssignment`,
    ))
  const assignmentSet = new Set(assignments)
  if (
    status === 'pass'
    && (
      assignmentSet.size < 3
      || !assignmentSet.has('A')
      || !assignmentSet.has('B')
      || !assignmentSet.has('C')
      || (evidenceClass === AUTOMATED_CLASS && assignments.length !== 3)
    )
  ) {
    refuse(
      'counterbalance_invalid',
      `${evidenceClass} PASS must include assignments A, B and C${
        evidenceClass === AUTOMATED_CLASS ? ' exactly once' : ''
      }.`,
    )
  }
  const totalAnswers = sessionScores.reduce((sum, score) => sum + score.totalAnswers, 0)
  const correctAnswers = sessionScores.reduce((sum, score) => sum + score.correctAnswers, 0)
  const accuracy = correctAnswers / totalAnswers
  const mandatoryGatePassed = sessionScores.every((score) => score.mandatoryGatePassed)
  const goldenJourneyGatePassed = sessionScores.every((score) => score.goldenJourneyCompleted)
  const hardFailReasons = [...new Set(sessionScores.flatMap((score) => score.hardFailReasons))]
  const classSessionCountPassed = evidenceClass === HUMAN_CLASS
    ? sessions.length >= 3
    : sessions.length === 3
  const computedDecision = classSessionCountPassed
    && mandatoryGatePassed
    && goldenJourneyGatePassed
    && hardFailReasons.length === 0
    && accuracy >= 0.9
    ? 'PASS'
    : 'FAIL'

  if (status === 'pass' && !goldenJourneyGatePassed) {
    refuse('incomplete_golden_journey', 'A declared PASS contains an incomplete golden journey.')
  }
  if (status === 'pass' && hardFailReasons.length > 0) {
    refuse(
      'uncertainty_hard_fail',
      `A declared PASS chose ${hardFailReasons.join(', ')} during uncertainty.`,
    )
  }
  if (status === 'pass' && !mandatoryGatePassed) {
    refuse('mandatory_question_failed', 'A declared PASS missed an all-participant gate.')
  }
  if (status === 'pass' && accuracy < 0.9) {
    refuse(
      'accuracy_below_threshold',
      `A declared PASS scored ${(accuracy * 100).toFixed(2)}%, below 90%.`,
    )
  }
  if ((status === 'pass' ? 'PASS' : 'FAIL') !== computedDecision) {
    refuse(
      'scorer_result_disagreement',
      `Recorded ${status.toUpperCase()} but scorer computed ${computedDecision}.`,
    )
  }

  const report: CohortReport = {
    decision: computedDecision,
    eligibleSessions: sessions.length,
    totalAnswers,
    correctAnswers,
    accuracy,
    mandatoryGatePassed,
    goldenJourneyGatePassed,
    hardFailTriggered: hardFailReasons.length > 0,
    claimStatus: computedDecision === 'PASS'
      ? evidenceClass === HUMAN_CLASS
        ? 'proven_for_declared_human_comprehension_session'
        : 'proven_for_automated_model_comprehension_only'
      : 'unproven',
  }
  if (canonicalJson(suppliedReport) !== canonicalJson(report)) {
    refuse(
      'scorer_result_disagreement',
      `Recorded ${evidenceClass} report differs from scorer: ${canonicalJson(report)}.`,
    )
  }
  return { class: evidenceClass, report }
}

function scoreSession(
  instrument: Instrument,
  session: JsonRecord,
  evidenceClass: EvidenceClass,
  seenParticipantIds: Set<string>,
): SessionScore {
  expectExactKeys(
    session,
    [
      'answers',
      'class',
      'completedScenarioIds',
      'counterbalanceAssignment',
      'eligibility',
      'friction',
      'goldenJourneyCompleted',
      'participantId',
      'scenarioOrder',
      'schema',
    ],
    'session',
  )
  if (session.schema !== RESPONSE_SCHEMA) {
    refuse('response_schema_mismatch', `Expected response schema ${RESPONSE_SCHEMA}.`)
  }
  if (session.class !== evidenceClass) {
    refuse(
      'cohort_class_mismatch',
      `Session class ${String(session.class)} does not match ${evidenceClass}.`,
    )
  }

  const participantId = expectString(session.participantId, 'participantId')
  const expectedPattern = evidenceClass === HUMAN_CLASS
    ? /^human-[a-z0-9]{8}$/u
    : /^agent-[a-z0-9]{8}$/u
  if (!expectedPattern.test(participantId)) {
    refuse(
      'participant_id_malformed',
      `${participantId} does not match the anonymous ${evidenceClass} ID pattern.`,
    )
  }
  if (seenParticipantIds.has(participantId)) {
    refuse('participant_id_duplicate', `Duplicate participant ID ${participantId}.`)
  }
  seenParticipantIds.add(participantId)

  const eligibility = expectRecord(session.eligibility, `${participantId}.eligibility`)
  expectExactKeys(
    eligibility,
    [
      'answerKeyExposed',
      'coachingReceived',
      'fileInspection',
      'freshAgentContext',
      'humanParticipant',
      'independent',
      'participantSafePacketOnly',
      'phase3cImplementer',
      'phase3cReviewer',
      'repoInspection',
      'toolInspection',
    ],
    `${participantId}.eligibility`,
  )
  const classFlagsValid = evidenceClass === HUMAN_CLASS
    ? eligibility.humanParticipant === true && eligibility.freshAgentContext === false
    : eligibility.humanParticipant === false && eligibility.freshAgentContext === true
  if (
    !classFlagsValid
    || eligibility.independent !== true
    || eligibility.participantSafePacketOnly !== true
    || eligibility.phase3cImplementer !== false
    || eligibility.phase3cReviewer !== false
    || eligibility.answerKeyExposed !== false
    || eligibility.coachingReceived !== false
    || eligibility.repoInspection !== false
    || eligibility.fileInspection !== false
    || eligibility.toolInspection !== false
  ) {
    refuse('ineligible_cohort', `${participantId} does not satisfy the frozen eligibility rules.`)
  }

  const assignment = expectString(
    session.counterbalanceAssignment,
    `${participantId}.counterbalanceAssignment`,
  )
  if (assignment !== 'A' && assignment !== 'B' && assignment !== 'C') {
    refuse('counterbalance_invalid', `${participantId} has unknown assignment ${assignment}.`)
  }
  const assignments = expectRecord(
    instrument.counterbalanceAssignments,
    'instrument.counterbalanceAssignments',
  )
  const expectedOrder = expectStringArray(assignments[assignment], `assignment ${assignment}`)
  const scenarioOrder = expectStringArray(session.scenarioOrder, `${participantId}.scenarioOrder`)
  if (canonicalJson(scenarioOrder) !== canonicalJson(expectedOrder)) {
    refuse('counterbalance_invalid', `${participantId} scenario order does not match ${assignment}.`)
  }
  const completedScenarioIds = expectStringArray(
    session.completedScenarioIds,
    `${participantId}.completedScenarioIds`,
  )
  const goldenJourneyCompleted = session.goldenJourneyCompleted === true
    && completedScenarioIds.includes('GOLDEN')
    && canonicalJson(completedScenarioIds) === canonicalJson(expectedOrder)

  const friction = expectRecord(session.friction, `${participantId}.friction`)
  expectExactKeys(
    friction,
    [
      'backtracks',
      'confusingScenarioIds',
      'containsPii',
      'durationMinutes',
      'helpRequests',
      'notes',
    ],
    `${participantId}.friction`,
  )
  for (const field of ['backtracks', 'helpRequests']) {
    if (!Number.isSafeInteger(friction[field]) || Number(friction[field]) < 0) {
      refuse('friction_record_invalid', `${participantId}.${field} must be a non-negative integer.`)
    }
  }
  if (typeof friction.durationMinutes !== 'number' || friction.durationMinutes < 0) {
    refuse('friction_record_invalid', `${participantId}.durationMinutes is invalid.`)
  }
  if (
    friction.containsPii !== false
    || typeof friction.notes !== 'string'
    || friction.notes.length > 500
  ) {
    refuse('privacy_record_invalid', `${participantId} friction record contains PII or is invalid.`)
  }
  for (const scenarioId of expectStringArray(
    friction.confusingScenarioIds,
    `${participantId}.friction.confusingScenarioIds`,
  )) {
    if (!REQUIRED_SCENARIO_IDS.includes(scenarioId as typeof REQUIRED_SCENARIO_IDS[number])) {
      refuse('friction_record_invalid', `${participantId} names unknown scenario ${scenarioId}.`)
    }
  }

  const answers = expectArray(session.answers, `${participantId}.answers`)
  if (answers.length !== REQUIRED_QUESTION_IDS.length) {
    refuse('answer_set_incomplete', `${participantId} must answer exactly ten questions.`)
  }
  const questions = new Map(
    instrument.questions.map((question) => [question.id, question] as const),
  )
  const seenQuestions = new Set<string>()
  let correctAnswers = 0
  let mandatoryGatePassed = true
  const hardFailReasons: string[] = []

  for (const [index, value] of answers.entries()) {
    const answer = expectRecord(value, `${participantId}.answers[${index}]`)
    expectExactKeys(answer, ['questionId', 'selectedOptionId'], `${participantId}.answers[${index}]`)
    const questionId = expectString(answer.questionId, 'answer questionId')
    const selectedOptionId = expectString(answer.selectedOptionId, 'answer selectedOptionId')
    if (seenQuestions.has(questionId)) {
      refuse('answer_question_duplicate', `${participantId} answered ${questionId} twice.`)
    }
    seenQuestions.add(questionId)
    const question = questions.get(questionId)
    if (question === undefined) {
      refuse('answer_question_unknown', `${participantId} answered unknown ${questionId}.`)
    }
    const option = question.options.find((candidate) => candidate.id === selectedOptionId)
    if (option === undefined) {
      refuse('answer_option_unknown', `${participantId} selected unknown ${selectedOptionId}.`)
    }
    const correct = selectedOptionId === question.correctOptionId
    if (correct) correctAnswers += 1
    if (question.mandatoryAllParticipantGate && !correct) mandatoryGatePassed = false
    if (option.hardFailReason !== undefined) hardFailReasons.push(option.hardFailReason)
  }
  if (
    REQUIRED_QUESTION_IDS.some((questionId) => !seenQuestions.has(questionId))
    || seenQuestions.size !== REQUIRED_QUESTION_IDS.length
  ) {
    refuse('answer_set_incomplete', `${participantId} answer set is incomplete.`)
  }

  return {
    correctAnswers,
    totalAnswers: REQUIRED_QUESTION_IDS.length,
    mandatoryGatePassed,
    goldenJourneyCompleted,
    hardFailReasons,
  }
}

function emptyReport(): CohortReport {
  return {
    decision: 'NOT_RUN',
    eligibleSessions: 0,
    totalAnswers: 0,
    correctAnswers: 0,
    accuracy: null,
    mandatoryGatePassed: false,
    goldenJourneyGatePassed: false,
    hardFailTriggered: false,
    claimStatus: 'unproven',
  }
}

function overallReport(human: CohortReport, automated: CohortReport): JsonRecord {
  if (human.decision === 'PASS') {
    return {
      status: 'human_pass',
      p3cR8HumanComprehensionSatisfied: true,
      humanEvidenceClaim: human.claimStatus,
      automatedAdjunctClaim: automated.claimStatus,
      claimCeiling: HUMAN_PASS_CEILING,
    }
  }
  if (human.decision === 'FAIL') {
    return {
      status: 'human_fail',
      p3cR8HumanComprehensionSatisfied: false,
      humanEvidenceClaim: 'unproven',
      automatedAdjunctClaim: automated.claimStatus,
      claimCeiling: HUMAN_FAIL_CEILING,
    }
  }
  if (automated.decision === 'PASS') {
    return {
      status: 'automated_adjunct_only',
      p3cR8HumanComprehensionSatisfied: false,
      humanEvidenceClaim: 'unproven',
      automatedAdjunctClaim: automated.claimStatus,
      claimCeiling: AUTOMATED_ONLY_CEILING,
    }
  }
  return {
    status: 'not_run',
    p3cR8HumanComprehensionSatisfied: false,
    humanEvidenceClaim: 'unproven',
    automatedAdjunctClaim: 'unproven',
    claimCeiling: NOT_RUN_CEILING,
  }
}

function expectRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    refuse('shape_invalid', `${label} must be a JSON object.`)
  }
  return value as JsonRecord
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) refuse('shape_invalid', `${label} must be an array.`)
  return value
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    refuse('shape_invalid', `${label} must be a non-empty string.`)
  }
  return value
}

function expectStringArray(value: unknown, label: string): string[] {
  return expectArray(value, label).map((item, index) =>
    expectString(item, `${label}[${index}]`))
}

function expectExactKeys(object: JsonRecord, expected: readonly string[], label: string): void {
  const actual = Object.keys(object).sort()
  const sortedExpected = [...expected].sort()
  if (canonicalJson(actual) !== canonicalJson(sortedExpected)) {
    refuse(
      'shape_invalid',
      `${label} keys differ. Expected ${sortedExpected.join(', ')}; got ${actual.join(', ')}.`,
    )
  }
}

function expectExactOrderedValues(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    refuse(
      'instrument_order_mismatch',
      `${label} differ. Expected ${expected.join(', ')}; got ${actual.join(', ')}.`,
    )
  }
}

function parseArguments(argv: readonly string[]): Readonly<{
  instrumentPath: string
  resultsPath?: string
  printDigest: boolean
  selfTest: boolean
}> {
  let instrumentPath: string | undefined
  let resultsPath: string | undefined
  let printDigest = false
  let selfTest = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--instrument') instrumentPath = argv[index += 1]
    else if (argument === '--results') resultsPath = argv[index += 1]
    else if (argument === '--print-digest') printDigest = true
    else if (argument === '--self-test') selfTest = true
    else refuse('argument_invalid', `Unknown argument ${String(argument)}.`)
  }
  if (instrumentPath === undefined) refuse('argument_invalid', '--instrument is required.')
  if (!printDigest && resultsPath === undefined) refuse('argument_invalid', '--results is required.')
  return { instrumentPath, resultsPath, printDigest, selfTest }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function correctSyntheticSession(
  instrument: Instrument,
  evidenceClass: EvidenceClass,
  participantId: string,
  assignment: 'A' | 'B' | 'C',
): JsonRecord {
  const assignments = expectRecord(
    instrument.counterbalanceAssignments,
    'instrument.counterbalanceAssignments',
  )
  const scenarioOrder = expectStringArray(assignments[assignment], `assignment ${assignment}`)
  return {
    schema: RESPONSE_SCHEMA,
    participantId,
    class: evidenceClass,
    counterbalanceAssignment: assignment,
    scenarioOrder,
    completedScenarioIds: scenarioOrder,
    goldenJourneyCompleted: true,
    eligibility: {
      independent: true,
      humanParticipant: evidenceClass === HUMAN_CLASS,
      freshAgentContext: evidenceClass === AUTOMATED_CLASS,
      phase3cImplementer: false,
      phase3cReviewer: false,
      answerKeyExposed: false,
      coachingReceived: false,
      participantSafePacketOnly: true,
      repoInspection: false,
      fileInspection: false,
      toolInspection: false,
    },
    answers: instrument.questions.map((question) => ({
      questionId: question.id,
      selectedOptionId: question.correctOptionId,
    })),
    friction: {
      durationMinutes: 0,
      backtracks: 0,
      helpRequests: 0,
      confusingScenarioIds: [],
      notes: 'Synthetic scorer falsifier only.',
      containsPii: false,
    },
  }
}

function declaredPassCohort(
  evidenceClass: EvidenceClass,
  sessions: readonly JsonRecord[],
): JsonRecord {
  return {
    class: evidenceClass,
    status: 'pass',
    sessions,
    reported: {
      decision: 'PASS',
      eligibleSessions: sessions.length,
      totalAnswers: sessions.length * 10,
      correctAnswers: sessions.length * 10,
      accuracy: 1,
      mandatoryGatePassed: true,
      goldenJourneyGatePassed: true,
      hardFailTriggered: false,
      claimStatus: evidenceClass === HUMAN_CLASS
        ? 'proven_for_declared_human_comprehension_session'
        : 'proven_for_automated_model_comprehension_only',
    },
  }
}

function selfTestMatrix(
  instrument: Instrument,
  emptyResults: JsonRecord,
): readonly JsonRecord[] {
  const fixtures: Array<Readonly<{
    name: string
    expectedCode: string | null
    mutate: (instrumentFixture: Instrument, resultsFixture: JsonRecord) => void
  }>> = [
    {
      name: 'drifted instrument',
      expectedCode: 'instrument_digest_mismatch',
      mutate: (instrumentFixture) => {
        instrumentFixture.questions[0] = {
          ...instrumentFixture.questions[0]!,
          prompt: 'Drifted question',
        }
      },
    },
    {
      name: 'drifted instrument with recomputed display',
      expectedCode: 'instrument_drift',
      mutate: (instrumentFixture) => {
        instrumentFixture.questions[0] = {
          ...instrumentFixture.questions[0]!,
          prompt: 'Drifted question with refreshed display.',
        }
        instrumentFixture.displayedDigest = computedInstrumentDigest(instrumentFixture)
      },
    },
    {
      name: 'fewer than three humans',
      expectedCode: 'insufficient_human_sessions_for_pass',
      mutate: (instrumentFixture, resultsFixture) => {
        const sessions = [
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000001', 'A'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000002', 'B'),
        ]
        resultsFixture.humanCohort = declaredPassCohort(HUMAN_CLASS, sessions)
      },
    },
    {
      name: 'missing sessions',
      expectedCode: 'missing_sessions',
      mutate: (_instrumentFixture, resultsFixture) => {
        resultsFixture.humanCohort = declaredPassCohort(HUMAN_CLASS, [])
      },
    },
    {
      name: 'mandatory miss',
      expectedCode: 'mandatory_question_failed',
      mutate: (instrumentFixture, resultsFixture) => {
        const sessions = [
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000001', 'A'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000002', 'B'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000003', 'C'),
        ]
        const answers = sessions[0]!.answers as JsonRecord[]
        const q3 = expectRecord(answers.find((answer) => answer.questionId === 'Q3'), 'synthetic Q3')
        q3.selectedOptionId = expectString(
          instrumentFixture.questions[2]!.options.find(
            (option) => option.id !== instrumentFixture.questions[2]!.correctOptionId,
          )?.id,
          'synthetic wrong Q3',
        )
        resultsFixture.humanCohort = declaredPassCohort(HUMAN_CLASS, sessions)
      },
    },
    {
      name: 'below ninety percent',
      expectedCode: 'accuracy_below_threshold',
      mutate: (instrumentFixture, resultsFixture) => {
        const sessions = [
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000001', 'A'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000002', 'B'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000003', 'C'),
        ]
        for (const session of sessions.slice(0, 2)) {
          const answers = session.answers as JsonRecord[]
          for (const questionId of ['Q1', 'Q2']) {
            const question = instrumentFixture.questions.find((item) => item.id === questionId)!
            const answer = expectRecord(
              answers.find((item) => item.questionId === questionId),
              `synthetic ${questionId}`,
            )
            answer.selectedOptionId = question.options.find(
              (option) => option.id !== question.correctOptionId,
            )!.id
          }
        }
        resultsFixture.humanCohort = declaredPassCohort(HUMAN_CLASS, sessions)
      },
    },
    {
      name: 'uncertainty retry',
      expectedCode: 'uncertainty_hard_fail',
      mutate: (instrumentFixture, resultsFixture) => {
        const sessions = [
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000001', 'A'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000002', 'B'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000003', 'C'),
        ]
        const q6 = instrumentFixture.questions[5]!
        const unsafe = q6.options.find((option) => option.hardFailReason !== undefined)!
        const answers = sessions[0]!.answers as JsonRecord[]
        expectRecord(
          answers.find((answer) => answer.questionId === 'Q6'),
          'synthetic Q6',
        ).selectedOptionId = unsafe.id
        resultsFixture.humanCohort = declaredPassCohort(HUMAN_CLASS, sessions)
      },
    },
    {
      name: 'uncertainty provider switch',
      expectedCode: 'uncertainty_hard_fail',
      mutate: (instrumentFixture, resultsFixture) => {
        const sessions = [
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000001', 'A'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000002', 'B'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000003', 'C'),
        ]
        const q6 = instrumentFixture.questions[5]!
        const unsafe = q6.options.find(
          (option) => option.hardFailReason === 'provider_switch_during_uncertainty',
        )!
        const answers = sessions[0]!.answers as JsonRecord[]
        expectRecord(
          answers.find((answer) => answer.questionId === 'Q6'),
          'synthetic Q6',
        ).selectedOptionId = unsafe.id
        resultsFixture.humanCohort = declaredPassCohort(HUMAN_CLASS, sessions)
      },
    },
    {
      name: 'incomplete golden journey',
      expectedCode: 'incomplete_golden_journey',
      mutate: (instrumentFixture, resultsFixture) => {
        const sessions = [
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000001', 'A'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000002', 'B'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000003', 'C'),
        ]
        sessions[0]!.goldenJourneyCompleted = false
        resultsFixture.humanCohort = declaredPassCohort(HUMAN_CLASS, sessions)
      },
    },
    {
      name: 'answer-key or coaching exposure',
      expectedCode: 'answer_key_or_coaching_exposure',
      mutate: (_instrumentFixture, resultsFixture) => {
        expectRecord(
          resultsFixture.administration,
          'synthetic administration',
        ).answerKeyExposedToParticipants = true
      },
    },
    {
      name: 'ineligible cohort member',
      expectedCode: 'ineligible_cohort',
      mutate: (instrumentFixture, resultsFixture) => {
        const sessions = [
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000001', 'A'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000002', 'B'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000003', 'C'),
        ]
        expectRecord(
          sessions[0]!.eligibility,
          'synthetic eligibility',
        ).phase3cReviewer = true
        resultsFixture.humanCohort = declaredPassCohort(HUMAN_CLASS, sessions)
      },
    },
    {
      name: 'automated response mislabeled human',
      expectedCode: 'cohort_class_mismatch',
      mutate: (instrumentFixture, resultsFixture) => {
        const sessions = [
          correctSyntheticSession(instrumentFixture, AUTOMATED_CLASS, 'agent-00000001', 'A'),
          correctSyntheticSession(instrumentFixture, AUTOMATED_CLASS, 'agent-00000002', 'B'),
          correctSyntheticSession(instrumentFixture, AUTOMATED_CLASS, 'agent-00000003', 'C'),
        ]
        resultsFixture.humanCohort = declaredPassCohort(HUMAN_CLASS, sessions)
      },
    },
    {
      name: 'duplicate participant ID',
      expectedCode: 'participant_id_duplicate',
      mutate: (instrumentFixture, resultsFixture) => {
        const sessions = [
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000001', 'A'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000001', 'B'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000003', 'C'),
        ]
        resultsFixture.humanCohort = declaredPassCohort(HUMAN_CLASS, sessions)
      },
    },
    {
      name: 'malformed participant ID',
      expectedCode: 'participant_id_malformed',
      mutate: (instrumentFixture, resultsFixture) => {
        const sessions = [
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'person-one', 'A'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000002', 'B'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000003', 'C'),
        ]
        resultsFixture.humanCohort = declaredPassCohort(HUMAN_CLASS, sessions)
      },
    },
    {
      name: 'fabricated PASS or scorer/result mismatch',
      expectedCode: 'scorer_result_disagreement',
      mutate: (instrumentFixture, resultsFixture) => {
        const sessions = [
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000001', 'A'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000002', 'B'),
          correctSyntheticSession(instrumentFixture, HUMAN_CLASS, 'human-00000003', 'C'),
        ]
        const cohort = declaredPassCohort(HUMAN_CLASS, sessions)
        expectRecord(cohort.reported, 'synthetic report').correctAnswers = 29
        resultsFixture.humanCohort = cohort
      },
    },
    {
      name: 'valid empty not-run envelope',
      expectedCode: null,
      mutate: () => {},
    },
  ]

  return fixtures.map((fixture) => {
    const instrumentFixture = clone(instrument)
    const resultsFixture = clone(emptyResults)
    fixture.mutate(instrumentFixture, resultsFixture)
    try {
      validateInstrument(instrumentFixture)
      validateResults(instrumentFixture, resultsFixture)
      if (fixture.expectedCode !== null) {
        return {
          name: fixture.name,
          verdict: 'unexpected_accept',
          expectedCode: fixture.expectedCode,
        }
      }
      return { name: fixture.name, verdict: 'accepted', code: null }
    } catch (error) {
      const code = error instanceof ScorerRefusal ? error.code : 'unexpected_error'
      return {
        name: fixture.name,
        verdict: code === fixture.expectedCode ? 'refused_as_expected' : 'wrong_refusal',
        expectedCode: fixture.expectedCode,
        code,
      }
    }
  })
}

function main(): void {
  const args = parseArguments(process.argv.slice(2))
  const instrument = extractInstrument(args.instrumentPath)
  if (args.printDigest) {
    process.stdout.write(`${computedInstrumentDigest(instrument)}\n`)
    return
  }
  validateInstrument(instrument)
  const results = loadResults(args.resultsPath!)
  const accepted = validateResults(instrument, results)
  if (args.selfTest) {
    const matrix = selfTestMatrix(instrument, results)
    const failed = matrix.filter((row) =>
      row.verdict !== 'refused_as_expected' && row.verdict !== 'accepted')
    process.stdout.write(`${JSON.stringify({
      kind: failed.length === 0 ? 'accepted' : 'refused',
      fixtureClass: 'synthetic_in_memory_local_scorer_falsifiers',
      matrix,
    }, null, 2)}\n`)
    if (failed.length > 0) process.exitCode = 1
    return
  }
  process.stdout.write(`${JSON.stringify({
    kind: 'accepted',
    instrumentDigest: instrument.displayedDigest,
    human: accepted.human.report,
    automated: accepted.automated.report,
    overall: accepted.overall,
  }, null, 2)}\n`)
}

try {
  main()
} catch (error) {
  const refusal = error instanceof ScorerRefusal
    ? error
    : new ScorerRefusal(
        'unexpected_scorer_error',
        error instanceof Error ? error.message : String(error),
      )
  process.stderr.write(`${JSON.stringify({
    kind: 'refused',
    code: refusal.code,
    message: refusal.message,
  })}\n`)
  process.exitCode = 1
}
