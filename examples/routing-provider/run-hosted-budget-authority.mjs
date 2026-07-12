import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { signatureHeaders } from 'http-message-sig'
import { signerFromJWK } from 'web-bot-auth/crypto'

const base = process.env.AE_ROUTING_BASE_URL ?? 'https://loyal-peacock-107.convex.site'
const signatureAgent = process.env.AE_ROUTING_SIGNATURE_AGENT
const privateKeyPath = process.env.AE_ROUTING_PRIVATE_JWK_PATH
if (signatureAgent === undefined || privateKeyPath === undefined) throw new Error('signed tracer configuration required')
const privateJwk = JSON.parse(await readFile(privateKeyPath, 'utf8'))
const signer = await signerFromJWK(privateJwk)

const failed = await executeHttp('failure')
assertRun(failed, 'failed', 'not_committed')
const committed = await executeHttp('success')
assertRun(committed, 'completed', 'committed')
const unknown = await executeMcp('unknown')
assertRun(unknown, 'outcome_unknown', 'unknown')
const refusedHttp = await executeHttp('success')
const refusedMcp = await executeMcp('success')
for (const refusal of [refusedHttp, refusedMcp]) {
  if (refusal.kind !== 'execution_refused' || refusal.reason !== 'budget_capacity_exceeded') throw new Error('cumulative_budget_not_enforced')
}

process.stdout.write(`${JSON.stringify({
  failureReleasedRootRunId: failed.run.rootRunId,
  committedRootRunId: committed.run.rootRunId,
  uncertaintyHeldRootRunId: unknown.run.rootRunId,
  refusedHttp,
  refusedMcp,
}, null, 2)}\n`)

async function executeHttp(scenario) {
  const quote = (await post('/v1/route', routeInput())).result.quote
  return (await post('/v1/execute', executeInput(quote, scenario, `budget-http:${randomUUID()}`))).result
}

async function executeMcp(scenario) {
  const routed = await rpc('ae.route', routeInput())
  const quote = routed.result.structuredContent.quote
  const executed = await rpc('ae.execute', executeInput(quote, scenario, `budget-mcp:${randomUUID()}`))
  return executed.result.structuredContent
}

function routeInput() {
  return { protocolVersion: 'ae-routing:v1', networkId: 'registered-businesses', query: 'book a shipping label', constraints: { currency: 'AUD', maximumSpendMinor: 250 } }
}

function executeInput(quote, scenario, idempotencyKey) {
  return {
    protocolVersion: 'ae-routing:v1', quoteId: quote.quoteId, quoteDigest: quote.quoteDigest,
    approval: { maximumSpendMinor: 250, currency: 'AUD', expiresAt: Date.now() + 30_000, allowedDataFields: ['scenario', 'primary_context', 'fallback_context'] },
    idempotencyKey, data: { scenario, primary_context: 'primary-only', fallback_context: 'fallback-only' },
  }
}

function assertRun(result, state, effectState) {
  if (result.kind !== 'run_admitted' || result.run.state !== state || result.run.effectState !== effectState) throw new Error(`unexpected_${state}_posture`)
  const admission = result.run.records.find((record) => record.type === 'root_run_admitted')
  if (!admission?.budgetAuthorityRef?.startsWith('budget-authority:sha256:')
    || admission.budgetMaximumGrossMinor !== 500 || admission.spendReservationMinor !== 250 || admission.budgetCurrency !== 'AUD') {
    throw new Error('budget_binding_not_inspectable')
  }
}

async function post(path, value) { return await signedFetch(path, value, {}) }
async function rpc(name, args) { return await signedFetch('/mcp', { jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name, arguments: args } }, { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' }) }

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
