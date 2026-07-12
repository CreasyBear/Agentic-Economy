import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { signatureHeaders } from 'http-message-sig'
import { signerFromJWK } from 'web-bot-auth/crypto'

const base = process.env.AE_ROUTING_BASE_URL ?? 'https://loyal-peacock-107.convex.site'
const signatureAgent = process.env.AE_ROUTING_SIGNATURE_AGENT ?? 'https://routing-provider.vercel.app'
const privateKeyPath = process.env.AE_ROUTING_PRIVATE_JWK_PATH
const rootRunId = process.env.AE_ROUTING_ROOT_RUN_ID
const expectedState = process.env.AE_ROUTING_EXPECTED_STATE ?? 'completed'
if (privateKeyPath === undefined) throw new Error('AE_ROUTING_PRIVATE_JWK_PATH is required')
if (rootRunId === undefined) throw new Error('AE_ROUTING_ROOT_RUN_ID is required')
const privateJwk = JSON.parse(await readFile(privateKeyPath, 'utf8'))
const signer = await signerFromJWK(privateJwk)

const http = await signedFetch('/v1/inspect', {
  protocolVersion: 'ae-routing:v1', rootRunId,
}, {})
const mcp = await signedFetch('/mcp', {
  jsonrpc: '2.0', id: 1, method: 'tools/call',
  params: { name: 'ae.inspect', arguments: { protocolVersion: 'ae-routing:v1', rootRunId } },
}, { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' })
const httpRun = http.result?.run
const mcpRun = mcp.result?.structuredContent?.run
if (http.result?.kind !== 'run_found' || mcp.result?.structuredContent?.kind !== 'run_found') {
  throw new Error(`root_run_not_found:${JSON.stringify({ http, mcp })}`)
}
if (httpRun.rootRunId !== rootRunId || mcpRun.rootRunId !== rootRunId
  || httpRun.state !== expectedState || mcpRun.state !== expectedState) {
  throw new Error('root_run_readback_mismatch')
}
process.stdout.write(`${JSON.stringify({
  rootRunId, http: summarize(httpRun), mcp: summarize(mcpRun),
}, null, 2)}\n`)

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
  const response = await fetch(request, { headers: {
    ...Object.fromEntries(request.headers), Signature: signed.Signature, 'Signature-Input': signed['Signature-Input'],
  } })
  const payload = await response.json()
  if (!response.ok) throw new Error(`${path}:${response.status}:${JSON.stringify(payload)}`)
  return payload
}

function summarize(run) {
  return {
    state: run.state, effectState: run.effectState, quoteId: run.quoteId,
    recordTypes: run.records.map((record) => record.type),
    records: run.records,
    providerReferences: run.leaves.map((leaf) => leaf.providerReference).filter(Boolean),
  }
}
