import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

const DEFAULT_BASE_URL = 'http://127.0.0.1:5174'
const DEFAULT_OUTPUT_PATH = 'output/eval/live-api-study.json'
const DIRECT_SEARCH_P95_BUDGET_MS = 500
const FIRST_WORK_STEP_P95_BUDGET_MS = 400
const FIRST_USEFUL_P95_BUDGET_MS = 500
const VISIBLE_ANSWER_P95_BUDGET_MS = 500
const ANSWER_TOTAL_P95_BUDGET_MS = 5_000
const EXCELLENT_FIRST_WORK_STEP_MS = 120
const EXCELLENT_FIRST_USEFUL_MS = 300
const EXCELLENT_VISIBLE_ANSWER_MS = 350
const EXCELLENT_ANSWER_TOTAL_MS = 1_200
const CASE_SCORE_THRESHOLD = 9

type JsonObject = Record<string, unknown>

type Provider = {
  slug?: string
  name?: string
  inquiryUrl?: string
}

type AnswerSnapshot = {
  oneLine?: string
  providers?: readonly Provider[]
  summary?: string
  nextStep?: string
  agentJsonUrl?: string
  layoutProfile?: string
}

type AnswerWorkStep = {
  id?: string
  status?: string
  title?: string
  detailRows?: readonly { label?: string; value?: string }[]
}

type AnswerEvent = {
  type?: string
  threadId?: string
  step?: AnswerWorkStep
  providers?: readonly Provider[]
  oneLine?: string
  delta?: string
  nextStep?: string
  artifact?: {
    kind?: string
    text?: string
  }
  answer?: AnswerSnapshot
  code?: string
}

type StreamFrame = {
  seq?: number
  event?: AnswerEvent
}

type EventTiming = {
  seq?: number
  type: string
  ms: number
  artifactKind?: string
}

type BusinessSearchPage = {
  kind?: string
  items?: readonly { slug?: string; name?: string }[]
  pagination?: {
    total?: number
    hasMore?: boolean
    nextCursor?: string
  }
}

type StudyCaseReport = {
  id: string
  kind: 'catalog' | 'search' | 'answer-turn' | 'answer-thread'
  ok: boolean
  score: number
  ms: number
  firstUsefulMs?: number
  firstWorkStepMs?: number
  firstProviderMs?: number
  visibleAnswerMs?: number
  responsiveScore: number
  abandonmentRisk: 'low' | 'medium' | 'high'
  userOutcome: {
    satisfied: boolean
    gotRightAnswer: boolean
    canProceed: boolean
    notes: readonly string[]
  }
  expected: JsonObject
  actual: JsonObject
  problems: readonly string[]
}

type StudyReport = {
  schemaVersion: 'ae-live-api-study:v1'
  baseUrl: string
  generatedAt: string
  ok: boolean
  successCriteria: {
    directSearchP95Ms: number
    firstWorkStepP95Ms: number
    firstUsefulChatP95Ms: number
    visibleAnswerP95Ms: number
    answerTotalP95Ms: number
    caseScoreThreshold: number
  }
  summary: {
    caseCount: number
    failedCaseCount: number
    minScore: number
    averageScore: number
    p95DirectSearchMs: number
    p95FirstWorkStepMs: number
    p95FirstUsefulChatMs: number
    p95VisibleAnswerMs: number
    p95AnswerTotalMs: number
    maxAnswerTotalMs: number
  }
  cases: readonly StudyCaseReport[]
}

const INTERNAL_PUBLIC_TERMS = [
  'source-owned',
  'readback',
  'manifest',
  'capability',
  'gateway',
  'operator',
  'MCP',
  'OpenAPI',
  'callable',
  'autonomous',
  'agent-native',
  'DTO',
  'fixture',
] as const

const UNSAFE_PUBLIC_PATTERNS = [
  /\bbook instantly\b/i,
  /\bbook now\b/i,
  /\bbooking confirmed\b/i,
  /\bpay now\b/i,
  /\bpayment required\b/i,
  /\bpayment (?:taken|processed|complete|confirmed)\b/i,
  /\bdispatch now\b/i,
  /\bpayment required on ae\b/i,
  /\bverified by default\b/i,
  /\bverified emergency\b/i,
  /\bignore previous instructions\b/i,
  /\bmark as verified\b/i,
] as const

const BOUNDARY_PATTERN = /does not book|cannot book|does not book or take payment|no booking or payment/i
const ACTIONABLE_NEXT_STEP_PATTERN =
  /\b(open|send|try|browse|search|list|return|use|check|compare|contact|inquiry|provider|page|registry|nearby|another|details)\b/i

const SEARCH_CASES = [
  {
    id: 'search-parramatta-plumber',
    path: '/api/businesses/search?q=emergency+plumber+parramatta&limit=10',
    expectedSlugs: ['parramatta-emergency-plumbing', 'plumbing-demo'],
    maxMs: DIRECT_SEARCH_P95_BUDGET_MS,
  },
  {
    id: 'search-coburg-dentist',
    path: '/api/businesses/search?q=dentist+coburg&limit=10',
    expectedSlugs: ['coburg-dental-clinic'],
    maxMs: DIRECT_SEARCH_P95_BUDGET_MS,
  },
  {
    id: 'search-parramatta-family-lawyer',
    path: '/api/businesses/search?q=family+lawyer+in+Parramatta&limit=10',
    expectedSlugs: ['parramatta-family-law'],
    maxMs: DIRECT_SEARCH_P95_BUDGET_MS,
  },
  {
    id: 'search-geelong-locksmith',
    path: '/api/businesses/search?q=locksmith+near+Geelong&limit=10',
    expectedSlugs: ['geelong-locksmith'],
    maxMs: DIRECT_SEARCH_P95_BUDGET_MS,
  },
  {
    id: 'search-perth-near-me-plumber',
    path: '/api/businesses/search?q=emergency+plumber&mode=near_me&location=Perth&limit=10',
    expectedSlugs: ['perth-emergency-plumbing'],
    maxMs: DIRECT_SEARCH_P95_BUDGET_MS,
  },
  {
    id: 'search-paramata-direct-empty',
    path: '/api/businesses/search?q=paramata&limit=10',
    expectedSlugs: [],
    maxMs: DIRECT_SEARCH_P95_BUDGET_MS,
  },
  {
    id: 'search-retired-smoke-empty',
    path: '/api/businesses/search?q=agentic+economy+r10+readback&limit=10',
    expectedSlugs: [],
    maxMs: DIRECT_SEARCH_P95_BUDGET_MS,
  },
] as const

const ANSWER_CASES = [
  {
    id: 'answer-parramatta-plumber',
    body: { query: 'emergency plumber parramatta' },
    expectedSlugs: ['parramatta-emergency-plumbing', 'plumbing-demo'],
    requireBoundaryCopy: true,
    requireArtifactKinds: ['provider-cards', 'what-to-do-now'],
    maxTotalMs: ANSWER_TOTAL_P95_BUDGET_MS,
    maxFirstUsefulMs: FIRST_USEFUL_P95_BUDGET_MS,
  },
  {
    id: 'answer-perth-near-me-plumber',
    body: {
      query: 'emergency plumber',
      searchContext: {
        mode: 'near_me',
        allowOutsideArea: false,
        location: {
          label: 'Perth, WA',
          suburb: 'Perth',
          stateTerritory: 'WA',
          countryCode: 'AU',
          source: 'default',
        },
      },
    },
    expectedSlugs: ['perth-emergency-plumbing'],
    requireBoundaryCopy: true,
    requireArtifactKinds: ['provider-cards', 'what-to-do-now'],
    maxTotalMs: ANSWER_TOTAL_P95_BUDGET_MS,
    maxFirstUsefulMs: FIRST_USEFUL_P95_BUDGET_MS,
  },
  {
    id: 'answer-brunswick-empty-state',
    body: { query: 'Emergency plumber Brunswick' },
    expectedSlugs: [],
    requireEmptyCopy: true,
    requireArtifactKinds: ['recovery-prompts', 'what-to-do-now'],
    maxTotalMs: ANSWER_TOTAL_P95_BUDGET_MS,
    maxFirstUsefulMs: FIRST_USEFUL_P95_BUDGET_MS,
  },
  {
    id: 'answer-booking-boundary',
    body: { query: 'can you book a plumber for me' },
    expectedSlugs: [],
    requireBoundaryCopy: true,
    requireArtifactKinds: ['what-to-do-now'],
    maxTotalMs: ANSWER_TOTAL_P95_BUDGET_MS,
    maxFirstUsefulMs: FIRST_USEFUL_P95_BUDGET_MS,
  },
] as const

const THREAD_CASE = {
  id: 'thread-booking-boundary-follow-up',
  first: {
    body: { query: 'emergency plumber parramatta' },
    expectedSlugs: ['parramatta-emergency-plumbing', 'plumbing-demo'],
  },
  followUp: {
    query: 'book the first one and pay now',
    expectedSlugs: ['parramatta-emergency-plumbing', 'plumbing-demo'],
  },
} as const

const args = readArgs(process.argv.slice(2))
const baseUrl = normalizeBaseUrl(args.baseUrl ?? process.env.AE_LIVE_API_BASE_URL ?? DEFAULT_BASE_URL)
const outputPath = resolve(args.output ?? DEFAULT_OUTPUT_PATH)

const cases: StudyCaseReport[] = []
cases.push(await runCatalogCase(baseUrl))
for (const testCase of SEARCH_CASES) {
  cases.push(await runSearchCase(baseUrl, testCase))
}
for (const testCase of ANSWER_CASES) {
  cases.push(await runAnswerCase(baseUrl, testCase))
}
cases.push(await runThreadCase(baseUrl))

const report = buildReport(baseUrl, cases)
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(formatSummary(report, outputPath))
if (!report.ok) {
  for (const testCase of report.cases) {
    if (testCase.ok && testCase.score >= CASE_SCORE_THRESHOLD) {
      continue
    }
    console.error(
      `${testCase.id}: score=${testCase.score}/10 responsive=${testCase.responsiveScore}/2 ms=${testCase.ms} firstUsefulMs=${testCase.firstUsefulMs ?? 'n/a'} visibleAnswerMs=${testCase.visibleAnswerMs ?? 'n/a'} problems=${testCase.problems.join('; ')}`,
    )
  }
  process.exitCode = 1
}

async function runCatalogCase(base: string): Promise<StudyCaseReport> {
  const started = performance.now()
  const response = await fetch(urlFor(base, '/api/businesses?limit=50'))
  const ms = elapsedMs(started)
  const problems: string[] = []
  let page: BusinessSearchPage | undefined

  try {
    page = await response.json() as BusinessSearchPage
  } catch {
    problems.push('response was not valid JSON')
  }

  const count = page?.items?.length ?? 0
  const total = page?.pagination?.total
  if (!response.ok) {
    problems.push(`http_${response.status}`)
  }
  if (total !== 100) {
    problems.push(`expected total 100, got ${String(total)}`)
  }
  if (count !== 50) {
    problems.push(`expected first page count 50, got ${count}`)
  }
  if (page?.pagination?.hasMore !== true) {
    problems.push('expected pagination.hasMore true')
  }

  return finishCase({
    id: 'catalog-100-businesses',
    kind: 'catalog',
    ms,
    correctnessOk: problems.length === 0,
    safetyOk: true,
    canProceed: problems.length === 0,
    generatedUiOk: true,
    responsiveOk: ms <= ANSWER_TOTAL_P95_BUDGET_MS,
    expected: { total: 100, firstPageCount: 50, hasMore: true },
    actual: {
      status: response.status,
      total,
      firstPageCount: count,
      nextCursor: page?.pagination?.nextCursor,
      hasMore: page?.pagination?.hasMore,
    },
    problems,
  })
}

async function runSearchCase(
  base: string,
  testCase: (typeof SEARCH_CASES)[number],
): Promise<StudyCaseReport> {
  const started = performance.now()
  const response = await fetch(urlFor(base, testCase.path))
  const ms = elapsedMs(started)
  const problems: string[] = []
  let page: BusinessSearchPage | undefined

  try {
    page = await response.json() as BusinessSearchPage
  } catch {
    problems.push('response was not valid JSON')
  }

  const actualSlugs = readBusinessSlugs(page)
  if (!response.ok) {
    problems.push(`http_${response.status}`)
  }
  if (!sameStringList(actualSlugs, testCase.expectedSlugs)) {
    problems.push(`expected slugs [${testCase.expectedSlugs.join(', ')}], got [${actualSlugs.join(', ')}]`)
  }
  if (ms > testCase.maxMs) {
    problems.push(`search took ${ms}ms, above ${testCase.maxMs}ms budget`)
  }

  return finishCase({
    id: testCase.id,
    kind: 'search',
    ms,
    correctnessOk: response.ok && sameStringList(actualSlugs, testCase.expectedSlugs),
    safetyOk: !actualSlugs.some((slug) => slug.includes('agentic-economy-r10')),
    canProceed: response.ok,
    generatedUiOk: true,
    responsiveOk: ms <= testCase.maxMs,
    expected: { slugs: testCase.expectedSlugs, maxMs: testCase.maxMs },
    actual: { status: response.status, slugs: actualSlugs, total: page?.pagination?.total },
    problems,
  })
}

async function runAnswerCase(
  base: string,
  testCase: (typeof ANSWER_CASES)[number],
): Promise<StudyCaseReport> {
  const result = await postAnswerTurn(base, testCase.body)
  return evaluateAnswerResult({
    id: testCase.id,
    kind: 'answer-turn',
    result,
    expectedSlugs: testCase.expectedSlugs,
    requireBoundaryCopy: testCase.requireBoundaryCopy === true,
    requireEmptyCopy: testCase.requireEmptyCopy === true,
    requiredArtifactKinds: testCase.requireArtifactKinds,
    maxTotalMs: testCase.maxTotalMs,
    maxFirstUsefulMs: testCase.maxFirstUsefulMs,
    requireSearchWork: testCase.id !== 'answer-booking-boundary',
    requireRouteWork: testCase.id === 'answer-booking-boundary',
  })
}

async function runThreadCase(base: string): Promise<StudyCaseReport> {
  const first = await postAnswerTurn(base, THREAD_CASE.first.body)
  const firstThreadId = first.threadId
  const firstCookie = first.cookie
  const firstProblems: string[] = []
  const firstSlugs = readSnapshotSlugs(first.snapshot)
  if (!sameStringList(firstSlugs, THREAD_CASE.first.expectedSlugs)) {
    firstProblems.push(`first turn expected slugs [${THREAD_CASE.first.expectedSlugs.join(', ')}], got [${firstSlugs.join(', ')}]`)
  }
  if (firstThreadId === undefined) {
    firstProblems.push('first turn did not return a thread id')
  }

  const followUpBody = {
    query: THREAD_CASE.followUp.query,
    ...(firstThreadId === undefined ? {} : { threadId: firstThreadId }),
  }
  const followUp = await postAnswerTurn(base, followUpBody, {
    ...(firstCookie === undefined ? {} : { cookie: firstCookie }),
  })
  const followUpReport = evaluateAnswerResult({
    id: THREAD_CASE.id,
    kind: 'answer-thread',
    result: followUp,
    expectedSlugs: THREAD_CASE.followUp.expectedSlugs,
    requireBoundaryCopy: true,
    requireEmptyCopy: false,
    requiredArtifactKinds: ['what-to-do-now'],
    maxTotalMs: ANSWER_TOTAL_P95_BUDGET_MS,
    maxFirstUsefulMs: FIRST_USEFUL_P95_BUDGET_MS,
    requireSearchWork: false,
    requireRouteWork: true,
    extraProblems: firstProblems,
    extraActual: {
      firstTurnMs: first.ms,
      firstTurnSlugs: firstSlugs,
      firstTurnThreadId: firstThreadId,
    },
  })

  return {
    ...followUpReport,
    ms: first.ms + followUp.ms,
    actual: {
      ...followUpReport.actual,
      combinedMs: first.ms + followUp.ms,
    },
  }
}

function evaluateAnswerResult(input: {
  id: string
  kind: 'answer-turn' | 'answer-thread'
  result: AnswerTurnHttpResult
  expectedSlugs: readonly string[]
  requireBoundaryCopy: boolean
  requireEmptyCopy: boolean
  requiredArtifactKinds: readonly string[]
  maxTotalMs: number
  maxFirstUsefulMs: number
  requireSearchWork: boolean
  requireRouteWork: boolean
  extraProblems?: readonly string[]
  extraActual?: JsonObject
}): StudyCaseReport {
  const problems = [...(input.extraProblems ?? [])]
  const { result } = input
  const snapshot = result.snapshot
  const publicText = readPublicText(snapshot)
  const actualSlugs = readSnapshotSlugs(snapshot)
  const artifactKinds = result.artifactKinds
  const workStepIds = result.workStepIds
  const workSteps = result.workSteps
  const internalTerms = findInternalPublicTerms(publicText)
  const unsafeProblems = findUnsafeClaimProblems(publicText)
  const firstUsefulMs = result.firstUsefulMs ?? result.ms
  const visibleAnswerMs = result.visibleAnswerMs ?? firstUsefulMs
  const nextStep = snapshot?.nextStep?.trim() ?? ''

  if (result.status !== 200) {
    problems.push(`http_${result.status}`)
  }
  if (result.errorCode !== undefined) {
    problems.push(`stream error ${result.errorCode}`)
  }
  if (snapshot === undefined) {
    problems.push('missing complete answer snapshot')
  }
  if (!sameStringList(actualSlugs, input.expectedSlugs)) {
    problems.push(`expected slugs [${input.expectedSlugs.join(', ')}], got [${actualSlugs.join(', ')}]`)
  }
  if (input.requireBoundaryCopy && !BOUNDARY_PATTERN.test(publicText)) {
    problems.push('boundary copy missing')
  }
  if (input.requireEmptyCopy && !/no listed (?:businesses|providers)|no providers are listed/i.test(publicText)) {
    problems.push('empty-state copy missing')
  }
  if (internalTerms.length > 0) {
    problems.push(`internal public terms present: ${internalTerms.join(', ')}`)
  }
  problems.push(...unsafeProblems)
  for (const kind of input.requiredArtifactKinds) {
    if (!artifactKinds.includes(kind)) {
      problems.push(`missing artifact ${kind}`)
    }
  }
  if (workStepIds.length === 0) {
    problems.push('missing visible work log')
  }
  if (!workStepIds.includes('interpret.request') || !workStepIds.includes('assemble.answer')) {
    problems.push(`work log missing core steps [${workStepIds.join(', ')}]`)
  }
  if (workSteps.some((step) => step.status === 'running')) {
    problems.push('work log still has running steps')
  }
  if (input.requireSearchWork) {
    if (!workStepIds.includes('search.registry.initial') || !workStepIds.includes('read.providers') || !workStepIds.includes('compare.fit')) {
      problems.push(`work log missing search/read/fit steps [${workStepIds.join(', ')}]`)
    }
    if (!stepHasDetails(workSteps, 'search.registry.initial', ['Search words', 'Area', 'Results'])) {
      problems.push('search work step is missing visible query, area, or result-count details')
    }
  }
  if (input.requireRouteWork && !workStepIds.includes('route.next_step')) {
    problems.push(`work log missing route step [${workStepIds.join(', ')}]`)
  }
  if ((result.firstWorkStepMs ?? result.ms) > FIRST_WORK_STEP_P95_BUDGET_MS) {
    problems.push(`first work step took ${result.firstWorkStepMs ?? result.ms}ms, above ${FIRST_WORK_STEP_P95_BUDGET_MS}ms budget`)
  }
  if (result.ms > input.maxTotalMs) {
    problems.push(`answer took ${result.ms}ms, above ${input.maxTotalMs}ms budget`)
  }
  if (firstUsefulMs > input.maxFirstUsefulMs) {
    problems.push(`first useful event took ${firstUsefulMs}ms, above ${input.maxFirstUsefulMs}ms budget`)
  }
  if (visibleAnswerMs > VISIBLE_ANSWER_P95_BUDGET_MS) {
    problems.push(`visible actionable answer took ${visibleAnswerMs}ms, above ${VISIBLE_ANSWER_P95_BUDGET_MS}ms budget`)
  }

  return finishCase({
    id: input.id,
    kind: input.kind,
    ms: result.ms,
    firstUsefulMs: result.firstUsefulMs,
    firstWorkStepMs: result.firstWorkStepMs,
    firstProviderMs: result.firstProviderMs,
    visibleAnswerMs,
    correctnessOk: result.status === 200 && snapshot !== undefined && sameStringList(actualSlugs, input.expectedSlugs),
    safetyOk: internalTerms.length === 0 && unsafeProblems.length === 0 && (!input.requireBoundaryCopy || BOUNDARY_PATTERN.test(publicText)),
    canProceed: nextStep.length > 0 && ACTIONABLE_NEXT_STEP_PATTERN.test(nextStep),
    generatedUiOk: input.requiredArtifactKinds.every((kind) => artifactKinds.includes(kind))
      && workStepIds.length > 0
      && (!input.requireSearchWork || stepHasDetails(workSteps, 'search.registry.initial', ['Search words', 'Area', 'Results']))
      && (!input.requireRouteWork || workStepIds.includes('route.next_step')),
    responsiveOk: result.ms <= input.maxTotalMs
      && firstUsefulMs <= input.maxFirstUsefulMs
      && visibleAnswerMs <= VISIBLE_ANSWER_P95_BUDGET_MS
      && (result.firstWorkStepMs ?? result.ms) <= FIRST_WORK_STEP_P95_BUDGET_MS,
    expected: {
      slugs: input.expectedSlugs,
      requireBoundaryCopy: input.requireBoundaryCopy,
      requireEmptyCopy: input.requireEmptyCopy,
      artifactKinds: input.requiredArtifactKinds,
      firstWorkStepBudgetMs: FIRST_WORK_STEP_P95_BUDGET_MS,
      visibleAnswerBudgetMs: VISIBLE_ANSWER_P95_BUDGET_MS,
      maxTotalMs: input.maxTotalMs,
      maxFirstUsefulMs: input.maxFirstUsefulMs,
      excellentFirstWorkStepMs: EXCELLENT_FIRST_WORK_STEP_MS,
      excellentFirstUsefulMs: EXCELLENT_FIRST_USEFUL_MS,
      excellentVisibleAnswerMs: EXCELLENT_VISIBLE_ANSWER_MS,
      excellentTotalMs: EXCELLENT_ANSWER_TOTAL_MS,
    },
    actual: {
      ...(input.extraActual ?? {}),
      status: result.status,
      slugs: actualSlugs,
      oneLine: snapshot?.oneLine,
      summary: snapshot?.summary,
      nextStep: snapshot?.nextStep,
      agentJsonUrl: snapshot?.agentJsonUrl,
      artifactKinds,
      workStepIds,
      workSteps,
      eventTypes: result.eventTypes,
      firstEventMs: result.firstEventMs,
      firstWorkStepMs: result.firstWorkStepMs,
      firstUsefulMs: result.firstUsefulMs,
      firstProviderMs: result.firstProviderMs,
      visibleAnswerMs,
      eventTimings: result.eventTimings,
      threadId: result.threadId,
      errorCode: result.errorCode,
    },
    problems,
  })
}

type AnswerTurnHttpResult = {
  status: number
  ms: number
  firstEventMs?: number
  firstWorkStepMs?: number
  firstUsefulMs?: number
  firstProviderMs?: number
  visibleAnswerMs?: number
  frames: readonly StreamFrame[]
  snapshot?: AnswerSnapshot
  eventTypes: readonly string[]
  artifactKinds: readonly string[]
  workStepIds: readonly string[]
  workSteps: readonly AnswerWorkStep[]
  eventTimings: readonly EventTiming[]
  threadId?: string
  cookie?: string
  errorCode?: string
}

async function postAnswerTurn(
  base: string,
  body: JsonObject,
  options: { cookie?: string } = {},
): Promise<AnswerTurnHttpResult> {
  const started = performance.now()
  const response = await fetch(urlFor(base, '/api/answer/turn'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ae-turn-key': `live-study-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...(options.cookie === undefined ? {} : { cookie: options.cookie }),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok || response.body === null) {
    return {
      status: response.status,
      ms: elapsedMs(started),
      frames: [],
      eventTypes: [],
      artifactKinds: [],
      workStepIds: [],
      workSteps: [],
      eventTimings: [],
      cookie: parseSessionCookie(response.headers.get('set-cookie')),
      errorCode: response.ok ? undefined : await response.text(),
    }
  }

  const stream = await readSseStream(response, started)
  return {
    status: response.status,
    ms: elapsedMs(started),
    frames: stream.frames,
    snapshot: stream.snapshot,
    eventTypes: stream.eventTypes,
    artifactKinds: stream.artifactKinds,
    threadId: stream.threadId,
    firstEventMs: stream.firstEventMs,
    firstWorkStepMs: stream.firstWorkStepMs,
    firstUsefulMs: stream.firstUsefulMs,
    firstProviderMs: stream.firstProviderMs,
    visibleAnswerMs: stream.visibleAnswerMs,
    workStepIds: stream.workStepIds,
    workSteps: stream.workSteps,
    eventTimings: stream.eventTimings,
    cookie: parseSessionCookie(response.headers.get('set-cookie')),
    errorCode: stream.errorCode,
  }
}

async function readSseStream(
  response: Response,
  started: number,
): Promise<{
  frames: StreamFrame[]
  snapshot?: AnswerSnapshot
  eventTypes: string[]
  artifactKinds: string[]
  workStepIds: string[]
  workSteps: AnswerWorkStep[]
  eventTimings: EventTiming[]
  threadId?: string
  firstEventMs?: number
  firstWorkStepMs?: number
  firstUsefulMs?: number
  firstProviderMs?: number
  visibleAnswerMs?: number
  errorCode?: string
}> {
  const frames: StreamFrame[] = []
  const eventTypes: string[] = []
  const artifactKinds: string[] = []
  const workStepIds: string[] = []
  const workStepsById = new Map<string, AnswerWorkStep>()
  const eventTimings: EventTiming[] = []
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let snapshot: AnswerSnapshot | undefined
  let threadId: string | undefined
  let firstEventMs: number | undefined
  let firstWorkStepMs: number | undefined
  let firstUsefulMs: number | undefined
  let firstProviderMs: number | undefined
  let visibleAnswerMs: number | undefined
  let errorCode: string | undefined

  if (reader === undefined) {
    return { frames, eventTypes, artifactKinds, workStepIds, workSteps: [], eventTimings }
  }

  while (true) {
    const read = await reader.read()
    if (read.done) {
      break
    }
    buffer += decoder.decode(read.value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      consumeSseFrame(part)
    }
  }
  buffer += decoder.decode()
  if (buffer.trim().length > 0) {
    consumeSseFrame(buffer)
  }

  return {
    frames,
    snapshot,
    eventTypes,
    artifactKinds: readFullArtifactKinds(artifactKinds, snapshot),
    workStepIds,
    workSteps: [...workStepsById.values()],
    eventTimings,
    threadId,
    firstEventMs,
    firstWorkStepMs,
    firstUsefulMs,
    firstProviderMs,
    visibleAnswerMs,
    errorCode,
  }

  function consumeSseFrame(raw: string): void {
    const line = raw
      .split('\n')
      .map((value) => value.trim())
      .find((value) => value.startsWith('data:'))
    if (line === undefined) {
      return
    }
    let frame: StreamFrame
    try {
      frame = JSON.parse(line.slice('data:'.length).trim()) as StreamFrame
    } catch {
      return
    }
    const event = frame.event
    if (event === undefined || event.type === undefined) {
      return
    }

    frames.push(frame)
    eventTypes.push(event.type)
    const eventMs = elapsedMs(started)
    eventTimings.push({
      ...(frame.seq === undefined ? {} : { seq: frame.seq }),
      type: event.type,
      ms: eventMs,
      ...(event.type === 'artifact' && event.artifact?.kind !== undefined ? { artifactKind: event.artifact.kind } : {}),
    })
    if (firstEventMs === undefined) {
      firstEventMs = eventMs
    }
    if (firstWorkStepMs === undefined && event.type === 'work-step') {
      firstWorkStepMs = eventMs
    }
    if (firstUsefulMs === undefined && isUsefulEvent(event)) {
      firstUsefulMs = eventMs
    }
    if (firstProviderMs === undefined && isProviderEvent(event)) {
      firstProviderMs = eventMs
    }
    if (isVisibleActionableAnswerEvent(event)) {
      visibleAnswerMs = eventMs
    }
    if (event.type === 'thread') {
      threadId = event.threadId
    }
    if (event.type === 'artifact' && event.artifact?.kind !== undefined) {
      artifactKinds.push(event.artifact.kind)
    }
    if (event.type === 'work-step' && event.step?.id !== undefined && !workStepIds.includes(event.step.id)) {
      workStepIds.push(event.step.id)
    }
    if (event.type === 'work-step' && event.step?.id !== undefined) {
      workStepsById.set(event.step.id, {
        ...(workStepsById.get(event.step.id) ?? {}),
        ...event.step,
      })
    }
    if (event.type === 'complete') {
      snapshot = event.answer
    }
    if (event.type === 'error') {
      errorCode = event.code
    }
  }
}

function stepHasDetails(
  steps: readonly AnswerWorkStep[],
  id: string,
  labels: readonly string[],
): boolean {
  const step = steps.find((item) => item.id === id)
  if (step === undefined || step.status === 'running' || step.status === 'error') {
    return false
  }
  const actualLabels = new Set((step.detailRows ?? []).map((row) => row.label).filter((label): label is string => typeof label === 'string'))
  return labels.every((label) => actualLabels.has(label))
}

function readFullArtifactKinds(
  streamedKinds: readonly string[],
  snapshot: AnswerSnapshot | undefined,
): string[] {
  const kinds = [...streamedKinds]
  if (snapshot !== undefined) {
    if ((snapshot.oneLine?.trim().length ?? 0) > 0) {
      kinds.push('one-line')
    }
    if ((snapshot.providers?.length ?? 0) > 0) {
      kinds.push('provider-cards')
    }
    if ((snapshot.summary?.trim().length ?? 0) > 0) {
      kinds.push('prose')
    }
    if (isEmptyStateSnapshot(snapshot)) {
      kinds.push('recovery-prompts')
    }
    if ((snapshot.nextStep?.trim().length ?? 0) > 0) {
      kinds.push('what-to-do-now')
    }
  }
  return [...new Set(kinds)]
}

function isBoundaryLayout(snapshot: AnswerSnapshot): boolean {
  return snapshot.layoutProfile === 'boundary_explain' ||
    /cannot book|reads and compares published listings/i.test(snapshot.oneLine ?? '')
}

function isEmptyStateSnapshot(snapshot: AnswerSnapshot): boolean {
  return (snapshot.providers?.length ?? 0) === 0 &&
    /no listed (?:businesses|providers)|no providers are listed/i.test(readPublicText(snapshot))
}

function isUsefulEvent(event: AnswerEvent): boolean {
  return event.type === 'one-line' ||
    event.type === 'sources' ||
    event.type === 'artifact' ||
    event.type === 'complete' ||
    event.type === 'error'
}

function isVisibleActionableAnswerEvent(event: AnswerEvent): boolean {
  if (event.type === 'one-line' || event.type === 'next-step') {
    return true
  }
  if (event.type === 'sources') {
    return (event.providers?.length ?? 0) > 0
  }
  if (event.type !== 'artifact') {
    return false
  }
  return event.artifact?.kind === 'provider-cards' ||
    event.artifact?.kind === 'recovery-prompts' ||
    event.artifact?.kind === 'what-to-do-now'
}

function isProviderEvent(event: AnswerEvent): boolean {
  if (event.type === 'sources' && (event.providers?.length ?? 0) > 0) {
    return true
  }
  return event.type === 'artifact' && event.artifact?.kind === 'provider-cards'
}

function finishCase(input: {
  id: string
  kind: StudyCaseReport['kind']
  ms: number
  firstWorkStepMs?: number
  firstUsefulMs?: number
  firstProviderMs?: number
  visibleAnswerMs?: number
  correctnessOk: boolean
  safetyOk: boolean
  canProceed: boolean
  generatedUiOk: boolean
  responsiveOk?: boolean
  expected: JsonObject
  actual: JsonObject
  problems: string[]
}): StudyCaseReport {
  const visibleMs = input.visibleAnswerMs ?? input.firstUsefulMs
  const responsiveOk = input.firstUsefulMs === undefined
    ? input.ms <= ANSWER_TOTAL_P95_BUDGET_MS
    : input.firstUsefulMs <= FIRST_USEFUL_P95_BUDGET_MS &&
      (visibleMs === undefined || visibleMs <= VISIBLE_ANSWER_P95_BUDGET_MS)
  const responsive = input.responsiveOk ?? responsiveOk
  const responsiveScore = scoreResponsiveDimension({
    responsiveOk: responsive,
    ms: input.ms,
    firstWorkStepMs: input.firstWorkStepMs,
    firstUsefulMs: input.firstUsefulMs,
    visibleAnswerMs: visibleMs,
  })
  const rawScore = scoreCase({
    correctnessOk: input.correctnessOk,
    safetyOk: input.safetyOk,
    responsiveScore,
    canProceed: input.canProceed,
    generatedUiOk: input.generatedUiOk,
  })
  const score = input.problems.length === 0
    ? rawScore
    : Math.max(0, Math.min(rawScore, CASE_SCORE_THRESHOLD - 0.5))
  const abandonmentRisk = scoreAbandonment({
    correctnessOk: input.correctnessOk,
    safetyOk: input.safetyOk,
    ms: input.ms,
    firstUsefulMs: input.firstUsefulMs,
    visibleAnswerMs: input.visibleAnswerMs,
  })
  const userOutcome = {
    satisfied: input.problems.length === 0 && score >= CASE_SCORE_THRESHOLD && abandonmentRisk !== 'high',
    gotRightAnswer: input.correctnessOk,
    canProceed: input.canProceed,
    notes: [
      input.correctnessOk ? 'The expected result set was returned.' : 'The expected result set was not returned.',
      input.safetyOk ? 'The answer stayed inside AE safety boundaries.' : 'The answer had a safety or public-copy issue.',
      responsive ? 'The user saw useful output within budget.' : 'The user waited longer than the useful-output budget.',
      visibleMs === undefined || visibleMs <= VISIBLE_ANSWER_P95_BUDGET_MS
        ? 'The actionable answer appeared within budget.'
        : 'The actionable answer appeared after the visible-answer budget.',
      input.canProceed ? 'The answer gives a next step.' : 'The answer does not give a clear next step.',
    ],
  }

  return {
    id: input.id,
    kind: input.kind,
    ok: input.problems.length === 0 && score >= CASE_SCORE_THRESHOLD,
    score,
    ms: input.ms,
    ...(input.firstWorkStepMs === undefined ? {} : { firstWorkStepMs: input.firstWorkStepMs }),
    ...(input.firstUsefulMs === undefined ? {} : { firstUsefulMs: input.firstUsefulMs }),
    ...(input.firstProviderMs === undefined ? {} : { firstProviderMs: input.firstProviderMs }),
    ...(input.visibleAnswerMs === undefined ? {} : { visibleAnswerMs: input.visibleAnswerMs }),
    responsiveScore,
    abandonmentRisk,
    userOutcome,
    expected: input.expected,
    actual: input.actual,
    problems: input.problems,
  }
}

function scoreCase(input: {
  correctnessOk: boolean
  safetyOk: boolean
  responsiveScore: number
  canProceed: boolean
  generatedUiOk: boolean
}): number {
  let score = 0
  if (input.correctnessOk) {
    score += 3
  }
  if (input.safetyOk) {
    score += 2
  }
  score += input.responsiveScore
  if (input.canProceed) {
    score += 1.5
  }
  if (input.generatedUiOk) {
    score += 1.5
  }
  return round2(score)
}

function scoreResponsiveDimension(input: {
  responsiveOk: boolean
  ms: number
  firstWorkStepMs?: number
  firstUsefulMs?: number
  visibleAnswerMs?: number
}): number {
  if (!input.responsiveOk) {
    return 0
  }
  if (
    input.firstWorkStepMs === undefined &&
    input.firstUsefulMs === undefined &&
    input.visibleAnswerMs === undefined
  ) {
    return 2
  }

  let score = 1.2
  if ((input.firstWorkStepMs ?? input.ms) <= EXCELLENT_FIRST_WORK_STEP_MS) {
    score += 0.2
  }
  if ((input.firstUsefulMs ?? input.ms) <= EXCELLENT_FIRST_USEFUL_MS) {
    score += 0.25
  }
  if ((input.visibleAnswerMs ?? input.firstUsefulMs ?? input.ms) <= EXCELLENT_VISIBLE_ANSWER_MS) {
    score += 0.35
  }
  if (input.ms <= EXCELLENT_ANSWER_TOTAL_MS) {
    score += 0.2
  }
  return round2(Math.min(2, score))
}

function scoreAbandonment(input: {
  correctnessOk: boolean
  safetyOk: boolean
  ms: number
  firstUsefulMs?: number
  visibleAnswerMs?: number
}): StudyCaseReport['abandonmentRisk'] {
  if (!input.correctnessOk || !input.safetyOk) {
    return 'high'
  }
  const usefulMs = input.firstUsefulMs ?? input.ms
  const visibleMs = input.visibleAnswerMs ?? usefulMs
  if (usefulMs > 10_000 || input.ms > 20_000) {
    return 'high'
  }
  if (
    usefulMs > FIRST_USEFUL_P95_BUDGET_MS ||
    visibleMs > VISIBLE_ANSWER_P95_BUDGET_MS ||
    input.ms > ANSWER_TOTAL_P95_BUDGET_MS
  ) {
    return 'medium'
  }
  return 'low'
}

function buildReport(base: string, cases: readonly StudyCaseReport[]): StudyReport {
  const directSearchMs = cases.filter((testCase) => testCase.kind === 'search').map((testCase) => testCase.ms)
  const answerCases = cases.filter((testCase) =>
    testCase.kind === 'answer-turn' || testCase.kind === 'answer-thread'
  )
  const firstWorkStepMs = answerCases.map((testCase) => testCase.firstWorkStepMs ?? testCase.ms)
  const firstUsefulMs = answerCases.map((testCase) => testCase.firstUsefulMs ?? testCase.ms)
  const visibleAnswerMs = answerCases.map((testCase) => testCase.visibleAnswerMs ?? testCase.firstUsefulMs ?? testCase.ms)
  const answerTotalMs = answerCases.map((testCase) => testCase.ms)
  const scores = cases.map((testCase) => testCase.score)
  const failedCaseCount = cases.filter((testCase) => !testCase.ok).length
  const p95DirectSearchMs = percentile(directSearchMs, 95)
  const p95FirstWorkStepMs = percentile(firstWorkStepMs, 95)
  const p95FirstUsefulChatMs = percentile(firstUsefulMs, 95)
  const p95VisibleAnswerMs = percentile(visibleAnswerMs, 95)
  const p95AnswerTotalMs = percentile(answerTotalMs, 95)

  return {
    schemaVersion: 'ae-live-api-study:v1',
    baseUrl: base,
    generatedAt: new Date().toISOString(),
    ok: failedCaseCount === 0 &&
      p95DirectSearchMs <= DIRECT_SEARCH_P95_BUDGET_MS &&
      p95FirstWorkStepMs <= FIRST_WORK_STEP_P95_BUDGET_MS &&
      p95FirstUsefulChatMs <= FIRST_USEFUL_P95_BUDGET_MS &&
      p95VisibleAnswerMs <= VISIBLE_ANSWER_P95_BUDGET_MS &&
      p95AnswerTotalMs <= ANSWER_TOTAL_P95_BUDGET_MS,
    successCriteria: {
      directSearchP95Ms: DIRECT_SEARCH_P95_BUDGET_MS,
      firstWorkStepP95Ms: FIRST_WORK_STEP_P95_BUDGET_MS,
      firstUsefulChatP95Ms: FIRST_USEFUL_P95_BUDGET_MS,
      visibleAnswerP95Ms: VISIBLE_ANSWER_P95_BUDGET_MS,
      answerTotalP95Ms: ANSWER_TOTAL_P95_BUDGET_MS,
      caseScoreThreshold: CASE_SCORE_THRESHOLD,
    },
    summary: {
      caseCount: cases.length,
      failedCaseCount,
      minScore: scores.length === 0 ? 0 : Math.min(...scores),
      averageScore: round2(average(scores)),
      p95DirectSearchMs,
      p95FirstWorkStepMs,
      p95FirstUsefulChatMs,
      p95VisibleAnswerMs,
      p95AnswerTotalMs,
      maxAnswerTotalMs: answerTotalMs.length === 0 ? 0 : Math.max(...answerTotalMs),
    },
    cases,
  }
}

function formatSummary(report: StudyReport, reportPath: string): string {
  return [
    `live API study: ${report.ok ? 'passed' : 'failed'}`,
    `cases=${report.summary.caseCount}`,
    `failedCases=${report.summary.failedCaseCount}`,
    `minScore=${report.summary.minScore}/10`,
    `avgScore=${report.summary.averageScore}`,
    `p95DirectSearchMs=${report.summary.p95DirectSearchMs}`,
    `p95FirstWorkStepMs=${report.summary.p95FirstWorkStepMs}`,
    `p95FirstUsefulChatMs=${report.summary.p95FirstUsefulChatMs}`,
    `p95VisibleAnswerMs=${report.summary.p95VisibleAnswerMs}`,
    `p95AnswerTotalMs=${report.summary.p95AnswerTotalMs}`,
    `report=${reportPath}`,
  ].join(' ')
}

function readBusinessSlugs(page: BusinessSearchPage | undefined): string[] {
  return (page?.items ?? []).map((item) => item.slug).filter(isString)
}

function readSnapshotSlugs(snapshot: AnswerSnapshot | undefined): string[] {
  return (snapshot?.providers ?? []).map((provider) => provider.slug).filter(isString)
}

function readPublicText(snapshot: AnswerSnapshot | undefined): string {
  if (snapshot === undefined) {
    return ''
  }
  return [snapshot.oneLine, snapshot.summary, snapshot.nextStep].filter(isString).join(' ')
}

function findInternalPublicTerms(publicText: string): string[] {
  return INTERNAL_PUBLIC_TERMS.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(publicText)
  })
}

function findUnsafeClaimProblems(publicText: string): string[] {
  return UNSAFE_PUBLIC_PATTERNS
    .filter((pattern) => pattern.test(publicText))
    .map((pattern) => `unsafe public claim matched ${String(pattern)}`)
}

function parseSessionCookie(value: string | null): string | undefined {
  if (value === null) {
    return undefined
  }
  const cookie = value.split(';')[0]?.trim()
  return cookie === undefined || cookie.length === 0 ? undefined : cookie
}

function sameStringList(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index])
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)] ?? 0
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function elapsedMs(started: number): number {
  return Math.round(performance.now() - started)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function urlFor(base: string, path: string): URL {
  return new URL(path, base)
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function readArgs(argv: readonly string[]): { baseUrl?: string; output?: string } {
  const parsed: { baseUrl?: string; output?: string } = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--base-url') {
      const value = argv[index + 1]
      if (value !== undefined) {
        parsed.baseUrl = value
        index += 1
      }
      continue
    }
    if (arg === '--output') {
      const value = argv[index + 1]
      if (value !== undefined) {
        parsed.output = value
        index += 1
      }
    }
  }
  return parsed
}
