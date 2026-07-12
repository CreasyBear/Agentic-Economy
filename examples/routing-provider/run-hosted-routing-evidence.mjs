import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { signatureHeaders } from 'http-message-sig'
import { signerFromJWK } from 'web-bot-auth/crypto'

const base = process.env.AE_ROUTING_BASE_URL ?? 'https://loyal-peacock-107.convex.site'
const signatureAgent = required('AE_ROUTING_SIGNATURE_AGENT')
const expectedBindingId = required('AE_EXPECTED_BINDING_ID')
const expectedExcludedBindingId = process.env.AE_EXPECTED_EXCLUDED_BINDING_ID
const privateJwk = JSON.parse(await readFile(required('AE_ROUTING_PRIVATE_JWK_PATH'), 'utf8'))
const signer = await signerFromJWK(privateJwk)

const http = (await signedFetch('/v1/route', routeInput(), {})).result
const mcp = (await signedFetch('/mcp', {
  jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name: 'ae.route', arguments: routeInput() },
}, { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' })).result.structuredContent

const result = { http: assertRoute('http', http), mcp: assertRoute('mcp', mcp) }
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

function routeInput() {
  return { protocolVersion: 'ae-routing:v1', networkId: 'registered-businesses', query: 'shipping label standing tie', constraints: { currency: 'AUD', maximumSpendMinor: 250, optimizeFor: 'cost' } }
}

function assertRoute(surface, routed) {
  if (routed.kind !== 'quoted' || routed.quote.selectedGraph.bindingId !== expectedBindingId
    || routed.quote.routingSnapshot.compilerVersion !== 'routing-compiler:v2'
    || routed.quote.organicDecision.optimizerVersion !== 'organic-cost-latency-evidence:v2') {
    throw new Error(`${surface}:evidence_route_invalid:${JSON.stringify(routed)}`)
  }
  const factors = routed.quote.organicDecision.factors
  if (factors.length !== 2 || factors.some((factor) => factor.evidence?.disposition !== 'current')) {
    throw new Error(`${surface}:evidence_factors_missing:${JSON.stringify(factors)}`)
  }
  if (expectedExcludedBindingId !== undefined) {
    const excluded = factors.find((factor) => factor.bindingId === expectedExcludedBindingId)
    if (excluded?.feasible !== false || excluded.refusalReason !== 'incident_excluded') {
      throw new Error(`${surface}:incident_exclusion_missing:${JSON.stringify(factors)}`)
    }
    if (JSON.stringify(excluded.evidence.activeIncidentIds) !== JSON.stringify(['incident:hosted-routing-exclusion'])
      || excluded.evidence.healthEvidenceStanding !== 'eligible_observed'
      || excluded.evidence.incidentEvidenceStanding !== 'eligible_corroborated'
      || excluded.evidence.standingEvidenceStanding !== 'eligible_run_bound') {
      throw new Error(`${surface}:evidence_standing_not_inspectable:${JSON.stringify(excluded.evidence)}`)
    }
  }
  return {
    quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest,
    selectedBindingId: routed.quote.selectedGraph.bindingId,
    evidenceFactors: factors.map((factor) => ({
      bindingId: factor.bindingId, feasible: factor.feasible, refusalReason: factor.refusalReason,
      evidence: factor.evidence,
    })),
  }
}

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
