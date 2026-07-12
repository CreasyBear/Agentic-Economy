import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { signatureHeaders } from 'http-message-sig'
import { signerFromJWK } from 'web-bot-auth/crypto'

const base = process.env.AE_ROUTING_BASE_URL ?? 'https://loyal-peacock-107.convex.site'
const signatureAgent = required('AE_ROUTING_SIGNATURE_AGENT')
const privateJwk = JSON.parse(await readFile(required('AE_ROUTING_PRIVATE_JWK_PATH'), 'utf8'))
const signer = await signerFromJWK(privateJwk)

const http = await runHttp()
const mcp = await runMcp()

process.stdout.write(`${JSON.stringify({ http, mcp }, null, 2)}\n`)

async function runHttp() {
  const quote = (await post('/v1/route', routeInput('cost'))).result.quote
  const executed = (await post('/v1/execute', executeInput(quote, 'hosted-cancel-http'))).result
  const rootRunId = completedRoot(executed, 'http')
  const request = { protocolVersion: 'ae-routing:v1', rootRunId }
  const cancelled = (await post('/v1/cancel', request)).result
  const replayed = (await post('/v1/cancel', request)).result
  const inspected = (await post('/v1/inspect', request)).result
  return assertCancellation('http', 'accepted', cancelled, replayed, inspected)
}

async function runMcp() {
  const routed = await rpc('ae.route', routeInput('latency'))
  const quote = routed.result.structuredContent.quote
  const executed = await rpc('ae.execute', executeInput(quote, 'hosted-cancel-mcp'))
  const rootRunId = completedRoot(executed.result.structuredContent, 'mcp')
  const request = { protocolVersion: 'ae-routing:v1', rootRunId }
  const cancelled = (await rpc('ae.cancel', request)).result.structuredContent
  const replayed = (await rpc('ae.cancel', request)).result.structuredContent
  const inspected = (await rpc('ae.inspect', request)).result.structuredContent
  return assertCancellation('mcp', 'indeterminate', cancelled, replayed, inspected)
}

function routeInput(optimizeFor) {
  return {
    protocolVersion: 'ae-routing:v1', networkId: 'registered-businesses', query: 'book a shipping label',
    constraints: { currency: 'AUD', maximumSpendMinor: 250, optimizeFor },
  }
}

function executeInput(quote, prefix) {
  return {
    protocolVersion: 'ae-routing:v1', quoteId: quote.quoteId, quoteDigest: quote.quoteDigest,
    approval: {
      maximumSpendMinor: 250, currency: 'AUD', expiresAt: Date.now() + 30_000,
      allowedDataFields: ['scenario', 'primary_context', 'fallback_context'],
    },
    idempotencyKey: `${prefix}:success:${randomUUID()}`,
    data: { scenario: 'success', primary_context: 'primary-only', fallback_context: 'fallback-only' },
  }
}

function completedRoot(result, surface) {
  if (result.kind !== 'run_admitted' || result.run.state !== 'completed' || result.run.effectState !== 'committed') {
    throw new Error(`${surface}:committed_run_required:${JSON.stringify(result)}`)
  }
  return result.run.rootRunId
}

function assertCancellation(surface, expectedDisposition, cancelled, replayed, inspected) {
  if (cancelled.kind !== 'provider_cancellation_recorded' || cancelled.disposition !== expectedDisposition) {
    throw new Error(`${surface}:provider_cancellation_disposition_incorrect:${JSON.stringify(cancelled)}`)
  }
  if (!isDeepStrictEqual(replayed, cancelled)) {
    throw new Error(`${surface}:provider_cancellation_replay_changed`)
  }
  const run = inspected.run
  const cancellationRecords = run?.records.filter((record) => record.type.startsWith('provider_cancellation_')) ?? []
  if (inspected.kind !== 'run_found' || run.state !== 'completed' || run.effectState !== 'committed'
    || cancellationRecords.length !== 2
    || cancellationRecords[0].type !== 'provider_cancellation_requested'
    || cancellationRecords[1].type !== (expectedDisposition === 'accepted' ? 'provider_cancellation_accepted' : 'provider_cancellation_unknown')
    || cancellationRecords[0].cancellationRequestId !== cancellationRecords[1].cancellationRequestId
    || cancellationRecords[0].leafRunId !== cancelled.leafRunId
    || cancellationRecords[1].cancellationDisposition !== expectedDisposition
    || cancellationRecords[1].providerReference !== cancelled.providerReference) {
    throw new Error(`${surface}:cancellation_protocol_record_invalid:${JSON.stringify(inspected)}`)
  }
  return {
    rootRunId: run.rootRunId,
    state: run.state,
    effectState: run.effectState,
    leafRunId: cancelled.leafRunId,
    disposition: cancelled.disposition,
    providerReference: cancelled.providerReference,
    cancellationRequestId: cancellationRecords[0].cancellationRequestId,
    recordTypes: cancellationRecords.map((record) => record.type),
    exactReplay: true,
  }
}

async function post(path, value) { return await signedFetch(path, value, {}) }
async function rpc(name, args) {
  return await signedFetch('/mcp', {
    jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name, arguments: args },
  }, { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' })
}

async function signedFetch(path, value, extraHeaders) {
  const body = JSON.stringify(value)
  const request = new Request(`${base}${path}`, { method: 'POST', body, headers: {
    'Content-Type': 'application/json',
    'Content-Digest': `sha-256=:${createHash('sha256').update(body).digest('base64')}:`,
    'Signature-Agent': `"${signatureAgent}"`, ...extraHeaders,
  } })
  const now = new Date()
  const signed = await signatureHeaders(request, {
    signer, keyid: privateJwk.kid,
    components: ['@method', '@authority', '@path', 'content-digest', 'signature-agent'],
    created: new Date(now.getTime() - 1_000), expires: new Date(now.getTime() + 30_000), tag: 'web-bot-auth',
  })
  const response = await fetch(request, {
    headers: { ...Object.fromEntries(request.headers), Signature: signed.Signature, 'Signature-Input': signed['Signature-Input'] },
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(`${path}:${response.status}:${JSON.stringify(payload)}`)
  return payload
}

function required(name) {
  const value = process.env[name]
  if (value === undefined || value.length === 0) throw new Error(`${name}_required`)
  return value
}
