import { randomUUID } from 'node:crypto'
import { z } from 'zod'

const DEFAULT_BASE_URL = 'https://agentic-economy-phi.vercel.app'
const REQUIRED_SCOPE = 'customer_requests:create'

const requestViewSchema = z.object({
  kind: z.literal('request'),
  requestRef: z.string().min(1),
  revision: z.number().int().positive(),
  state: z.enum([
    'needs_information', 'ready_to_compare', 'preparing_options',
    'options_ready', 'no_options', 'needs_authorization', 'unsupported', 'needs_attention',
  ]),
  summary: z.string(),
  nextAction: z.enum([
    'provide_information', 'prepare_options', 'wait',
    'inspect_options', 'revise_request', 'review_disclosure', 'retry',
  ]),
  missingFields: z.array(z.object({ field: z.string(), label: z.string(), explanation: z.string() })),
  criteria: z.array(z.object({
    label: z.string(), value: z.union([z.string(), z.number(), z.boolean()]),
    basis: z.enum(['customer_provided', 'extracted_from_request']),
  })).optional(),
  disclosureReview: z.object({
    purpose: z.string(), maximumRecipients: z.number().int().positive(),
    categories: z.array(z.object({
      label: z.string(), classification: z.enum(['personal', 'sensitive', 'credential']),
    })),
  }).optional(),
  clarification: z.union([
    z.object({ kind: z.literal('intent_direction'), prompt: z.string(), answerKind: z.literal('natural_language') }),
    z.object({
      kind: z.literal('contract_fact'), field: z.string(), prompt: z.string(), answerKind: z.literal('typed_value'),
    }),
  ]).optional(),
  options: z.array(z.record(z.string(), z.unknown())),
  optionSet: z.object({
    cardinality: z.enum(['none', 'single', 'multiple']), optionCount: z.number().int().nonnegative(),
    ordering: z.union([
      z.object({ kind: z.literal('not_applicable'), commercialInfluence: z.enum(['none', 'disclosed', 'unknown']) }),
      z.object({ kind: z.literal('unranked'), commercialInfluence: z.enum(['none', 'disclosed', 'unknown']) }),
      z.object({
        kind: z.literal('recommended'), commercialInfluence: z.enum(['none', 'disclosed']),
        objective: z.literal('lowest_maximum_price'), optionRef: z.string(), evidenceRef: z.string(),
        reasons: z.array(z.string()), tradeoffs: z.array(z.string()),
      }),
    ]),
    coverage: z.object({
      evaluated: z.number().int().nonnegative(), optionsReceived: z.number().int().nonnegative(),
      unavailable: z.number().int().nonnegative(), pending: z.number().int().nonnegative(), uncertain: z.number().int().nonnegative(),
      businesses: z.array(z.object({
        name: z.string(), status: z.enum(['not_contacted', 'contact_pending', 'contacted', 'option_received', 'unavailable', 'uncertain']),
        explanation: z.string(),
      })),
    }),
    options: z.array(z.record(z.string(), z.unknown())),
  }).optional(),
}).strict()

type RequestView = z.infer<typeof requestViewSchema>

type SmokeConfig = Readonly<{
  baseUrl: string
  apiKey: string | undefined
  facts: Readonly<Record<string, string | number | boolean>>
  fetch: typeof globalThis.fetch
  messages: readonly string[]
  preflightOnly: boolean
  requestText: string
}>

export function customerRequestProductionSmokeConfigFromEnvironment(
  env: NodeJS.ProcessEnv,
  apiKey = env.AE_CUSTOMER_REQUEST_API_KEY,
): SmokeConfig {
  return {
    baseUrl: (env.AE_CUSTOMER_REQUEST_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/u, ''),
    apiKey,
    facts: parseFacts(env.AE_CUSTOMER_REQUEST_FACTS_JSON),
    fetch: globalThis.fetch,
    messages: parseMessages(env.AE_CUSTOMER_REQUEST_MESSAGES_JSON),
    preflightOnly: false,
    requestText: env.AE_CUSTOMER_REQUEST_TEXT ?? 'Compare the registered sandbox options for a reference request.',
  }
}

export async function runCustomerRequestProductionSmoke(config: SmokeConfig): Promise<void> {
  await proveDiscovery(config)
  await proveAnonymousRefusal(config)
  if (config.preflightOnly) {
    console.log('PASS production preflight: discovery and anonymous refusal')
    return
  }
  if (config.apiKey === undefined || config.apiKey.trim().length === 0) {
    throw new Error(`AE_CUSTOMER_REQUEST_API_KEY is required and must carry ${REQUIRED_SCOPE}`)
  }

  const nonce = randomUUID()
  const requestRef = `acceptance:${nonce}`
  const submitBody = {
    idempotencyKey: `acceptance:submit:${nonce}`,
    requestRef,
    agentRef: 'external-agent:production-acceptance',
    request: config.requestText,
  } as const

  let view = await authenticatedRequest(config, '/api/v1/requests', { method: 'POST', body: submitBody })
  const replay = await authenticatedRequest(config, '/api/v1/requests', { method: 'POST', body: submitBody })
  assertSameProjection(view, replay, 'idempotent submit replay')

  let messageIndex = 0
  for (let clarificationIndex = 0; view.state === 'needs_information' && clarificationIndex < 10; clarificationIndex += 1) {
    const clarification = view.clarification
    if (clarification?.answerKind === 'natural_language') {
      const message = config.messages[messageIndex]
      if (message === undefined) {
        throw new Error(`Request needs a conversational answer. Set AE_CUSTOMER_REQUEST_MESSAGES_JSON for: ${clarification.prompt}`)
      }
      view = await authenticatedRequest(config, `/api/v1/requests/${encodeURIComponent(requestRef)}/messages`, {
        method: 'POST', body: {
          idempotencyKey: `acceptance:message:${nonce}:${clarificationIndex}`,
          expectedRevision: view.revision,
          message,
        },
      })
      messageIndex += 1
      continue
    }
    const missingNames = view.missingFields.map((field) => field.field)
    const supplied = Object.fromEntries(missingNames.flatMap((name) => name in config.facts ? [[name, config.facts[name]]] : []))
    if (missingNames.length === 0 || Object.keys(supplied).length !== missingNames.length) {
      throw new Error(`Request needs facts. Set AE_CUSTOMER_REQUEST_FACTS_JSON with: ${missingNames.join(', ')}`)
    }
    view = await authenticatedRequest(config, `/api/v1/requests/${encodeURIComponent(requestRef)}/facts`, {
      method: 'POST', body: {
        idempotencyKey: `acceptance:facts:${nonce}:${clarificationIndex}`,
        expectedRevision: view.revision,
        facts: supplied,
      },
    })
  }

  if (view.state === 'needs_information') throw new Error('Request exceeded the clarification limit')
  if (view.state === 'needs_authorization') {
    console.log(JSON.stringify({
      result: 'CUSTOMER_AUTHORIZATION_REQUIRED', requestRef, state: view.state,
      revision: view.revision, disclosureReview: view.disclosureReview,
    }))
    return
  }
  if (view.state === 'unsupported') throw new Error(`Registered capability did not support acceptance request: ${view.summary}`)
  if (view.state === 'needs_attention') throw new Error(`Request needs operator attention before comparison: ${view.summary}`)
  if (view.state !== 'ready_to_compare') throw new Error(`Expected ready_to_compare, received ${view.state}`)

  view = await authenticatedRequest(config, `/api/v1/requests/${encodeURIComponent(requestRef)}/options`, {
    method: 'POST', body: { revision: view.revision }, acceptedStatuses: [200, 202],
  })
  for (let attempt = 0; view.state === 'preparing_options' && attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    view = await authenticatedRequest(config, `/api/v1/requests/${encodeURIComponent(requestRef)}`, { method: 'GET' })
  }
  if (view.state !== 'options_ready') throw new Error(`Expected options_ready after preparation, received ${view.state}`)
  if (view.options.length < 2) throw new Error(`Expected at least two registered options, received ${view.options.length}`)

  const durableRevision = view.revision
  // Resume is deliberately stateless: only the opaque reference and credential cross this boundary.
  const resumed = await authenticatedRequest(config, `/api/v1/requests/${encodeURIComponent(requestRef)}`, { method: 'GET' })
  if (resumed.state !== 'options_ready' || resumed.revision !== durableRevision || resumed.options.length < 2) {
    throw new Error('Cold resume did not recover the durable options projection from requestRef alone')
  }

  console.log(JSON.stringify({
    result: 'PASS', requestRef, state: resumed.state, revision: resumed.revision,
    optionCount: resumed.options.length, commitmentCreated: false,
  }))
}

async function proveDiscovery(config: SmokeConfig): Promise<void> {
  const [llms, skill] = await Promise.all([
    config.fetch(`${config.baseUrl}/llms.txt?acceptance=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } }),
    config.fetch(`${config.baseUrl}/SKILL.md?acceptance=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } }),
  ])
  if (!llms.ok || !skill.ok) throw new Error(`Discovery unavailable: llms=${llms.status}, skill=${skill.status}`)
  const discovery = `${await llms.text()}\n${await skill.text()}`
  for (const marker of ['/api/v1/requests', '/messages', REQUIRED_SCOPE, 'needs_authorization', 'options_ready']) {
    if (!discovery.includes(marker)) throw new Error(`Production discovery missing ${marker}`)
  }
}

async function proveAnonymousRefusal(config: SmokeConfig): Promise<void> {
  const response = await config.fetch(`${config.baseUrl}/api/v1/requests`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })
  const body: unknown = await response.json()
  const refusal = z.object({ kind: z.literal('refused'), reason: z.literal('authentication_required') }).safeParse(body)
  if (response.status !== 401 || !refusal.success) throw new Error(`Anonymous boundary failed with HTTP ${response.status}`)
}

async function authenticatedRequest(
  config: SmokeConfig,
  path: string,
  input: Readonly<{ method: 'GET' | 'POST'; body?: unknown; acceptedStatuses?: readonly number[] }>,
): Promise<RequestView> {
  const response = await config.fetch(`${config.baseUrl}${path}`, {
    method: input.method,
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })
  const body: unknown = await response.json()
  const acceptedStatuses = input.acceptedStatuses ?? [200]
  if (!acceptedStatuses.includes(response.status)) {
    const safeReason = z.object({ reason: z.string().optional(), error: z.string().optional() }).safeParse(body)
    throw new Error(`${input.method} ${path} returned HTTP ${response.status}: ${safeReason.success ? safeReason.data.reason ?? safeReason.data.error ?? 'unexpected_response' : 'unexpected_response'}`)
  }
  const parsed = requestViewSchema.safeParse(body)
  if (!parsed.success) throw new Error(`${input.method} ${path} returned an invalid CustomerRequestView`)
  return parsed.data
}

function assertSameProjection(first: RequestView, second: RequestView, label: string): void {
  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error(`${label} changed the public projection`)
}

function parseFacts(value: string | undefined): Readonly<Record<string, string | number | boolean>> {
  if (value === undefined || value.trim().length === 0) return {}
  const parsed = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).safeParse(JSON.parse(value))
  if (!parsed.success) throw new Error('AE_CUSTOMER_REQUEST_FACTS_JSON must be a JSON object of string, number, or boolean facts')
  return parsed.data
}

function parseMessages(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim().length === 0) return []
  const parsed = z.array(z.string().trim().min(1)).safeParse(JSON.parse(value))
  if (!parsed.success) throw new Error('AE_CUSTOMER_REQUEST_MESSAGES_JSON must be a JSON array of non-empty conversational answers')
  return parsed.data
}

async function main(): Promise<void> {
  await runCustomerRequestProductionSmoke({
    ...customerRequestProductionSmokeConfigFromEnvironment(process.env),
    preflightOnly: process.argv.includes('--preflight'),
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? `FAIL ${error.message}` : 'FAIL unexpected_error')
    process.exitCode = 1
  })
}
