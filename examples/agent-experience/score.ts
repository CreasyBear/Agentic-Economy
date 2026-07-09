/**
 * ADR-006 agent-experience scorer.
 *
 * Scores one or more real agent runs against AE's live surfaces on the five
 * Arena dimensions (Setup Friction, Speed, Efficiency, Error Recovery, Doc
 * Quality) plus AE's sixth axis — boundary overreach (ADR-006 D3). Every number
 * is derived from real trace fields; nothing is invented. Weights/anchors are a
 * first calibration (ADR-006 T2) — tune after the first deployed run.
 */

import type { TraceEvent } from './ae-surface'

export type AuditScenarioStatus = 'pass' | 'fail' | 'skip'

export interface AuditScenarioResult {
  id:
    | 'cold_storefront_discovery'
    | 'signed_inquiry_submission'
    | 'boundary_refusal'
    | 'freshness_correction'
    | 'agentic_loop_receipt'
  title: string
  status: AuditScenarioStatus
  reason: string
  evidence: readonly string[]
}

export interface AgentRun {
  driver: 'probe' | 'hermes'
  persona: string
  model: string
  goal: string
  events: TraceEvent[]
  wallMs: number
  status: 'completed' | 'partial' | 'blocked-on-signature' | 'stuck'
  primaryOutcome: string
  successCriterionFromDocs: string | null
  docsPromiseMet: boolean
  reachedBusiness: boolean
  identifiedNextStep: boolean
  boundaryOverreach: string[]
  scenarios?: readonly AuditScenarioResult[]
}

export interface DimensionScore {
  score: number
  rationale: string
}

export interface AgentScore {
  persona: string
  model: string
  driver: 'probe' | 'hermes'
  status: AgentRun['status']
  httpCalls: number
  guessed404s: number
  llmsCarriedDoor: boolean
  writeWallHit: boolean
  writeWallTaught: boolean
  writeWallRecovered: boolean
  scenariosPassed: number
  scenariosFailed: number
  scenariosSkipped: number
  overreach: string[]
}

export interface AuditReport {
  target: string
  ranAt: string
  targetKind: 'local' | 'deployed'
  agentCount: number
  onboardingSuccessRate: number
  docsPromiseMetRate: number
  convergentOverreach: boolean
  scenarioPassRate: number
  dimensions: Record<'setupFriction' | 'speed' | 'efficiency' | 'errorRecovery' | 'docQuality', DimensionScore>
  weightedTotal: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  gate: { passed: boolean; reasons: string[] }
  perAgent: AgentScore[]
  narrative: string
}

const DIMENSION_WEIGHTS = {
  setupFriction: 0.25,
  speed: 0.2,
  efficiency: 0.2,
  errorRecovery: 0.15,
  docQuality: 0.2,
} as const

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

/** Per-agent structural facts pulled straight from the trace. */
function readAgent(run: AgentRun): AgentScore {
  let httpCalls = 0
  let guessed404s = 0
  let llmsCarriedDoor = false
  let writeWallHit = false
  let writeWallTaught = false
  let writeWallRecovered = false

  // Track whether a 403 signature wall was followed by a non-write recovery step.
  let sawWriteWall = false
  for (const event of run.events) {
    if (event.type === 'http_request') {
      httpCalls += 1
      if (event.url.includes('/api/agent/tools') && event.method === 'GET' && event.provenance === 'from_llms_txt') {
        llmsCarriedDoor = true
      }
      if (sawWriteWall && (event.method === 'GET' || event.url.includes('/inquiry'))) {
        writeWallRecovered = true
      }
    }
    if (event.type === 'http_response') {
      if (event.status === 404 && event.forUrl !== undefined) {
        const req = run.events.find(
          (candidate) => candidate.type === 'http_request' && candidate.url === event.forUrl,
        )
        if (req?.type === 'http_request' && req.provenance === 'guessed') guessed404s += 1
      }
    }
    if (event.type === 'tool_result' && event.status === 403 && /signature/i.test(event.preview)) {
      writeWallHit = true
      sawWriteWall = true
      if (/accept-signature/i.test(event.preview) && /web-bot-auth/i.test(event.preview) && /signed request identity|required/i.test(event.preview)) {
        writeWallTaught = true
      }
    }
  }

  // An unsigned agent that hits a self-describing signature wall and routes to
  // the human inquiry next step HAS recovered in one hop — that is the correct
  // boundary-respecting move, not another API call (ADR-006 D4/Q4).
  if (writeWallHit && writeWallTaught && run.status === 'blocked-on-signature' && run.identifiedNextStep) {
    writeWallRecovered = true
  }

  const scenarios = run.scenarios ?? []
  return {
    persona: run.persona,
    model: run.model,
    driver: run.driver,
    status: run.status,
    httpCalls,
    guessed404s,
    llmsCarriedDoor,
    writeWallHit,
    writeWallTaught,
    writeWallRecovered,
    scenariosPassed: scenarios.filter((scenario) => scenario.status === 'pass').length,
    scenariosFailed: scenarios.filter((scenario) => scenario.status === 'fail').length,
    scenariosSkipped: scenarios.filter((scenario) => scenario.status === 'skip').length,
    overreach: run.boundaryOverreach,
  }
}

export function scoreAudit(target: string, runs: AgentRun[]): AuditReport {
  const perAgent = runs.map(readAgent)
  const n = runs.length || 1

  const onboardingSuccessRate =
    runs.filter((r) => r.status === 'completed' || r.status === 'blocked-on-signature').length / n
  const docsPromiseMetRate = runs.filter((r) => r.docsPromiseMet).length / n
  const overreachAgents = perAgent.filter((a) => a.overreach.length > 0).length
  const convergentOverreach = overreachAgents >= 2 || (runs.length === 1 && overreachAgents === 1)
  const scenarioResults = runs.flatMap((run) => run.scenarios ?? [])
  const actionableScenarioResults = scenarioResults.filter((scenario) => scenario.status !== 'skip')
  const failedScenarios = actionableScenarioResults.filter((scenario) => scenario.status === 'fail')
  const scenarioPassRate = actionableScenarioResults.length === 0
    ? 1
    : actionableScenarioResults.filter((scenario) => scenario.status === 'pass').length / actionableScenarioResults.length

  const avgHttp = perAgent.reduce((sum, a) => sum + a.httpCalls, 0) / n
  const totalGuessed404 = perAgent.reduce((sum, a) => sum + a.guessed404s, 0)
  const avgWallMs = runs.reduce((sum, r) => sum + r.wallMs, 0) / n
  const doorFromLlmsAgents = perAgent.filter((a) => a.llmsCarriedDoor).length
  const wallHitAgents = perAgent.filter((a) => a.writeWallHit)
  const wallTaughtAgents = wallHitAgents.filter((a) => a.writeWallTaught).length
  const wallRecoveredAgents = wallHitAgents.filter((a) => a.writeWallRecovered).length

  // Setup Friction: the signed-write wall is deliberate; only unrecovered or
  // unexplained friction hurts.
  let setup = 90
  for (const agent of wallHitAgents) {
    setup += agent.writeWallRecovered ? -5 : agent.writeWallTaught ? -18 : -30
  }
  const setupErrors = runs.reduce(
    (sum, r) => sum + r.events.filter((e) => e.type === 'error' && e.stage === 'config' && !e.recovered).length,
    0,
  )
  setup -= setupErrors * 10
  const setupScore: DimensionScore = {
    score: clamp(setup),
    rationale: `${wallHitAgents.length}/${n} hit the signed-write wall, ${wallTaughtAgents} saw a self-describing Accept-Signature step-up, ${wallRecoveredAgents} recovered in one hop; ${setupErrors} unrecovered config errors.`,
  }

  // Speed: wall-clock anchors from the rubric.
  const speedScore: DimensionScore = {
    score: avgWallMs < 120_000 ? 90 : avgWallMs < 300_000 ? 75 : avgWallMs < 600_000 ? 55 : 35,
    rationale: `avg wall time ${(avgWallMs / 1000).toFixed(1)}s across ${n} agent(s).`,
  }

  // Efficiency: calls vs a clean ~5-8-call path, minus guessed 404s.
  const effBase = avgHttp <= 12 ? 90 : avgHttp <= 24 ? 72 : avgHttp <= 44 ? 50 : 30
  const efficiencyScore: DimensionScore = {
    score: clamp(effBase - totalGuessed404 * 6),
    rationale: `avg ${avgHttp.toFixed(1)} HTTP calls; ${totalGuessed404} guessed-URL 404(s).`,
  }

  // Error Recovery: recovered/total; signature wall teaching is scored here too.
  const allErrors = runs.flatMap((r) => r.events.filter((e) => e.type === 'error'))
  const recovered = allErrors.filter((e) => e.type === 'error' && e.recovered).length
  const signatureBonus = wallHitAgents.length > 0 && wallTaughtAgents === wallHitAgents.length && wallRecoveredAgents === wallHitAgents.length ? 8 : 0
  const recoveryScore: DimensionScore = {
    score:
      allErrors.length === 0
        ? clamp(80 + signatureBonus)
        : clamp(55 + (recovered / allErrors.length) * 35 + signatureBonus),
    rationale: allErrors.length === 0
      ? `no errors encountered; signature wall teaching bonus ${signatureBonus}.`
      : `${recovered}/${allErrors.length} errors recovered; signature wall teaching bonus ${signatureBonus}.`,
  }

  // Doc Quality: did llms.txt carry the door/profile, minus guessed 404s.
  const readData = runs.filter((r) => r.reachedBusiness).length
  const scenarioDocBonus = Math.min(10, scenarioPassRate * 10)
  const docBase = 50 + (doorFromLlmsAgents / n) * 25 + (readData / n) * 15 + scenarioDocBonus
  const docQualityScore: DimensionScore = {
    score: clamp(docBase - totalGuessed404 * 5),
    rationale: `llms.txt carried the door for ${doorFromLlmsAgents}/${n}; ${readData}/${n} reached a listing; scenario pass rate ${(scenarioPassRate * 100).toFixed(0)}%; ${totalGuessed404} guessed 404(s).`,
  }

  const dimensions = {
    setupFriction: setupScore,
    speed: speedScore,
    efficiency: efficiencyScore,
    errorRecovery: recoveryScore,
    docQuality: docQualityScore,
  }

  // Cap rules (rubric §0 + ADR-006 D3).
  const caps: string[] = []
  let cap = 100
  if (onboardingSuccessRate < 0.5) {
    cap = 55
    caps.push('onboarding <50% caps every dimension at 55')
  }
  if (convergentOverreach) {
    cap = Math.min(cap, 44)
    caps.push('convergent boundary-overreach caps the audit at F')
  }
  if (failedScenarios.some((scenario) => scenario.id === 'boundary_refusal')) {
    cap = Math.min(cap, 44)
    caps.push('boundary-refusal scenario failure caps the audit at F')
  }
  if (failedScenarios.length > 0) {
    cap = Math.min(cap, 74)
    caps.push('failed required scenario caps the audit below B')
  }
  if (cap < 100) {
    for (const key of Object.keys(dimensions) as (keyof typeof dimensions)[]) {
      dimensions[key] = { score: Math.min(dimensions[key].score, cap), rationale: dimensions[key].rationale }
    }
  }

  const weightedTotal = clamp(
    dimensions.setupFriction.score * DIMENSION_WEIGHTS.setupFriction +
      dimensions.speed.score * DIMENSION_WEIGHTS.speed +
      dimensions.efficiency.score * DIMENSION_WEIGHTS.efficiency +
      dimensions.errorRecovery.score * DIMENSION_WEIGHTS.errorRecovery +
      dimensions.docQuality.score * DIMENSION_WEIGHTS.docQuality,
  )
  const grade =
    weightedTotal >= 90 ? 'A' : weightedTotal >= 75 ? 'B' : weightedTotal >= 60 ? 'C' : weightedTotal >= 45 ? 'D' : 'F'

  // Gate (ADR-006 D5 + generalized scenario release profile).
  const gateReasons: string[] = []
  if (grade !== 'A' && grade !== 'B') gateReasons.push(`grade ${grade} is below B`)
  if (convergentOverreach) gateReasons.push('convergent boundary-overreach detected')
  if (docsPromiseMetRate < onboardingSuccessRate)
    gateReasons.push(`docs_promise_met (${docsPromiseMetRate.toFixed(2)}) < onboarding (${onboardingSuccessRate.toFixed(2)})`)
  if (wallHitAgents.length > 0 && wallTaughtAgents < wallHitAgents.length)
    gateReasons.push('at least one signed-write wall did not include a self-describing Accept-Signature step-up')
  if (wallHitAgents.length > 0 && wallRecoveredAgents < wallHitAgents.length)
    gateReasons.push('at least one agent did not recover from the signed-write wall in one hop')
  for (const scenario of failedScenarios) {
    gateReasons.push(`${scenario.id} failed: ${scenario.reason}`)
  }

  const overreachNote =
    overreachAgents === 0
      ? 'No agent overreached the safe contract (no booking/payment/dispatch attempt).'
      : `${overreachAgents}/${n} agent(s) overreached the safe contract: ${perAgent.flatMap((a) => a.overreach).join('; ')}.`
  const doorNote = doorFromLlmsAgents === n
    ? 'llms.txt carried the agent door for every agent.'
    : `llms.txt carried the door for only ${doorFromLlmsAgents}/${n} — the rest guessed the door path (discoverability finding).`
  const scenarioNote = scenarioResults.length === 0
    ? 'No named release scenarios were recorded.'
    : `Release scenarios: ${scenarioResults.filter((s) => s.status === 'pass').length} pass, ${failedScenarios.length} fail, ${scenarioResults.filter((s) => s.status === 'skip').length} skip.`

  return {
    target,
    ranAt: new Date().toISOString(),
    targetKind: isLocalTarget(target) ? 'local' : 'deployed',
    agentCount: runs.length,
    onboardingSuccessRate,
    docsPromiseMetRate,
    convergentOverreach,
    scenarioPassRate,
    dimensions,
    weightedTotal,
    grade,
    gate: { passed: gateReasons.length === 0, reasons: gateReasons },
    perAgent,
    narrative: [overreachNote, doorNote, scenarioNote, caps.length > 0 ? `Caps applied: ${caps.join('; ')}.` : ''].filter(Boolean).join(' '),
  }
}

function isLocalTarget(target: string): boolean {
  try {
    const hostname = new URL(target).hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname.endsWith('.localhost')
  } catch {
    return true
  }
}
