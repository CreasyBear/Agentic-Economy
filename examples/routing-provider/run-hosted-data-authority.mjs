import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { signatureHeaders } from 'http-message-sig'
import { signerFromJWK } from 'web-bot-auth/crypto'

const base = process.env.AE_ROUTING_BASE_URL ?? 'https://loyal-peacock-107.convex.site'
const signatureAgent = required('AE_ROUTING_SIGNATURE_AGENT')
const privateJwk = JSON.parse(await readFile(required('AE_ROUTING_PRIVATE_JWK_PATH'), 'utf8'))
const signer = await signerFromJWK(privateJwk)

const fallback = await executeHttp('fallback_success', ['scenario', 'primary_context', 'fallback_context'], {
  scenario: 'fallback_success', primary_context: 'primary-only', fallback_context: 'fallback-only',
})
assertRun(fallback, 2)

const primary = await executeMcp('success', ['primary_context'], { primary_context: 'primary-only' })
assertRun(primary, 1)

const refusedHttp = await executeHttp('success', ['primary_context'], { primary_context: 'primary-only' })
const refusedMcp = await executeMcp('success', ['primary_context'], { primary_context: 'primary-only' })
for (const refusal of [refusedHttp, refusedMcp]) {
  if (refusal.kind !== 'execution_refused' || refusal.reason !== 'data_authority_capacity_exceeded') {
    throw new Error(`cumulative_data_authority_not_enforced:${JSON.stringify(refusal)}`)
  }
}

process.stdout.write(`${JSON.stringify({
  fallbackRootRunId: fallback.run.rootRunId,
  primaryRootRunId: primary.run.rootRunId,
  fallbackDisclosureGrants: disclosureRecords(fallback.run),
  primaryDisclosureGrants: disclosureRecords(primary.run),
  refusedHttp,
  refusedMcp,
}, null, 2)}\n`)

async function executeHttp(scenario, allowedDataFields, data) {
  const quote = (await post('/v1/route', routeInput())).result.quote
  return (await post('/v1/execute', executeInput(quote, scenario, allowedDataFields, data, `data-http:${scenario}:${randomUUID()}`))).result
}

async function executeMcp(scenario, allowedDataFields, data) {
  const routed = await rpc('ae.route', routeInput())
  const quote = routed.result.structuredContent.quote
  const executed = await rpc('ae.execute', executeInput(quote, scenario, allowedDataFields, data, `data-mcp:${scenario}:${randomUUID()}`))
  return executed.result.structuredContent
}

function routeInput() {
  return { protocolVersion: 'ae-routing:v1', networkId: 'registered-businesses', query: 'book a shipping label', constraints: { currency: 'AUD', maximumSpendMinor: 250 } }
}

function executeInput(quote, _scenario, allowedDataFields, data, idempotencyKey) {
  return {
    protocolVersion: 'ae-routing:v1', quoteId: quote.quoteId, quoteDigest: quote.quoteDigest,
    approval: { maximumSpendMinor: 250, currency: 'AUD', expiresAt: Date.now() + 30_000, allowedDataFields },
    idempotencyKey, data,
  }
}

function assertRun(result, expectedDisclosures) {
  if (result.kind !== 'run_admitted' || result.run.state !== 'completed') throw new Error(`run_not_completed:${JSON.stringify(result)}`)
  const disclosures = disclosureRecords(result.run)
  if (disclosures.length !== expectedDisclosures) throw new Error(`disclosure_count_incorrect:${JSON.stringify(disclosures)}`)
  for (const record of disclosures) {
    if (record.enforcementPoint !== 'data_release' || record.purpose !== 'shipping.label.book:v1'
      || !record.dataAuthorizationBudgetRef?.startsWith('data-budget:sha256:')
      || !record.disclosureGrantDigest?.startsWith('sha256:') || record.fields.length === 0) {
      throw new Error(`disclosure_grant_not_inspectable:${JSON.stringify(record)}`)
    }
    const serialized = JSON.stringify(record)
    if (serialized.includes('primary-only') || serialized.includes('fallback-only')) throw new Error('protected_value_leaked_to_protocol_record')
  }
}

function disclosureRecords(run) {
  return run.records.filter((record) => record.type === 'disclosure_grant_consumed').map((record) => ({
    dataAuthorizationBudgetRef: record.dataAuthorizationBudgetRef,
    disclosureGrantId: record.disclosureGrantId,
    disclosureGrantDigest: record.disclosureGrantDigest,
    recipientBindingId: record.disclosureRecipientBindingId,
    purpose: record.disclosurePurpose,
    fields: record.disclosedDataFields,
    enforcementPoint: record.enforcementPoint,
    disposition: record.disclosureDisposition,
  }))
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

function required(name) {
  const value = process.env[name]
  if (value === undefined || value.length === 0) throw new Error(`${name}_required`)
  return value
}
