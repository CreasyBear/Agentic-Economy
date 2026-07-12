import { createHash } from 'node:crypto'
import { appendFile, readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { signatureHeaders } from 'http-message-sig'
import { signerFromJWK } from 'web-bot-auth/crypto'

const endpoint = process.env.AE_ROUTING_MCP_URL ?? 'https://loyal-peacock-107.convex.site/mcp'
const signatureAgent = process.env.AE_ROUTING_SIGNATURE_AGENT
const privateKeyPath = process.env.AE_ROUTING_PRIVATE_JWK_PATH
if (signatureAgent === undefined) throw new Error('AE_ROUTING_SIGNATURE_AGENT is required')
if (privateKeyPath === undefined) throw new Error('AE_ROUTING_PRIVATE_JWK_PATH is required')
const privateJwk = JSON.parse(await readFile(privateKeyPath, 'utf8'))
const signer = await signerFromJWK(privateJwk)

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false })
for await (const line of lines) {
  if (line.trim().length === 0) continue
  let message
  try { message = JSON.parse(line) } catch { write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue }
  try {
    await trace({ direction: 'host_to_ae', id: message.id ?? null, method: message.method, tool: message.params?.name, parameterKeys: Object.keys(message.params ?? {}).sort(), argumentKeys: Object.keys(message.params?.arguments ?? {}).sort() })
    const response = await forward(message)
    if (response !== undefined) {
      await trace({ direction: 'ae_to_host', id: response.id ?? null, errorCode: response.error?.code, errorMessage: response.error?.message, toolError: response.result?.isError === true ? response.result?.content?.[0]?.text : undefined })
      write(response)
    }
  } catch (error) {
    process.stderr.write(`ae-routing-bridge: ${error instanceof Error ? error.message : 'forward_failed'}\n`)
    if ('id' in message) write({ jsonrpc: '2.0', id: message.id ?? null, error: { code: -32000, message: 'Routing bridge unavailable' } })
  }
}

async function forward(message) {
  const body = JSON.stringify(message)
  const request = new Request(endpoint, { method: 'POST', body, headers: {
    'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2025-06-18',
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
  if (response.status === 202 || response.status === 204) return undefined
  const text = await response.text()
  if (!response.ok) throw new Error(`remote_${response.status}`)
  return JSON.parse(text)
}

function write(value) { process.stdout.write(`${JSON.stringify(value)}\n`) }
async function trace(value) {
  const path = process.env.AE_ROUTING_BRIDGE_TRACE_PATH
  if (path !== undefined) await appendFile(path, `${JSON.stringify(value)}\n`, { mode: 0o600 })
}
