import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLiveCapabilityHandler } from '../../examples/routing-provider/lib/live-capability-handler.mjs'

const providerToken = 'private-provider-token-with-at-least-32-bytes'
const baseExecution = {
  protocolVersion: 'ae-capability:v1', operation: 'execute', bindingId: 'binding:shippo:v1',
  capabilityContractId: 'shipping.label.book:v1', rootRunId: 'root:1', leafRunId: 'leaf:1',
  stepGrantId: 'grant:1', providerQuoteRef: 'quote:1', data: {},
}

describe('live capability HTTP boundary', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it('authenticates before parsing or loading provider configuration', async () => {
    let loaded = false
    const handler = createLiveCapabilityHandler(() => gateway(), () => { loaded = true; throw new Error('must_not_load') })
    const result = await call(handler, '{broken-json', {})
    expect(result).toMatchObject({ status: 401, body: { kind: 'refused', reason: 'authentication_required' } })
    expect(loaded).toBe(false)
  })

  it('rejects oversized, malformed, extra-key, and incomplete operation bodies before gateway invocation', async () => {
    vi.stubEnv('AE_PROVIDER_TOKEN', providerToken)
    let created = 0
    const handler = createLiveCapabilityHandler(() => { created += 1; return gateway() }, configuration)
    await expect(call(handler, 'x'.repeat(33 * 1024), authHeaders())).resolves.toMatchObject({ status: 400, body: { reason: 'protocol_invalid' } })
    await expect(call(handler, '{bad', authHeaders())).resolves.toMatchObject({ status: 400, body: { reason: 'protocol_invalid' } })
    await expect(call(handler, JSON.stringify({ ...baseExecution, unexpected: true }), authHeaders('idem:extra'))).resolves.toMatchObject({ status: 400, body: { reason: 'protocol_invalid' } })
    const { stepGrantId: _missing, ...incomplete } = baseExecution
    await expect(call(handler, JSON.stringify(incomplete), authHeaders('idem:missing'))).resolves.toMatchObject({ status: 400, body: { reason: 'protocol_invalid' } })
    expect(created).toBe(0)
  })

  it('maps thrown quote, execute, and reconcile boundaries to safe no-retry protocol outcomes', async () => {
    vi.stubEnv('AE_PROVIDER_TOKEN', providerToken)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const handler = createLiveCapabilityHandler(() => ({
      quote: async () => { throw new Error('secret quote failure') },
      execute: async () => { throw new Error('write may have committed') },
      reconcile: async () => { throw new Error('read unavailable') },
    }), configuration)
    const quote = await call(handler, JSON.stringify({
      protocolVersion: 'ae-capability:v1', operation: 'quote', bindingId: 'binding:shippo:v1',
      capabilityContractId: 'shipping.label.book:v1', query: 'book label',
    }), authHeaders())
    const execute = await call(handler, JSON.stringify(baseExecution), authHeaders('idem:execute'))
    const { data: _data, ...reconcileBody } = { ...baseExecution, operation: 'reconcile' }
    const reconcile = await call(handler, JSON.stringify(reconcileBody), authHeaders('idem:reconcile'))
    expect(quote).toMatchObject({ status: 200, body: { kind: 'refused', reason: 'provider_quote_unavailable' } })
    expect(execute).toMatchObject({ status: 200, body: { kind: 'outcome_unknown' } })
    expect(reconcile).toMatchObject({ status: 200, body: { kind: 'reconciliation_pending' } })
  })

  it('requires a bounded idempotency key before execute or reconciliation', async () => {
    vi.stubEnv('AE_PROVIDER_TOKEN', providerToken)
    const handler = createLiveCapabilityHandler(() => gateway(), configuration)
    await expect(call(handler, JSON.stringify(baseExecution), authHeaders())).resolves.toMatchObject({ status: 400, body: { reason: 'idempotency_key_required' } })
    await expect(call(handler, JSON.stringify(baseExecution), authHeaders('x'.repeat(501)))).resolves.toMatchObject({ status: 400, body: { reason: 'idempotency_key_required' } })
  })
})

function configuration() {
  return { provider: 'shippo' as const, providerToken, observabilityKey: 'observation-key-with-at-least-32-bytes' }
}

function gateway() {
  return {
    quote: async () => ({ kind: 'refused' as const, reason: 'test' }),
    execute: async () => ({ kind: 'effect_not_committed' as const, reason: 'test' }),
    reconcile: async () => ({ kind: 'reconciliation_pending' as const }),
  }
}

function authHeaders(idempotencyKey?: string) {
  return { authorization: `Bearer ${providerToken}`, ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }) }
}

async function call(handler: (request: unknown, response: unknown) => Promise<unknown>, body: string, headers: Record<string, string>) {
  const request = Readable.from([Buffer.from(body)]) as Readable & { method: string; headers: Record<string, string> }
  request.method = 'POST'; request.headers = headers
  let status = 0; let responseText = ''
  const response = {
    setHeader() {}, status(value: number) { status = value; return this },
    send(value: string) { responseText = value; return this },
  }
  await handler(request, response)
  return { status, body: JSON.parse(responseText) as Record<string, unknown> }
}
