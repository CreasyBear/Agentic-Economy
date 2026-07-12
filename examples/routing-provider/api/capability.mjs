import { createHash, timingSafeEqual } from 'node:crypto'

const MAX_BODY_BYTES = 32 * 1024

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (request.method !== 'POST') return send(response, 405, { kind: 'refused', reason: 'method_not_allowed' })
  if (!authorized(request.headers.authorization, process.env.AE_PROVIDER_TOKEN)) {
    return send(response, 401, { kind: 'refused', reason: 'authentication_required' })
  }

  const body = await readJson(request)
  if (body === undefined || body.protocolVersion !== 'ae-capability:v1') {
    return send(response, 400, { kind: 'refused', reason: 'protocol_invalid' })
  }
  if (body.capabilityContractId !== 'shipping.label.book:v1') {
    return send(response, 400, { kind: 'refused', reason: 'capability_contract_unsupported' })
  }
  if (body.operation === 'quote') {
    const dataFields = dataFieldsForBinding(body.bindingId)
    const express = body.bindingId === 'binding:shipping-label-conformance:zz-fallback:v1'
    const standingTie = typeof body.query === 'string' && body.query.includes('standing tie')
    return send(response, 200, {
      kind: 'quoted',
      expectedCost: { currency: 'AUD', amountMinor: standingTie ? 100 : express ? 125 : 100 },
      maximumCost: { currency: 'AUD', amountMinor: 125 },
      expectedLatencyMs: standingTie ? 500 : express ? 200 : 1_200,
      dataFields,
      disclosures: ['Conformance tracer only; no carrier shipment or physical label is created.'],
    })
  }
  if (body.operation !== 'execute' && body.operation !== 'reconcile' && body.operation !== 'cancel') return send(response, 400, { kind: 'refused', reason: 'operation_unsupported' })

  const idempotencyKey = header(request.headers['idempotency-key'])
  if (idempotencyKey === undefined) return send(response, 400, { kind: 'effect_not_committed', reason: 'idempotency_key_required' })
  if (body.operation === 'cancel') {
    if (typeof body.rootRunId !== 'string' || typeof body.leafRunId !== 'string' || typeof body.stepGrantId !== 'string') {
      return send(response, 400, { kind: 'cancellation_rejected', reason: 'released_identity_required' })
    }
    if (body.bindingId === 'binding:shipping-label-conformance:zz-fallback:v1') {
      return send(response, 200, { kind: 'cancellation_unknown', providerReference: `cancel-status:${digest(idempotencyKey).slice(0, 24)}` })
    }
    return send(response, 200, { kind: 'cancellation_accepted', providerReference: `cancel-trace:${digest(idempotencyKey).slice(0, 24)}` })
  }
  const allowedDataFields = new Set(dataFieldsForBinding(body.bindingId))
  if (Object.keys(body.data ?? {}).some((field) => !allowedDataFields.has(field))) {
    return send(response, 400, { kind: 'effect_not_committed', reason: 'data_scope_invalid' })
  }
  const scenario = typeof body.data?.scenario === 'string' ? body.data.scenario : scenarioFromIdempotency(idempotencyKey)
  const providerIdentity = [body.rootRunId, body.leafRunId, body.stepGrantId]
  if (providerIdentity.some((value) => typeof value !== 'string' || value.length === 0)) {
    return send(response, 400, { kind: 'effect_not_committed', reason: 'released_identity_required' })
  }
  const providerReference = `label-trace:${digest(providerIdentity.join(':')).slice(0, 24)}`
  if (scenario === 'fallback_success' && body.bindingId === 'binding:shipping-label-conformance:v1') {
    return send(response, 200, { kind: 'effect_not_committed', reason: 'provider_declined', providerReference })
  }
  if (scenario === 'fallback_success' && body.bindingId !== 'binding:shipping-label-conformance:zz-fallback:v1') {
    return send(response, 400, { kind: 'effect_not_committed', reason: 'binding_unsupported', providerReference })
  }
  if (scenario === 'failure') return send(response, 200, { kind: 'effect_not_committed', reason: 'provider_declined', providerReference })
  if (scenario === 'unknown') return send(response, 200, { kind: 'outcome_unknown', providerReference })
  if (scenario !== 'success' && scenario !== 'fallback_success') return send(response, 400, { kind: 'effect_not_committed', reason: 'scenario_invalid', providerReference })
  return send(response, 200, {
    kind: 'effect_committed', providerReference,
    reportedCost: { currency: 'AUD', amountMinor: 125 },
    outcome: { artifact: 'test_shipping_label', status: 'booked', fulfillment: 'not_created' },
  })
}

function authorized(value, expected) {
  const actual = typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7) : ''
  if (typeof expected !== 'string' || expected.length < 32 || actual.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return undefined }
}

function header(value) { return typeof value === 'string' && value.length > 0 && value.length <= 500 ? value : undefined }
function dataFieldsForBinding(bindingId) {
  return bindingId === 'binding:shipping-label-conformance:zz-fallback:v1'
    ? ['scenario', 'fallback_context']
    : ['scenario', 'primary_context']
}
function scenarioFromIdempotency(value) {
  for (const scenario of ['fallback_success', 'failure', 'unknown', 'success']) {
    if (value.includes(`:${scenario}:`)) return scenario
  }
  return 'success'
}
function digest(value) { return createHash('sha256').update(value).digest('hex') }
function send(response, status, body) { response.status(status).send(JSON.stringify(body)) }
