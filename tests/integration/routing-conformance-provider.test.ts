import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'

import handler from '../../examples/routing-provider/api/capability.mjs'

const token = 'provider-token-with-at-least-thirty-two-bytes'

describe('separately deployable routing conformance provider', () => {
  afterEach(() => { delete process.env.AE_PROVIDER_TOKEN })

  it('quotes and returns deterministic success, failure, and uncertainty outcomes', async () => {
    process.env.AE_PROVIDER_TOKEN = token
    await expect(call({ operation: 'quote', bindingId: 'binding:shipping-label-conformance:v1', capabilityContractId: 'shipping.label.book:v1', query: 'book a label' })).resolves.toMatchObject({
      status: 200, body: { kind: 'quoted', maximumCost: { currency: 'AUD', amountMinor: 125 }, dataFields: ['scenario', 'primary_context'] },
    })
    await expect(call({ operation: 'quote', bindingId: 'binding:shipping-label-conformance:zz-fallback:v1', capabilityContractId: 'shipping.label.book:v1', query: 'book a label' })).resolves.toMatchObject({
      status: 200, body: { kind: 'quoted', dataFields: ['scenario', 'fallback_context'] },
    })

    const success = await call({ operation: 'execute', capabilityContractId: 'shipping.label.book:v1', data: { scenario: 'success' } }, 'execution:1')
    const replay = await call({ operation: 'execute', capabilityContractId: 'shipping.label.book:v1', data: { scenario: 'success' } }, 'execution:1')
    expect(success).toMatchObject({ status: 200, body: { kind: 'effect_committed', reportedCost: { currency: 'AUD', amountMinor: 125 }, outcome: { fulfillment: 'not_created' } } })
    expect(replay.body.providerReference).toBe(success.body.providerReference)
    await expect(call({ operation: 'execute', capabilityContractId: 'shipping.label.book:v1', data: { scenario: 'failure' } }, 'execution:2')).resolves.toMatchObject({ body: { kind: 'effect_not_committed', reason: 'provider_declined' } })
    const unknown = await call({ operation: 'execute', capabilityContractId: 'shipping.label.book:v1', data: { scenario: 'unknown' } }, 'execution:3')
    expect(unknown).toMatchObject({ body: { kind: 'outcome_unknown', providerReference: expect.any(String) } })
    const reconciled = await call({
      operation: 'reconcile', capabilityContractId: 'shipping.label.book:v1',
      rootRunId: 'root:execution:3', leafRunId: 'leaf:execution:3', stepGrantId: 'grant:execution:3',
    }, 'reconcile:3')
    expect(reconciled).toMatchObject({ status: 200, body: { kind: 'effect_committed', providerReference: unknown.body.providerReference } })
    await expect(call({ operation: 'execute', bindingId: 'binding:shipping-label-conformance:v1', capabilityContractId: 'shipping.label.book:v1', data: { scenario: 'fallback_success' } }, 'execution:4')).resolves.toMatchObject({ body: { kind: 'effect_not_committed', reason: 'provider_declined' } })
    await expect(call({ operation: 'execute', bindingId: 'binding:shipping-label-conformance:zz-fallback:v1', capabilityContractId: 'shipping.label.book:v1', data: { scenario: 'fallback_success' } }, 'execution:5')).resolves.toMatchObject({ body: { kind: 'effect_committed' } })
    await expect(call({ operation: 'execute', bindingId: 'binding:shipping-label-conformance:v1', capabilityContractId: 'shipping.label.book:v1', data: { scenario: 'success', fallback_context: 'must-not-cross-primary-seam' } }, 'execution:6')).resolves.toMatchObject({ status: 400, body: { kind: 'effect_not_committed', reason: 'data_scope_invalid' } })
  })

  it('fails closed without its server-held credential', async () => {
    await expect(call({ operation: 'quote', capabilityContractId: 'shipping.label.book:v1' })).resolves.toMatchObject({ status: 401, body: { kind: 'refused' } })
  })
})

async function call(body: Record<string, unknown>, idempotencyKey?: string) {
  const releasedIdentity = body.operation === 'quote' || idempotencyKey === undefined ? {} : {
    rootRunId: `root:${idempotencyKey}`, leafRunId: `leaf:${idempotencyKey}`, stepGrantId: `grant:${idempotencyKey}`,
  }
  const request = Readable.from([Buffer.from(JSON.stringify({ protocolVersion: 'ae-capability:v1', ...releasedIdentity, ...body }))]) as Readable & { method: string; headers: Record<string, string> }
  request.method = 'POST'
  request.headers = { authorization: `Bearer ${token}`, ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }) }
  let status = 0
  let text = ''
  const response = {
    setHeader() {},
    status(value: number) { status = value; return this },
    send(value: string) { text = value; return this },
  }
  await handler(request, response)
  return { status, body: JSON.parse(text) as Record<string, any> }
}
