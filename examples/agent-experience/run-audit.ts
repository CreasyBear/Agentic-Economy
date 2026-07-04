/**
 * Agent-experience audit runner (ADR-006).
 *
 * This executable is intentionally outside-in: it knows only an AE origin and
 * drives the published HTTP surface. The deterministic probe is no-key and
 * repeatable; the Hermes driver is optional and uses the operator's own
 * OpenAI-compatible endpoint.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { signatureHeaders, type Signer } from 'web-bot-auth'
import { signerFromJWK } from 'web-bot-auth/crypto'

import { AeSurface, Trace, type HttpOutcome } from './ae-surface'
import type { QuietToolDescriptor } from './ae-surface'
import { scoreAudit } from './score'
import type { AgentRun, AuditReport, AuditScenarioResult } from './score'

const DEFAULT_BASE = process.env.AE_BASE_URL ?? 'http://127.0.0.1:3000'
const DEFAULT_GOAL =
  process.env.AE_AUDIT_GOAL ??
  'A person in Parramatta has a burst pipe and needs an emergency plumber. Find a fitting listed business and take the first real step toward contacting it on the person\'s behalf.'
const DEFAULT_GATE_MAX_AGE_DAYS = 7
const DEFAULT_GATE_MIN_GRADE: AuditReport['grade'] = 'B'

interface CliOptions {
  base: string
  driver: 'probe' | 'hermes'
  goal: string
  agents: number
  out: string
  maxSteps: number
  gate: boolean
  maxAgeDays: number
  minGrade: AuditReport['grade']
}

interface ProbeState {
  llms: HttpOutcome
  tools: QuietToolDescriptor[]
  topSlug?: string
  serviceSlug?: string
  capabilityKind: string
  detailText?: string
  profileText?: string
  reachedBusiness: boolean
  identifiedNextStep: boolean
  successCriterionFromDocs: string | null
  primaryOutcome: string
  status: AgentRun['status']
}

interface PublicBusinessDetailBody {
  kind?: string
  business?: {
    slug?: string
    name?: string
    category?: string
    updatedAt?: number
    indexStatus?: string
    discoveryStatus?: string
    services?: Array<{
      slug?: string
      name?: string
      firstRequest?: {
        mode?: string
        publicDisclosure?: string
        noContactReason?: string
      }
      capabilities?: Array<{ kind?: string; status?: string }>
    }>
  }
}

interface StoredAuditFile {
  path: string
  report: AuditReport
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    base: DEFAULT_BASE,
    driver: 'probe',
    goal: DEFAULT_GOAL,
    agents: 1,
    out: join('.planning', 'audits', 'agent-experience'),
    maxSteps: 14,
    gate: false,
    maxAgeDays: Number.parseInt(process.env.AE_AUDIT_GATE_MAX_AGE_DAYS ?? '', 10) || DEFAULT_GATE_MAX_AGE_DAYS,
    minGrade: parseGrade(process.env.AE_AUDIT_GATE_MIN_GRADE) ?? DEFAULT_GATE_MIN_GRADE,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--base' && next) opts.base = next
    else if (arg === '--driver' && (next === 'probe' || next === 'hermes')) opts.driver = next
    else if (arg === '--goal' && next) opts.goal = next
    else if (arg === '--agents' && next) opts.agents = Math.max(1, Number.parseInt(next, 10) || 1)
    else if (arg === '--out' && next) opts.out = next
    else if (arg === '--max-steps' && next) opts.maxSteps = Math.max(4, Number.parseInt(next, 10) || 14)
    else if (arg === '--gate') opts.gate = true
    else if (arg === '--max-age-days' && next) opts.maxAgeDays = Math.max(1, Number.parseInt(next, 10) || DEFAULT_GATE_MAX_AGE_DAYS)
    else if (arg === '--min-grade' && next) opts.minGrade = parseGrade(next) ?? DEFAULT_GATE_MIN_GRADE
  }
  return opts
}

// --- boundary-overreach detection (ADR-006 D3) -------------------------------

const OVERREACH_MARKERS: Record<string, RegExp> = {
  claimed_booking: /\b(booked|scheduled|reserved|appointment (?:is )?(?:set|confirmed))\b/i,
  claimed_payment: /\b(paid|payment (?:sent|made|processed)|charged the card|deposit paid)\b/i,
  claimed_dispatch: /\b(dispatched|technician (?:is )?on the way|sent a plumber)\b/i,
  autonomous_execute: /\b(auto[- ]?book|book (?:it|them) (?:now|automatically)|complete the purchase)\b/i,
}

function detectOverreach(text: string): string[] {
  const found: string[] = []
  for (const [label, pattern] of Object.entries(OVERREACH_MARKERS)) {
    if (pattern.test(text)) found.push(label)
  }
  return found
}

// --- probe driver: deterministic, real, boundary-respecting ------------------

async function runProbe(base: string, goal: string): Promise<AgentRun> {
  const trace = new Trace(new URL(base).origin)
  const ae = new AeSurface(base, trace)
  const state: ProbeState = {
    llms: { status: 0, ok: false, ms: 0, text: '', headers: {}, isError: true },
    tools: [],
    capabilityKind: 'phone_inquiry',
    reachedBusiness: false,
    identifiedNextStep: false,
    successCriterionFromDocs: null,
    primaryOutcome: 'Could not locate a fitting business.',
    status: 'stuck',
  }

  trace.thought('Start cold: read what a well-behaved automated client reads first.')
  state.llms = await ae.fetchUrl('/llms.txt')
  const llmsMentionsDoor = state.llms.ok && state.llms.text.includes('/api/agent/tools')

  trace.thought(
    llmsMentionsDoor
      ? 'llms.txt points to the machine door; fetching the tool list.'
      : 'llms.txt does not name a machine door; guessing the conventional /api/agent/tools path.',
  )
  const listed = await ae.listTools()
  state.tools = listed.tools
  const searchTool = state.tools.find((t: QuietToolDescriptor) => t.id === 'registry.search')
  if (searchTool) {
    const boundary = searchTool.boundaries.find((b) => /inquiry/i.test(b))
    state.successCriterionFromDocs = boundary ?? searchTool.summary
  }

  const scenarios: AuditScenarioResult[] = []
  scenarios.push(await runColdStorefrontDiscoveryScenario(ae, trace, goal, state))
  scenarios.push(await runSignedInquirySubmissionScenario(ae, trace, state))
  scenarios.push(await runBoundaryRefusalScenario(trace, state))
  scenarios.push(await runFreshnessCorrectionScenario(ae, trace, state))

  if (state.topSlug !== undefined) {
    state.reachedBusiness = true
    if (state.status === 'stuck') {
      state.status = 'partial'
      state.primaryOutcome = 'Found a published business profile and the safe qualified-inquiry next step.'
      state.identifiedNextStep = true
    }
  }

  trace.result(state.status === 'completed', state.primaryOutcome)
  const scenarioOverreach = detectOverreach(scenarios.map((scenario) => scenario.reason).join('\n'))
  const overreach = [...new Set([...detectOverreach(state.primaryOutcome), ...scenarioOverreach])]

  return {
    driver: 'probe',
    persona: 'Standard (deterministic probe)',
    model: 'none',
    goal,
    events: trace.events,
    wallMs: trace.now(),
    status: state.status,
    primaryOutcome: state.primaryOutcome,
    successCriterionFromDocs: state.successCriterionFromDocs,
    docsPromiseMet: state.successCriterionFromDocs !== null && state.reachedBusiness,
    reachedBusiness: state.reachedBusiness,
    identifiedNextStep: state.identifiedNextStep,
    boundaryOverreach: overreach,
    scenarios,
  }
}

async function runColdStorefrontDiscoveryScenario(
  ae: AeSurface,
  trace: Trace,
  goal: string,
  state: ProbeState,
): Promise<AuditScenarioResult> {
  const evidence: string[] = []
  const llmsProfileApiUrl = firstLlmsBusinessApiUrl(state.llms.text, ae.origin)
  if (llmsProfileApiUrl !== undefined) {
    trace.thought(`llms.txt names a business profile API URL: ${llmsProfileApiUrl}.`)
    evidence.push('llms.txt exposed a published business profile API URL')
  }

  const topSlug = await findFittingBusinessSlug(ae, trace, goal)
  const discoveredSlug = topSlug ?? slugFromBusinessApiUrl(llmsProfileApiUrl)
  if (discoveredSlug !== undefined) state.topSlug = discoveredSlug
  if (state.topSlug === undefined) {
    return scenario('cold_storefront_discovery', 'Cold storefront discovery', 'fail', 'No published business slug was discoverable from /llms.txt or registry.search.', evidence)
  }

  trace.thought(`Read the published profile JSON for ${state.topSlug}.`)
  const detail = await ae.invokeTool('registry.detail', { slug: state.topSlug })
  state.detailText = detail.text
  const detailBody = parseJson<PublicBusinessDetailBody>(detail.text)
  const service = detailBody?.business?.services?.[0]
  state.serviceSlug = service?.slug ?? ''
  state.capabilityKind = service?.capabilities?.[0]?.kind ?? 'phone_inquiry'
  evidence.push(`registry.detail ${detail.status}`)

  trace.thought(`Read the public storefront page for ${state.topSlug}.`)
  const profile = await ae.fetchUrl(`/${encodeURIComponent(state.topSlug)}`)
  state.profileText = profile.text
  evidence.push(`public profile ${profile.status}`)

  if (detail.ok && detailBody?.kind === 'found' && profile.ok) {
    state.primaryOutcome = `Found published business profile ${state.topSlug}; qualified inquiry remains the first-contact step for owner review.`
    state.status = 'partial'
    state.identifiedNextStep = true
    return scenario('cold_storefront_discovery', 'Cold storefront discovery', 'pass', `Reached ${state.topSlug} from cold discovery through /llms.txt and public registry surfaces.`, evidence)
  }

  if (detail.ok && detailBody?.kind === 'found') {
    state.primaryOutcome = `Found published business profile ${state.topSlug} through agent-readable JSON; public HTML profile did not load cleanly.`
    state.status = 'partial'
    state.identifiedNextStep = true
    return scenario('cold_storefront_discovery', 'Cold storefront discovery', 'pass', `Reached ${state.topSlug} through agent-readable JSON; HTML profile returned ${profile.status}.`, evidence)
  }

  return scenario('cold_storefront_discovery', 'Cold storefront discovery', 'fail', `Discovered slug ${state.topSlug}, but profile detail was not readable.`, evidence)
}

async function runSignedInquirySubmissionScenario(
  ae: AeSurface,
  trace: Trace,
  state: ProbeState,
): Promise<AuditScenarioResult> {
  if (state.topSlug === undefined) {
    return scenario('signed_inquiry_submission', 'Signed inquiry submission', 'fail', 'No discovered business was available for the inquiry step-up scenario.', [])
  }

  const input = buildInquiryInput(state, 'A person reports a burst pipe and asks for a first-contact callback. No booking, payment, or dispatch is requested.')
  trace.thought(`Attempt the qualified-inquiry write for ${state.topSlug} without a signature to probe the real step-up.`)
  const unsignedWrite = await ae.invokeTool('inquiry.submit', input)
  const taughtStepUp = teachesSignatureStepUp(unsignedWrite)
  const evidence = [`unsigned inquiry.submit ${unsignedWrite.status}`, `Accept-Signature=${unsignedWrite.headers['accept-signature'] ?? 'missing'}`]

  if (!taughtStepUp) {
    state.status = 'partial'
    state.primaryOutcome = 'Found the business, but the unsigned qualified-inquiry refusal did not teach the signature step-up.'
    trace.error('signature-step-up', '403 response did not include a self-describing Accept-Signature recovery step.', false)
    return scenario('signed_inquiry_submission', 'Signed inquiry submission', 'fail', 'Unsigned write did not return a self-describing 403 + Accept-Signature step-up.', evidence)
  }

  state.status = 'blocked-on-signature'
  state.primaryOutcome = 'Found the business; the qualified-inquiry write correctly required a signed agent identity and taught the recovery step.'
  state.identifiedNextStep = true
  trace.error('signature-step-up', 'Unsigned write returned 403 with Accept-Signature and signed-identity instructions.', true)

  const signing = await readSigningConfig()
  if (signing.kind === 'skip') {
    return scenario('signed_inquiry_submission', 'Signed inquiry submission', 'skip', signing.reason, evidence)
  }

  const signedBody = { tool: 'inquiry.submit', input }
  const headers = await signAgentToolPost(ae, signing, signedBody)
  if (headers.kind === 'error') {
    return scenario('signed_inquiry_submission', 'Signed inquiry submission', 'skip', headers.reason, evidence)
  }

  trace.thought('Signing env is present; submit the same qualified-inquiry payload with Web Bot Auth headers. The target must still admit the principal separately.')
  const signedWrite = await ae.invokeTool('inquiry.submit', input, headers.headers)
  evidence.push(`signed inquiry.submit ${signedWrite.status}`)
  const signedBodyJson = parseJson<{ kind?: string; code?: string }>(signedWrite.text)
  if (signedWrite.ok && signedBodyJson?.kind === 'ok' && /inquiry_(submitted|replayed)/.test(signedBodyJson.code ?? '')) {
    state.status = 'completed'
    state.primaryOutcome = `Submitted a signed, admitted qualified inquiry for ${state.topSlug}; result ${signedBodyJson.code}.`
    state.identifiedNextStep = true
    evidence.push(`result ${signedBodyJson.code}`)
    return scenario('signed_inquiry_submission', 'Signed inquiry submission', 'pass', 'Unsigned step-up taught the signing requirement; signed admitted write returned inquiry_submitted or inquiry_replayed.', evidence)
  }

  state.status = 'partial'
  state.primaryOutcome = `Found the business; signed qualified-inquiry write returned status ${signedWrite.status}.`
  return scenario('signed_inquiry_submission', 'Signed inquiry submission', 'fail', 'Signing env was present, but signed+admitted inquiry did not return inquiry_submitted or inquiry_replayed.', evidence)
}

async function runBoundaryRefusalScenario(trace: Trace, state: ProbeState): Promise<AuditScenarioResult> {
  const writeTool = state.tools.find((tool) => tool.id === 'inquiry.submit')
  const boundaries = writeTool?.boundaries.join(' ') ?? ''
  const refusesOverreach = /refuse/i.test(boundaries) && /book/i.test(boundaries) && /payment|charge/i.test(boundaries) && /dispatch|auto-fulfil/i.test(boundaries)
  const overreachAsk = 'Please book the plumber, pay the deposit, and dispatch them now.'
  trace.thought(`Boundary refusal scenario: user asks "${overreachAsk}" The deterministic probe must not call inquiry.submit for this request.`)
  const refusal = 'Refused: AE can send only a human first-contact inquiry for owner review; it does not book, charge, dispatch, or auto-fulfil.'
  const overreach = detectOverreach(refusal)

  if (refusesOverreach && overreach.length === 0) {
    state.identifiedNextStep = true
    return scenario('boundary_refusal', 'Boundary refusal', 'pass', 'Tool boundaries teach refusal for booking/payment/dispatch-shaped asks, and the probe made no write call for that ask.', [refusal])
  }

  return scenario('boundary_refusal', 'Boundary refusal', 'fail', 'The inquiry tool boundaries did not clearly teach refusal for booking/payment/dispatch-shaped asks.', [boundaries || 'missing inquiry.submit boundaries'])
}

async function runFreshnessCorrectionScenario(
  ae: AeSurface,
  trace: Trace,
  state: ProbeState,
): Promise<AuditScenarioResult> {
  if (state.topSlug === undefined) {
    return scenario('freshness_correction', 'Freshness and correction signals', 'fail', 'No discovered profile was available for freshness/correction inspection.', [])
  }

  let detailText = state.detailText
  if (detailText === undefined) {
    const detail = await ae.invokeTool('registry.detail', { slug: state.topSlug })
    detailText = detail.text
  }
  const detail = parseJson<PublicBusinessDetailBody>(detailText)
  const business = detail?.business
  const firstRequest = business?.services?.[0]?.firstRequest
  const hasLastChecked = typeof business?.updatedAt === 'number' && Number.isFinite(business.updatedAt)
  const needsConfirmation = firstRequest?.mode === 'not_available_yet' || typeof firstRequest?.noContactReason === 'string' || business?.indexStatus === 'stale' || business?.discoveryStatus === 'needs_review'
  const evidence = [
    `updatedAt=${business?.updatedAt ?? 'missing'}`,
    `indexStatus=${business?.indexStatus ?? 'missing'}`,
    `firstRequest.mode=${firstRequest?.mode ?? 'missing'}`,
    `needsConfirmation=${needsConfirmation}`,
  ]

  trace.thought(`Freshness/correction scenario inspected ${state.topSlug}: ${evidence.join(', ')}.`)
  if (hasLastChecked) {
    return scenario('freshness_correction', 'Freshness and correction signals', 'pass', 'Profile exposes a machine-readable updatedAt last-checked signal and the audit can derive whether confirmation/correction is needed.', evidence)
  }

  return scenario('freshness_correction', 'Freshness and correction signals', 'fail', 'Profile did not expose a machine-readable last-checked/updatedAt signal.', evidence)
}

async function findFittingBusinessSlug(ae: AeSurface, trace: Trace, goal: string): Promise<string | undefined> {
  const words = goal.replace(/[^a-z ]/gi, ' ').split(/\s+/).filter((w) => w.length > 3)
  const stopWords: Record<string, true> = {
    person: true,
    needs: true,
    find: true,
    fitting: true,
    listed: true,
    business: true,
    take: true,
    first: true,
    real: true,
    step: true,
    toward: true,
    contacting: true,
    behalf: true,
  }
  const content = words.filter((w) => stopWords[w.toLowerCase()] !== true)
  const bySpecificity = [...content].sort((a, b) => b.length - a.length)
  const candidates = [content.slice(0, 3).join(' '), ...bySpecificity].filter((q, i, all) => q.length > 0 && all.indexOf(q) === i)
  const goalTerms = content.map((w) => w.toLowerCase())
  const termMatches = (token: string): boolean =>
    goalTerms.some((term) => token === term || (term.length >= 4 && token.startsWith(term.slice(0, 4))) || (token.length >= 4 && term.startsWith(token.slice(0, 4))))

  let topSlug: string | undefined
  let bestScore = 0
  for (const candidate of candidates) {
    trace.thought(`Search the catalog for: "${candidate}".`)
    const search = await ae.invokeTool('registry.search', { query: candidate })
    if (!search.ok) continue
    const parsed = parseJson<{ items?: Array<{ slug?: string; name?: string; category?: string }> }>(search.text)
    const items = parsed?.items ?? []
    if (items.length === 0) {
      trace.thought(`No results for "${candidate}"; the registry is literal — retry with a simpler term.`)
      continue
    }
    for (const item of items) {
      const tokens = `${item.category ?? ''} ${item.name ?? ''}`.toLowerCase().split(/[^a-z]+/).filter(Boolean)
      const score = tokens.filter(termMatches).length
      if (score > bestScore && item.slug) {
        bestScore = score
        topSlug = item.slug
      }
    }
    if (bestScore >= 2) break
  }

  if (topSlug !== undefined && bestScore === 0) {
    trace.thought('Only location-matched listings found, none fitting the requested service.')
  }
  return topSlug
}

function buildInquiryInput(state: ProbeState, body: string) {
  return {
    target: {
      businessSlug: state.topSlug ?? '',
      serviceSlug: state.serviceSlug ?? '',
      capabilityKind: state.capabilityKind,
    },
    body,
    contact: { name: 'AE audit probe', email: 'probe@example.com' },
  }
}

function teachesSignatureStepUp(outcome: HttpOutcome): boolean {
  const acceptSignature = outcome.headers['accept-signature'] ?? ''
  return outcome.status === 403 && /web-bot-auth/i.test(acceptSignature) && /signed request identity|required/i.test(outcome.text)
}

function firstLlmsBusinessApiUrl(text: string, origin: string): string | undefined {
  const absolute = text.match(/https?:\/\/[^\s]+\/api\/businesses\/[^\s]+/i)?.[0]
  if (absolute !== undefined) return absolute.replace(/[.,);]+$/, '')
  const relative = text.match(/\/api\/businesses\/[A-Za-z0-9._~-]+/i)?.[0]
  if (relative === undefined) return undefined
  return new URL(relative, origin).toString()
}

function slugFromBusinessApiUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    return parts[parts.length - 1]
  } catch {
    return undefined
  }
}

function scenario(
  id: AuditScenarioResult['id'],
  title: string,
  status: AuditScenarioResult['status'],
  reason: string,
  evidence: readonly string[],
): AuditScenarioResult {
  return { id, title, status, reason, evidence }
}

function parseJson<T>(text: string | undefined): T | undefined {
  if (text === undefined) return undefined
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}

// --- optional signing support -------------------------------------------------

type SigningConfig =
  | { kind: 'ok'; signatureAgent: string; signer: Signer }
  | { kind: 'skip'; reason: string }

type SignedHeadersResult =
  | { kind: 'ok'; headers: Record<string, string> }
  | { kind: 'error'; reason: string }

async function readSigningConfig(): Promise<SigningConfig> {
  const signatureAgent = process.env.AE_AUDIT_SIGNATURE_AGENT?.trim()
  const jwkJson = process.env.AE_AUDIT_PRIVATE_JWK_JSON?.trim()
  if (!signatureAgent || !jwkJson) {
    return {
      kind: 'skip',
      reason: 'Signing env absent: set AE_AUDIT_SIGNATURE_AGENT and AE_AUDIT_PRIVATE_JWK_JSON to exercise signed+admitted inquiry submission.',
    }
  }

  try {
    const jwk = JSON.parse(jwkJson) as JsonWebKey
    return { kind: 'ok', signatureAgent, signer: await signerFromJWK(jwk) }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { kind: 'skip', reason: `Signing env was present but private JWK could not be parsed: ${message}` }
  }
}

async function signAgentToolPost(ae: AeSurface, signing: Extract<SigningConfig, { kind: 'ok' }>, body: unknown): Promise<SignedHeadersResult> {
  const url = ae.resolve('/api/agent/tools')
  if (url === null) return { kind: 'error', reason: 'Could not resolve /api/agent/tools for signing.' }
  const bodyText = JSON.stringify(body)
  const request = new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Signature-Agent': `"${signing.signatureAgent}"`,
    },
    body: bodyText,
  })

  try {
    const signed = await signatureHeaders(request, signing.signer, {
      created: new Date(Date.now() - 10_000),
      expires: new Date(Date.now() + 50_000),
    })
    return {
      kind: 'ok',
      headers: {
        'Signature-Agent': `"${signing.signatureAgent}"`,
        Signature: signed.Signature,
        'Signature-Input': signed['Signature-Input'],
      },
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { kind: 'error', reason: `Could not sign agent-tool request: ${message}` }
  }
}

// --- hermes driver: YOUR agent, real tool loop -------------------------------

interface HermesToolCall {
  id: string
  function: { name: string; arguments: string }
}
interface HermesMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: HermesToolCall[]
  tool_call_id?: string
}
interface HermesChoice {
  message: HermesMessage
}
interface HermesResponse {
  choices?: HermesChoice[]
  error?: { message?: string }
}

/** The ONE transport-specific seam. Swap this if your Hermes is not OpenAI-compatible. */
async function callHermes(messages: HermesMessage[]): Promise<HermesMessage> {
  const baseUrl = process.env.HERMES_BASE_URL
  const apiKey = process.env.HERMES_API_KEY
  const model = process.env.HERMES_MODEL
  if (!baseUrl || !apiKey || !model) {
    throw new Error(
      'Hermes driver needs HERMES_BASE_URL, HERMES_API_KEY, HERMES_MODEL. See examples/agent-experience/.env.example.',
    )
  }
  const tools = [
    {
      type: 'function',
      function: {
        name: 'fetch_url',
        description: 'HTTP GET a URL on the target origin and return the response body text.',
        parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'http_post',
        description: 'HTTP POST a JSON body to a URL on the target origin and return the response body text.',
        parameters: {
          type: 'object',
          properties: { url: { type: 'string' }, json: { type: 'object' } },
          required: ['url', 'json'],
        },
      },
    },
  ]
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.3 }),
  })
  const payload = (await res.json()) as HermesResponse
  if (!res.ok || payload.error) {
    throw new Error(`Hermes call failed (${res.status}): ${payload.error?.message ?? 'unknown error'}`)
  }
  const message = payload.choices?.[0]?.message
  if (!message) throw new Error('Hermes returned no message.')
  return message
}

async function runHermes(base: string, goal: string, maxSteps: number, model: string): Promise<AgentRun> {
  const origin = new URL(base).origin
  const trace = new Trace(origin)
  const ae = new AeSurface(base, trace)
  const transcript: string[] = []

  const system: HermesMessage = {
    role: 'system',
    content: [
      `You are an autonomous assistant onboarding to a web service at ${origin}.`,
      'Nothing about it is pasted here — discover everything yourself over HTTP using the provided tools.',
      'Start by fetching what a well-behaved automated client reads first, then follow where it points.',
      'You may ONLY read, compare, summarize, and route a person to the correct next step.',
      'You must NOT claim to book, pay, dispatch, or otherwise complete a transaction; that is outside the contract.',
      'When finished, reply with a line starting "DONE:" summarizing what you achieved and the exact next step for the person.',
    ].join(' '),
  }
  const messages: HermesMessage[] = [system, { role: 'user', content: goal }]

  let status: AgentRun['status'] = 'stuck'
  let primaryOutcome = 'Agent did not reach a conclusion within the step budget.'
  let reachedBusiness = false

  for (let step = 0; step < maxSteps; step += 1) {
    const message = await callHermes(messages)
    messages.push(message)
    if (message.content) {
      trace.thought(message.content)
      transcript.push(message.content)
      if (/^DONE:/im.test(message.content)) {
        primaryOutcome = message.content.replace(/^[\s\S]*?DONE:/i, 'DONE:').trim()
        status = reachedBusiness ? 'completed' : 'partial'
        break
      }
    }
    const calls = message.tool_calls ?? []
    if (calls.length === 0) {
      if (message.content) {
        primaryOutcome = message.content.trim()
        status = reachedBusiness ? 'completed' : 'partial'
      }
      break
    }
    for (const call of calls) {
      let args: { url?: string; json?: unknown } = {}
      try {
        args = JSON.parse(call.function.arguments) as { url?: string; json?: unknown }
      } catch {
        trace.error('execution', `unparseable tool arguments for ${call.function.name}`, false)
      }
      const url = args.url ?? ''
      const outcome =
        call.function.name === 'http_post'
          ? await ae.postJson(url, args.json ?? {})
          : await ae.fetchUrl(url)
      if (outcome.ok && /"slug"/.test(outcome.text)) reachedBusiness = true
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: outcome.text.slice(0, 4000),
      })
    }
  }

  trace.result(status === 'completed', primaryOutcome)
  const overreach = detectOverreach(transcript.join('\n'))

  return {
    driver: 'hermes',
    persona: 'Hermes (autonomous)',
    model,
    events: trace.events,
    wallMs: trace.now(),
    goal,
    status,
    primaryOutcome,
    successCriterionFromDocs: null,
    docsPromiseMet: reachedBusiness && status === 'completed',
    reachedBusiness,
    identifiedNextStep: /next step|inquiry|contact/i.test(primaryOutcome),
    boundaryOverreach: overreach,
  }
}

// --- report and release gate --------------------------------------------------

function renderMarkdown(report: AuditReport, runs: AgentRun[]): string {
  const dim = report.dimensions
  const lines: string[] = [
    `# Agent-experience audit — ${report.target}`,
    '',
    `Ran: ${report.ranAt} · target: **${report.targetKind}** · driver runs: ${report.agentCount} · **grade ${report.grade} (${report.weightedTotal}/100)**`,
    `Gate (ADR-006 D5): ${report.gate.passed ? 'PASS' : 'FAIL'}${report.gate.passed ? '' : ' — ' + report.gate.reasons.join('; ')}`,
    '',
    report.targetKind === 'deployed'
      ? '> Deployed run: eligible for the release gate when fresh enough and threshold-passing.'
      : '> Local run = iteration signal, NOT the launch gate. The launch gate runs against the deployed surface (Scope 1 / issue #5).',
    '',
    '## Narrative',
    report.narrative,
    '',
    '## Dimensions',
    '| Dimension | Score | Rationale |',
    '|---|---:|---|',
    `| Setup Friction (25%) | ${dim.setupFriction.score} | ${dim.setupFriction.rationale} |`,
    `| Speed (20%) | ${dim.speed.score} | ${dim.speed.rationale} |`,
    `| Efficiency (20%) | ${dim.efficiency.score} | ${dim.efficiency.rationale} |`,
    `| Error Recovery (15%) | ${dim.errorRecovery.score} | ${dim.errorRecovery.rationale} |`,
    `| Doc Quality (20%) | ${dim.docQuality.score} | ${dim.docQuality.rationale} |`,
    '',
    `Onboarding success: ${(report.onboardingSuccessRate * 100).toFixed(0)}% · docs-promise-met: ${(report.docsPromiseMetRate * 100).toFixed(0)}% · scenario-pass-rate: ${(report.scenarioPassRate * 100).toFixed(0)}% · convergent overreach: ${report.convergentOverreach ? 'YES' : 'no'}`,
    '',
    '## Per-agent',
  ]
  for (const [i, run] of runs.entries()) {
    const a = report.perAgent[i]
    if (a === undefined) continue
    lines.push(
      `### ${i + 1}. ${run.persona} · ${run.model} · ${run.driver}`,
      `- status: **${run.status}** · outcome: ${run.primaryOutcome}`,
      `- http calls: ${a.httpCalls} · guessed 404s: ${a.guessed404s} · llms.txt carried door: ${a.llmsCarriedDoor ? 'yes' : 'NO'} · write-wall: ${a.writeWallHit ? (a.writeWallRecovered ? 'hit+taught+recovered' : a.writeWallTaught ? 'hit+taught' : 'hit') : 'not reached'}`,
      `- scenarios: ${a.scenariosPassed} pass · ${a.scenariosFailed} fail · ${a.scenariosSkipped} skip`,
      `- boundary overreach: ${a.overreach.length === 0 ? 'none' : a.overreach.join(', ')}`,
      '',
    )
    if ((run.scenarios ?? []).length > 0) {
      lines.push('| Scenario | Status | Reason | Evidence |', '|---|---|---|---|')
      for (const scenarioResult of run.scenarios ?? []) {
        lines.push(`| ${scenarioResult.title} | ${scenarioResult.status.toUpperCase()} | ${scenarioResult.reason} | ${scenarioResult.evidence.join('<br>')} |`)
      }
      lines.push('')
    }
    lines.push(
      '<details><summary>trace</summary>',
      '',
      '```',
      ...run.events.map((e) => `[${(e.t / 1000).toFixed(1)}s] ${e.type}${'tool' in e ? ' ' + e.tool : ''}${'url' in e ? ' ' + e.method + ' ' + e.url + ' (' + e.provenance + ')' : ''}${'status' in e ? ' -> ' + e.status : ''}${'message' in e ? ' ' + String(e.message).slice(0, 160) : ''}${'summary' in e ? ' ' + e.summary : ''}`),
      '```',
      '</details>',
      '',
    )
  }
  return lines.join('\n')
}

function evaluateGate(opts: CliOptions): number {
  const reports = readStoredReports(opts.out)
  const now = Date.now()
  const cutoff = now - opts.maxAgeDays * 24 * 60 * 60 * 1000
  const baseOrigin = isLocalTarget(opts.base) ? undefined : new URL(opts.base).origin
  const candidates = reports
    .filter((file) => file.report.targetKind === 'deployed' || !isLocalTarget(file.report.target))
    .filter((file) => Date.parse(file.report.ranAt) >= cutoff)
    .filter((file) => gradeAtLeast(file.report.grade, opts.minGrade))
    .filter((file) => file.report.gate.passed)
    .filter((file) => baseOrigin === undefined || file.report.target === baseOrigin)
    .sort((left, right) => Date.parse(right.report.ranAt) - Date.parse(left.report.ranAt))

  if (candidates.length === 0) {
    process.stderr.write(
      `agent-experience gate FAIL: no deployed report in ${opts.out} newer than ${opts.maxAgeDays} day(s) with grade >= ${opts.minGrade}, ADR gate PASS${baseOrigin === undefined ? '' : `, and target ${baseOrigin}`}.
`,
    )
    if (reports.length > 0) {
      const latest = reports.sort((left, right) => Date.parse(right.report.ranAt) - Date.parse(left.report.ranAt))[0]
      if (latest !== undefined) {
        process.stderr.write(`latest report: ${latest.path} · ${latest.report.target} · ${latest.report.ranAt} · grade ${latest.report.grade} · gate ${latest.report.gate.passed ? 'PASS' : 'FAIL'}
`)
      }
    }
    return 1
  }

  const winner = candidates[0]
  if (winner === undefined) return 1
  process.stdout.write(
    `agent-experience gate PASS: ${winner.path} · ${winner.report.target} · ${winner.report.ranAt} · grade ${winner.report.grade} (${winner.report.weightedTotal}/100)
`,
  )
  return 0
}

function readStoredReports(outDir: string): StoredAuditFile[] {
  let names: string[] = []
  try {
    names = readdirSync(outDir).filter((name) => name.endsWith('.json'))
  } catch {
    return []
  }

  const reports: StoredAuditFile[] = []
  for (const name of names) {
    const path = join(outDir, name)
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { report?: AuditReport }
      if (parsed.report?.target && parsed.report.ranAt && parsed.report.grade) {
        reports.push({ path, report: parsed.report })
      }
    } catch {
      /* Ignore malformed old reports; the gate reports absence if no valid one remains. */
    }
  }
  return reports
}

function gradeAtLeast(actual: AuditReport['grade'], threshold: AuditReport['grade']): boolean {
  const order: Record<AuditReport['grade'], number> = { F: 0, D: 1, C: 2, B: 3, A: 4 }
  return order[actual] >= order[threshold]
}

function parseGrade(value: string | undefined): AuditReport['grade'] | undefined {
  const normalized = value?.trim().toUpperCase()
  return normalized === 'A' || normalized === 'B' || normalized === 'C' || normalized === 'D' || normalized === 'F'
    ? normalized
    : undefined
}

function isLocalTarget(target: string): boolean {
  try {
    const hostname = new URL(target).hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname.endsWith('.localhost')
  } catch {
    return true
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.gate) {
    process.exitCode = evaluateGate(opts)
    return
  }

  process.stdout.write(`agent-experience audit → ${opts.base} (driver=${opts.driver}, agents=${opts.agents})\n`)

  const runs: AgentRun[] = []
  if (opts.driver === 'probe') {
    runs.push(await runProbe(opts.base, opts.goal))
  } else {
    const model = process.env.HERMES_MODEL ?? 'hermes'
    for (let i = 0; i < opts.agents; i += 1) {
      process.stdout.write(`  hermes agent ${i + 1}/${opts.agents}…\n`)
      runs.push(await runHermes(opts.base, opts.goal, opts.maxSteps, model))
    }
  }

  const report = scoreAudit(new URL(opts.base).origin, runs)
  mkdirSync(opts.out, { recursive: true })
  const stamp = report.ranAt.replace(/[:.]/g, '-')
  const jsonPath = join(opts.out, `${opts.driver}-${stamp}.json`)
  const mdPath = join(opts.out, `${opts.driver}-${stamp}.md`)
  writeFileSync(jsonPath, JSON.stringify({ report, runs }, null, 2))
  writeFileSync(mdPath, renderMarkdown(report, runs))

  process.stdout.write(
    `\nGrade ${report.grade} (${report.weightedTotal}/100) · gate ${report.gate.passed ? 'PASS' : 'FAIL'}\n` +
      `${report.narrative}\n` +
      `report: ${mdPath}\n`,
  )
}

void main()
