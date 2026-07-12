import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { signatureHeaders } from 'http-message-sig'
import { signerFromJWK } from 'web-bot-auth/crypto'

const base = process.env.AE_ROUTING_BASE_URL ?? 'https://loyal-peacock-107.convex.site'
const signatureAgent = process.env.AE_ROUTING_SIGNATURE_AGENT ?? 'https://routing-provider.vercel.app'
const privateKeyPath = process.env.AE_ROUTING_PRIVATE_JWK_PATH
const encodedInput = process.env.AE_ROUTING_CANARY_INPUT_BASE64URL
if (privateKeyPath === undefined) throw new Error('AE_ROUTING_PRIVATE_JWK_PATH is required')
if (encodedInput === undefined) throw new Error('AE_ROUTING_CANARY_INPUT_BASE64URL is required')
const input = JSON.parse(Buffer.from(encodedInput, 'base64url').toString('utf8'))
const privateJwk = JSON.parse(await readFile(privateKeyPath, 'utf8'))
const signer = await signerFromJWK(privateJwk)
const body = JSON.stringify({ protocolVersion: 'ae-routing:v1', ...input })
const request = new Request(`${base}/v1/execute`, { method: 'POST', body, headers: {
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
const response = await fetch(request, { headers: {
  ...Object.fromEntries(request.headers), Signature: signed.Signature, 'Signature-Input': signed['Signature-Input'],
} })
const payload = await response.json()
if (!response.ok) throw new Error(`execute:${response.status}:${JSON.stringify(payload)}`)
if (payload.result?.kind !== 'run_admitted' || payload.result.run?.state !== 'completed') {
  throw new Error(`canary_not_completed:${JSON.stringify(payload)}`)
}
process.stdout.write(`${JSON.stringify({
  kind: payload.result.kind, rootRunId: payload.result.run.rootRunId,
  state: payload.result.run.state, effectState: payload.result.run.effectState,
  recordTypes: payload.result.run.records.map((record) => record.type),
}, null, 2)}\n`)
