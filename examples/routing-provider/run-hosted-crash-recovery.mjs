import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { signatureHeaders } from 'http-message-sig'
import { signerFromJWK } from 'web-bot-auth/crypto'

const required = (name) => {
  const value = process.env[name]
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`)
  return value
}
const base = process.env.AE_ROUTING_BASE_URL ?? 'https://loyal-peacock-107.convex.site'
const signatureAgent = process.env.AE_ROUTING_SIGNATURE_AGENT ?? 'https://ae-routing-agent-directory.sonny-c-claw.workers.dev'
const privateJwk = JSON.parse(await readFile(required('AE_ROUTING_PRIVATE_JWK_PATH'), 'utf8'))
const signer = await signerFromJWK(privateJwk)
const execution = await post('/v1/execute', {
  protocolVersion: 'ae-routing:v1',
  quoteId: required('AE_CRASH_QUOTE_ID'),
  quoteDigest: required('AE_CRASH_QUOTE_DIGEST'),
  authorizationRef: required('AE_CRASH_AUTHORIZATION_REF'),
  idempotencyKey: required('AE_CRASH_IDEMPOTENCY_KEY'),
  data: { scenario: 'success' },
})
if (execution.result.kind !== 'run_admitted') throw new Error(`recovery_failed:${JSON.stringify(execution)}`)
const inspection = await post('/v1/inspect', { protocolVersion: 'ae-routing:v1', rootRunId: execution.result.run.rootRunId })
const run = execution.result.run
const evidence = {
  executeKind: execution.result.kind,
  inspectKind: inspection.result.kind,
  rootRunId: run.rootRunId,
  state: run.state,
  effectState: run.effectState,
  leaves: run.leaves.map(({ bindingId, state, attemptDisposition, effectState, providerReference }) => ({ bindingId, state, attemptDisposition, effectState, providerReference })),
  recordTypes: run.records.map((record) => record.type),
}
if (evidence.inspectKind !== 'run_found' || evidence.state !== 'completed' || evidence.effectState !== 'committed') throw new Error(`recovery_contract_failed:${JSON.stringify(evidence)}`)
if (!evidence.recordTypes.includes('provider_reconciliation_observed')) throw new Error(`reconciliation_record_missing:${JSON.stringify(evidence)}`)
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)

async function post(path, value) {
  const body = JSON.stringify(value)
  const request = new Request(`${base}${path}`, { method: 'POST', body, headers: {
    'Content-Type': 'application/json',
    'Content-Digest': `sha-256=:${createHash('sha256').update(body).digest('base64')}:`,
    'Signature-Agent': `"${signatureAgent}"`,
  } })
  const now = new Date()
  const signed = await signatureHeaders(request, {
    signer, keyid: privateJwk.kid,
    components: ['@method', '@authority', '@path', 'content-digest', 'signature-agent'],
    created: new Date(now.getTime() - 1_000), expires: new Date(now.getTime() + 30_000), tag: 'web-bot-auth',
  })
  const response = await fetch(request, { headers: { ...Object.fromEntries(request.headers), Signature: signed.Signature, 'Signature-Input': signed['Signature-Input'] } })
  const payload = await response.json()
  if (!response.ok) throw new Error(`${path}:${response.status}:${JSON.stringify(payload)}`)
  return payload
}
