import { createHash } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { signatureHeaders } from 'http-message-sig'
import { signerFromJWK } from 'web-bot-auth/crypto'

const base = process.env.AE_ROUTING_BASE_URL ?? 'https://loyal-peacock-107.convex.site'
const signatureAgent = required('AE_ROUTING_SIGNATURE_AGENT')
const privateJwk = JSON.parse(await readFile(required('AE_ROUTING_PRIVATE_JWK_PATH'), 'utf8'))
const signer = await signerFromJWK(privateJwk)

const httpCost = (await post('/v1/route', routeInput('cost'))).result
const httpLatency = (await post('/v1/route', routeInput('latency'))).result
const mcpCost = (await rpc('ae.route', routeInput('cost'))).result.structuredContent
const mcpLatency = (await rpc('ae.route', routeInput('latency'))).result.structuredContent

for (const result of [httpCost, mcpCost]) assertDecision(result, 'cost', 'binding:shipping-label-conformance:v1')
for (const result of [httpLatency, mcpLatency]) assertDecision(result, 'latency', 'binding:shipping-label-conformance:zz-fallback:v1')
if (httpCost.quote.quoteDigest === httpLatency.quote.quoteDigest || mcpCost.quote.quoteDigest === mcpLatency.quote.quoteDigest) {
  throw new Error('material_optimizer_change_not_digest_bound')
}
const fallbackExecution = (await post('/v1/execute', {
  protocolVersion: 'ae-routing:v1', quoteId: httpCost.quote.quoteId, quoteDigest: httpCost.quote.quoteDigest,
  approval: { maximumSpendMinor: 250, currency: 'AUD', expiresAt: Date.now() + 30_000, allowedDataFields: ['scenario', 'primary_context', 'fallback_context'] },
  idempotencyKey: `composite-fallback:${randomUUID()}`,
  data: { scenario: 'fallback_success', primary_context: 'primary-only', fallback_context: 'fallback-only' },
})).result
assertCompositeExecution(fallbackExecution)

process.stdout.write(`${JSON.stringify({
  httpCost: summary(httpCost), httpLatency: summary(httpLatency),
  mcpCost: summary(mcpCost), mcpLatency: summary(mcpLatency),
  fallbackExecution: {
    rootRunId: fallbackExecution.run.rootRunId, quotedMaximum: fallbackExecution.run.cost.quotedMaximum,
    leafBindingIds: fallbackExecution.run.leaves.map((leaf) => leaf.bindingId),
    admission: fallbackExecution.run.records.find((record) => record.type === 'root_run_admitted'),
  },
}, null, 2)}\n`)

function routeInput(optimizeFor) {
  return {
    protocolVersion: 'ae-routing:v1', networkId: 'registered-businesses', query: 'book a shipping label',
    constraints: { currency: 'AUD', maximumSpendMinor: 250, optimizeFor },
  }
}

function assertDecision(result, optimizeFor, bindingId) {
  if (result.kind !== 'quoted' || result.quote.selectedGraph.bindingId !== bindingId) throw new Error(`${optimizeFor}_selection_failed`)
  const { routingSnapshot, organicDecision } = result.quote
  if (routingSnapshot.compilerVersion !== 'routing-compiler:v2'
    || routingSnapshot.optimizerVersion !== 'organic-cost-latency-evidence:v2'
    || routingSnapshot.constraints.optimizeFor !== optimizeFor
    || organicDecision.optimizeFor !== optimizeFor
    || organicDecision.selectedBindingId !== bindingId
    || organicDecision.factors.length !== 2
    || organicDecision.factors.some((factor) => factor.feasible !== true)
    || result.quote.selectedGraph.maximumCost.amountMinor !== 250
    || result.quote.selectedGraph.steps.length !== 2) throw new Error(`${optimizeFor}_decision_evidence_invalid`)
}

function assertCompositeExecution(result) {
  const admission = result.run?.records.find((record) => record.type === 'root_run_admitted')
  if (result.kind !== 'run_admitted' || result.run.state !== 'completed' || result.run.leaves.length !== 2
    || result.run.cost.quotedMaximum.amountMinor !== 250 || admission?.spendReservationMinor !== 250
    || admission?.budgetCurrency !== 'AUD') throw new Error(`composite_reservation_not_proven:${JSON.stringify(result)}`)
}

function summary(result) {
  return {
    quoteId: result.quote.quoteId, quoteDigest: result.quote.quoteDigest,
    selectedBindingId: result.quote.selectedGraph.bindingId,
    compilerVersion: result.quote.routingSnapshot.compilerVersion,
    optimizerVersion: result.quote.organicDecision.optimizerVersion,
    optimizeFor: result.quote.organicDecision.optimizeFor,
    maximumCost: result.quote.selectedGraph.maximumCost,
    stepMaximums: result.quote.selectedGraph.steps.map((step) => step.maximumCost),
    factors: result.quote.organicDecision.factors,
  }
}

async function post(path, value) { return await signedFetch(path, value, {}) }
async function rpc(name, args) { return await signedFetch('/mcp', { jsonrpc: '2.0', id: `${name}:${args.constraints.optimizeFor}`, method: 'tools/call', params: { name, arguments: args } }, { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' }) }

async function signedFetch(path, value, extraHeaders) {
  const body = JSON.stringify(value)
  const request = new Request(`${base}${path}`, { method: 'POST', body, headers: {
    'Content-Type': 'application/json', 'Content-Digest': `sha-256=:${createHash('sha256').update(body).digest('base64')}:`,
    'Signature-Agent': `"${signatureAgent}"`, ...extraHeaders,
  } })
  const now = new Date()
  const signed = await signatureHeaders(request, { signer, keyid: privateJwk.kid, components: ['@method', '@authority', '@path', 'content-digest', 'signature-agent'], created: new Date(now.getTime() - 1_000), expires: new Date(now.getTime() + 30_000), tag: 'web-bot-auth' })
  const response = await fetch(request, { headers: { ...Object.fromEntries(request.headers), Signature: signed.Signature, 'Signature-Input': signed['Signature-Input'] } })
  const payload = await response.json()
  if (!response.ok) throw new Error(`${path}:${response.status}:${JSON.stringify(payload)}`)
  return payload
}

function required(name) {
  const value = process.env[name]
  if (value === undefined || value.length === 0) throw new Error(`${name}_required`)
  return value
}
