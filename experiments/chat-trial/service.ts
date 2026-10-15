import { createServer } from 'node:http'
import { json } from 'node:stream/consumers'
import { writeFileSync } from 'node:fs'
import { createMcpHandler, Server } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { FixtureMarket, RESEARCH_REF, AUDIT_REF } from './fixture-market'
import { contractFor } from '../../convex/lib/chat/tools/contracts'
import { createLivePlanner } from './live-planner'

const market = new FixtureMarket()
const live = process.argv.includes('--live') ? createLivePlanner() : undefined
const requestSchema = z.strictObject({ sessionId: z.string().min(1), requestId: z.string().min(1),
  action: z.enum(['registry.tools.search', 'tool.quote', 'tool.call', 'call.status']), input: z.unknown() })
const planSchema = z.strictObject({ query: z.string().max(2000), pending: z.string().default(''),
  sessionId: z.string().min(1), requestId: z.string().min(1) })
const names = { ae_registry_tools_search: 'registry.tools.search', ae_tool_quote: 'tool.quote',
  ae_tool_call: 'tool.call', ae_call_status: 'call.status' } as const

async function plan(value: unknown) {
  const input = planSchema.parse(value)
  if (input.query === '__simulate_model_failure__') throw new Error('trial_model_unavailable')
  if (input.pending && /^(?:deny|cancel|no)$/iu.test(input.query.trim())) {
    const pending = z.object({ sessionId: z.string() }).passthrough().parse(JSON.parse(input.pending))
    if (pending.sessionId !== input.sessionId) throw new Error('trial_account_mismatch')
    return { ...pending, clarification: 'Cancelled. No new purchase was dispatched.' }
  }
  if (input.pending && /^(?:continue|resume|done|approved)$/iu.test(input.query.trim())) {
    const pending = z.object({ sessionId: z.string(), requestId: z.string() }).passthrough().parse(JSON.parse(input.pending))
    if (pending.sessionId !== input.sessionId) throw new Error('trial_account_mismatch')
    return pending
  }
  const audit = /audit/iu.test(input.query)
  const url = input.query.match(/https?:\/\/[^\s]+/u)?.[0]
  const intent = live === undefined ? undefined : await live.plan(input.query)
  if (intent !== undefined) {
    writeFileSync('output/chat-trial/evidence/live-planner.json', JSON.stringify(live?.observations, null, 2))
    const audit = intent.kind === 'audit'
    return { sessionId: input.sessionId, requestId: input.requestId, query: input.query,
      kind: audit ? 'audit' : intent.kind, capability: audit ? 'website audit' : intent.keyword,
      toolRef: audit ? AUDIT_REF : RESEARCH_REF,
      input: audit ? { url: intent.url } : { keyword: intent.keyword },
      clarification: audit && !intent.url ? 'Which page should I audit?' : '' }
  }
  return { sessionId: input.sessionId, requestId: input.requestId, query: input.query,
    kind: audit ? 'audit' : /(?:find|discover).*tool/iu.test(input.query) ? 'discover' : 'research',
    capability: audit ? 'website audit' : 'battery storage research',
    toolRef: audit ? AUDIT_REF : RESEARCH_REF,
    input: audit ? { url: url ?? '' } : { keyword: 'battery storage' },
    clarification: audit && !url ? 'Which page should I audit?' : '',
  }
}

function mcp(sessionId: string, requestId: string) {
  const server = new Server({ name: 'ae-synthetic-trial', version: '1' }, { capabilities: { tools: { listChanged: false } } })
  server.setRequestHandler('tools/list', () => ({ tools: Object.entries(names).map(([name, action]) => ({
    name, description: `Synthetic trial ${action}. Never a production purchase.`,
    inputSchema: z.object({ type: z.literal('object') }).passthrough().parse(action === 'call.status'
      ? { type: 'object', properties: { callRef: { type: 'string' } }, required: ['callRef'] }
      : contractFor(action).schema.toJSONSchema({ unrepresentable: 'any' })),
  })) }))
  server.setRequestHandler('tools/call', async request => {
    const found = Object.entries(names).find(([name]) => name === request.params.name)
    if (!found) throw new Error('trial_tool_not_found')
    const output = market.execute(sessionId, found[1], request.params.arguments, requestId)
    return { content: [{ type: 'text' as const, text: JSON.stringify(output) }], structuredContent: z.record(z.string(), z.unknown()).parse(output) }
  })
  return createMcpHandler(() => server, { legacy: 'stateless', responseMode: 'auto', maxRequestBodySize: 16384 })
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:5142')
    if (url.pathname === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"synthetic":true}'); return
    }
    const body: unknown = request.method === 'POST' ? await json(request) : {}
    if (url.pathname === '/mcp') {
      const session = z.string().parse(request.headers['x-trial-session'])
      const command = z.string().parse(request.headers['x-trial-request'])
      const native = new Request('http://127.0.0.1:5142/mcp', { method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify(body) })
      const result = await mcp(session, command).fetch(native)
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text()); return
    }
    let result: unknown
    if (url.pathname === '/session') result = market.create(body)
    else if (url.pathname === '/resume') {
      const input = z.strictObject({ id: z.string() }).parse(body); market.resume(input.id); result = { resumed: true }
    } else if (url.pathname === '/complete') {
      const input = z.strictObject({ id: z.string() }).parse(body); market.complete(input.id); result = { completed: true }
    } else if (url.pathname === '/inspect') result = market.inspect(z.string().parse(url.searchParams.get('id')))
    else if (url.pathname === '/plan') result = await plan(body)
    else if (url.pathname === '/market') {
      const input = requestSchema.parse(body)
      result = market.execute(input.sessionId, input.action, input.input, input.requestId)
    } else throw new Error('trial_route_not_found')
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(result))
  } catch (error) {
    response.writeHead(error instanceof Error && error.message === 'trial_model_unavailable' ? 503 : 400, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'trial_request_failed' }))
  }
})
server.listen(5142, '127.0.0.1', () => {
  writeFileSync('output/chat-trial/evidence/fixture-service.json', JSON.stringify({
    port: 5142, synthetic: true, productionToolPaymentCredentials: false, ephemeralModelProviderCredential: live !== undefined,
    schemas: 'AE contractFor and Quote/Call schemas',
    planner: live === undefined ? 'scripted fixture planner; natural-language quality is not measured' : 'bounded live intent model; fixture Tool selection and synthesis',
  }, null, 2))
  process.stdout.write('Synthetic trial service listening on 127.0.0.1:5142\n')
})
process.once('SIGTERM', () => server.close())
