import { createHmac, timingSafeEqual } from 'node:crypto'

const MAX_BODY_BYTES = 32 * 1024

export function createLiveCapabilityHandler(createGateway, loadConfiguration) {
  return async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (request.method !== 'POST') return send(response, 405, { kind: 'refused', reason: 'method_not_allowed' })
    if (!authorized(request.headers.authorization, process.env.AE_PROVIDER_TOKEN)) {
      return send(response, 401, { kind: 'refused', reason: 'authentication_required' })
    }
    const body = await readJson(request)
    if (body === undefined || !validCapabilityRequest(body)) {
      return send(response, 400, { kind: 'refused', reason: 'protocol_invalid' })
    }
    let configuration
    let gateway
    try {
      configuration = loadConfiguration(process.env)
      gateway = createGateway({ ...configuration, fetchImpl: fetch })
    } catch {
      return send(response, 503, { kind: 'refused', reason: 'provider_configuration_unavailable' })
    }
    if (body.operation === 'quote') {
      const result = await gateway.quote({ query: body.query }).catch(() => ({ kind: 'refused', reason: 'provider_quote_unavailable' }))
      observe(providerOperationObservation(configuration.provider, body.operation, body, result, undefined, configuration.observabilityKey))
      return send(response, 200, result)
    }
    const idempotencyKey = header(request.headers['idempotency-key'])
    if (idempotencyKey === undefined) return send(response, 400, { kind: 'effect_not_committed', reason: 'idempotency_key_required' })
    const input = {
      providerQuoteRef: body.providerQuoteRef, idempotencyKey,
      rootRunId: body.rootRunId, leafRunId: body.leafRunId, stepGrantId: body.stepGrantId,
    }
    if (body.operation === 'execute') {
      const result = await gateway.execute(input).catch(() => ({ kind: 'outcome_unknown' }))
      observe(providerOperationObservation(configuration.provider, body.operation, body, result, idempotencyKey, configuration.observabilityKey))
      return send(response, 200, result.kind === 'reconciliation_pending'
        ? { kind: 'outcome_unknown', providerReference: providerReference(body.providerQuoteRef) }
        : result)
    }
    if (body.operation === 'reconcile') {
      const result = await gateway.reconcile(input).catch(() => ({ kind: 'reconciliation_pending' }))
      observe(providerOperationObservation(configuration.provider, body.operation, body, result, idempotencyKey, configuration.observabilityKey))
      return send(response, 200, result)
    }
    if (body.operation === 'cancel') return send(response, 200, { kind: 'cancellation_rejected', reason: 'provider_refund_requires_separate_authorization' })
    return send(response, 400, { kind: 'refused', reason: 'operation_unsupported' })
  }
}

export function providerOperationObservation(provider, operation, body, result, idempotencyKey, observabilityKey) {
  return Object.freeze({
    schemaVersion: 'ae-provider-observation:v1',
    provider: provider === 'shippo' || provider === 'easypost' ? provider : 'unknown',
    operation: operation === 'quote' || operation === 'execute' || operation === 'reconcile' ? operation : 'unknown',
    resultKind: safeResultKind(result?.kind),
    ...(typeof result?.kind === 'string' && result.kind === 'reconciliation_pending' ? { retryDisposition: 'read_again_later' } : {}),
    ...(operation === 'execute' && result?.kind === 'outcome_unknown' ? { retryDisposition: 'reconcile_only' } : {}),
    ...(typeof body?.rootRunId === 'string' ? { rootRunRef: digest(body.rootRunId, observabilityKey) } : {}),
    ...(typeof body?.leafRunId === 'string' ? { leafRunRef: digest(body.leafRunId, observabilityKey) } : {}),
    ...(typeof body?.stepGrantId === 'string' ? { stepGrantRef: digest(body.stepGrantId, observabilityKey) } : {}),
    ...(typeof idempotencyKey === 'string' ? { idempotencyRef: digest(idempotencyKey, observabilityKey) } : {}),
  })
}

export function requiredText(env, name) {
  const value = env[name]
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name}_required`)
  return value
}

export function requiredJson(env, name) {
  const value = JSON.parse(requiredText(env, name))
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${name}_invalid`)
  return value
}

function authorized(value, expected) {
  const actual = typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7) : ''
  if (typeof expected !== 'string' || expected.length < 32 || actual.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}
async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY_BYTES) return undefined; chunks.push(chunk) }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return undefined }
}
function providerReference(reference) { return typeof reference === 'string' ? `provider-quote:${reference.slice(-64)}` : undefined }
function header(value) { return typeof value === 'string' && value.length > 0 && value.length <= 500 ? value : undefined }
function send(response, status, body) { response.status(status).send(JSON.stringify(body)) }
function digest(value, key) {
  if (typeof key !== 'string' || key.length < 32) return 'unavailable'
  return `hmac-sha256:${createHmac('sha256', key).update(value).digest('hex')}`
}
function safeResultKind(value) {
  return ['quoted', 'refused', 'effect_committed', 'effect_not_committed', 'outcome_unknown', 'reconciliation_pending'].includes(value)
    ? value : 'invalid_result'
}
function observe(event) { console.info('provider_operation_observed', event) }

function validCapabilityRequest(body) {
  if (!plainObject(body) || body.protocolVersion !== 'ae-capability:v1'
    || body.capabilityContractId !== 'shipping.label.book:v1'
    || !bounded(body.bindingId, 200)) return false
  if (body.operation === 'quote') return exactKeys(body, ['protocolVersion', 'operation', 'bindingId', 'capabilityContractId', 'query'])
    && bounded(body.query, 8_000)
  if (body.operation !== 'execute' && body.operation !== 'reconcile' && body.operation !== 'cancel') return false
  const allowed = ['protocolVersion', 'operation', 'bindingId', 'capabilityContractId', 'rootRunId', 'leafRunId', 'stepGrantId', 'providerQuoteRef']
  if (body.operation === 'execute') allowed.push('data')
  return exactKeys(body, allowed)
    && bounded(body.rootRunId, 200) && bounded(body.leafRunId, 200) && bounded(body.stepGrantId, 200)
    && (body.providerQuoteRef === undefined || bounded(body.providerQuoteRef, 500))
    && (body.operation !== 'execute' || validData(body.data))
}
function validData(value) {
  return value === undefined || (plainObject(value) && Object.keys(value).length <= 128
    && Object.entries(value).every(([key, item]) => bounded(key, 200) && bounded(item, 8_000)))
}
function bounded(value, maximum) { return typeof value === 'string' && value.length > 0 && value.length <= maximum }
function plainObject(value) { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function exactKeys(value, allowed) { return Object.keys(value).every((key) => allowed.includes(key)) }
