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
    'options_ready', 'unsupported', 'needs_attention',
  ]),
  summary: z.string(),
  nextAction: z.enum([
    'provide_information', 'prepare_options', 'wait',
    'inspect_options', 'revise_request', 'retry',
  ]),
  missingFields: z.array(z.object({ field: z.string(), label: z.string(), explanation: z.string() })),
  options: z.array(z.record(z.string(), z.unknown())),
}).strict()

type RequestView = z.infer<typeof requestViewSchema>

type SmokeConfig = Readonly<{
  baseUrl: string
  apiKey: string | undefined
  facts: Readonly<Record<string, string | number | boolean>>
  fetch: typeof globalThis.fetch
  preflightOnly: boolean
  requestText: string
}>

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

  if (view.state === 'needs_information') {
    const missingNames = view.missingFields.map((field) => field.field)
    const supplied = Object.fromEntries(missingNames.flatMap((name) => name in config.facts ? [[name, config.facts[name]]] : []))
    if (Object.keys(supplied).length !== missingNames.length) {
      throw new Error(`Request needs facts. Set AE_CUSTOMER_REQUEST_FACTS_JSON with: ${missingNames.join(', ')}`)
    }
    view = await authenticatedRequest(config, `/api/v1/requests/${encodeURIComponent(requestRef)}/facts`, {
      method: 'POST', body: { idempotencyKey: `acceptance:facts:${nonce}`, expectedRevision: view.revision, facts: supplied },
    })
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
  for (const marker of ['/api/v1/requests', REQUIRED_SCOPE, 'options_ready']) {
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

async function main(): Promise<void> {
  await runCustomerRequestProductionSmoke({
    baseUrl: (process.env.AE_CUSTOMER_REQUEST_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/u, ''),
    apiKey: process.env.AE_CUSTOMER_REQUEST_API_KEY,
    facts: parseFacts(process.env.AE_CUSTOMER_REQUEST_FACTS_JSON),
    fetch: globalThis.fetch,
    preflightOnly: process.argv.includes('--preflight'),
    requestText: process.env.AE_CUSTOMER_REQUEST_TEXT ?? 'Compare the registered sandbox options for a reference request.',
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? `FAIL ${error.message}` : 'FAIL unexpected_error')
    process.exitCode = 1
  })
}
