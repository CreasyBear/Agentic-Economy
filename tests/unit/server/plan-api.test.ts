import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleToolPlanQuotePost, handleToolPlanRunPost, handleToolPlanGet, handleToolPlanCancelPost } from '@/lib/server/plan-api'
import type { CallHandlerOptions } from '@/lib/server/call-api'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'

const plan = { nodes: [{ id: 'geo', toolRef: `operation:v1:${'a'.repeat(64)}`, input: { name: 'Perth' }, dependsOn: [] }] }
const quoted = {
  kind: 'quoted', planRef: 'plan:v1:one', planDigest: 'digest',
  nodes: [{ nodeId: 'geo', toolRef: plan.nodes[0]!.toolRef, inputMode: 'literal', priceClass: 'fixed', pricingDigest: 'price', ceilingAudUnits: '1000000', validation: 'typed', dependsOn: [] }],
  stages: [['geo']], approvedTotalAudUnits: '1000000', currency: 'AUD', exponent: 6, expiresAt: 2_000_000_000_000, dataFlows: [],
}
function options(result: unknown = quoted): CallHandlerOptions & { callService: NonNullable<CallHandlerOptions['callService']> } {
  return {
    authenticate: async () => ({ isAuthenticated: true, tokenType: 'api_key', id: 'key:test', subject: 'user_test', scopes: ['market_tools:call'], claims: { aeEnvironment: 'sandbox' } }),
    resolvePrincipal: async (projection) => ({ ...projection, principalId: 'prn_00000000000040008000000000000043', ownerId: 'acc_00000000000040008000000000000043' }),
    callService: { planQuote: vi.fn().mockResolvedValue(result), planRun: vi.fn().mockResolvedValue(result), planGet: vi.fn().mockResolvedValue(result), planCancel: vi.fn().mockResolvedValue(result), callTool: vi.fn(), readCallStatus: vi.fn(), cancelCall: vi.fn(), reconcileCall: vi.fn() },
  }
}
function request(body: unknown = { plan }, query = '') {
  return new Request(`https://ae.example/api/v1/tools/plans/quote${query}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
afterEach(() => { vi.restoreAllMocks(); setHttpRateLimitAdmissionForTests(undefined) })

describe('Plan quote HTTP contract', () => {
  it('preserves exact units, digest and stages and passes only the authenticated identity', async () => {
    const services = options()
    const response = await handleToolPlanQuotePost(request(), services)
    expect(response.status).toBe(200)
    expect(response.headers.get('x-ae-request-id')).toBeTruthy()
    expect(await response.json()).toEqual(quoted)
    expect(services.callService.planQuote).toHaveBeenCalledWith(expect.objectContaining({
      input: { plan }, principal: expect.objectContaining({ principalId: 'prn_00000000000040008000000000000043' }),
    }))
    expect(services.callService.callTool).not.toHaveBeenCalled()
  })
  it.each([
    [{ plan, principal: { ownerId: 'other' } }, ''],
    [{ plan: { nodes: [] } }, ''],
    [{ plan }, '?extra=true'],
    [{ plan }, '?a=1&a=2'],
  ])('rejects malformed or over-specified requests before persistence', async (body, query) => {
    const services = options()
    expect((await handleToolPlanQuotePost(request(body, query), services)).status).toBe(400)
    expect(services.callService.planQuote).not.toHaveBeenCalled()
  })
  it('requires authentication before quote persistence', async () => {
    const services = options()
    expect((await handleToolPlanQuotePost(request(), {
      ...services,
      authenticate: async () => ({ isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null }),
    })).status).toBe(401)
    expect(services.callService.planQuote).not.toHaveBeenCalled()
  })
  it('preserves semantic refusal without attempting a Call', async () => {
    const services = options({ kind: 'refused', code: 'cycle' })
    expect(await (await handleToolPlanQuotePost(request(), services)).json()).toEqual({ kind: 'refused', code: 'cycle' })
    expect(services.callService.callTool).not.toHaveBeenCalled()
  })
  it('rejects malformed backend output as unavailable', async () => {
    const response = await handleToolPlanQuotePost(request(), options({ ...quoted, approvedTotalAudUnits: 1 }))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'tool_plan_quote_unavailable' })
  })
})

describe('Plan runtime HTTP contract', () => {
  const command = { planRef: 'plan:test', approvedTotalAudUnits: '1000001', idempotencyKey: 'stable-retry' }
  const running = { kind: 'running', planRef: command.planRef, state: 'running' }
  it('submits exact authority and the stable run identity', async () => {
    const services = options(running)
    const result = await handleToolPlanRunPost(request(command), services)
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual(running)
    expect(services.callService.planRun).toHaveBeenCalledWith(expect.objectContaining({ input: command }))
    expect(services.callService.callTool).not.toHaveBeenCalled()
  })
  it.each([{ ...command, approvedTotalAudUnits: '1.000001' }, { ...command, plan: {} }, { planRef: 'plan:test' }])('rejects malformed run commands', async body => {
    const services = options(running)
    expect((await handleToolPlanRunPost(request(body), services)).status).toBe(400)
    expect(services.callService.planRun).not.toHaveBeenCalled()
  })
  it('reads a Plan through the read-only service with strict empty query parameters', async () => {
    const services = options({ kind: 'refused', code: 'plan_not_found' })
    const result = await handleToolPlanGet(new Request('https://ae.example/api/v1/tools/plans/plan:test'), command.planRef, services)
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ kind: 'refused', code: 'plan_not_found' })
    expect(services.callService.planGet).toHaveBeenCalledOnce()
    expect(services.callService.planRun).not.toHaveBeenCalled()
    expect((await handleToolPlanGet(new Request('https://ae.example/api/v1/tools/plans/plan:test?force=true'), command.planRef, services)).status).toBe(400)
    expect(services.callService.planGet).toHaveBeenCalledOnce()
  })
  it('preserves accepted Call readback and complete recovery controls', async () => {
    const callResult = {
      kind: 'completed', callRef: `operation-invocation:v1:${'b'.repeat(64)}`, toolRef: plan.nodes[0]!.toolRef,
      output: { location: 'Perth' }, evidenceHash: 'evidence:accepted',
      usage: { usageRef: 'usage:accepted', observedAt: 10, chargeState: 'paid',
        amount: { currency: 'AUD', exponent: 6, units: '1000001' }, priceDigest: 'price:accepted' },
    }
    // Accepted purchase fields remain intact alongside the current recovery controls.
    const retained = {
      kind: 'available', planRef: command.planRef, planDigest: 'plan:accepted', state: 'reconciliation_required',
      approvedTotalAudUnits: '1000001', currency: 'AUD', exponent: 6, expiresAt: 2000, runDeadlineAt: 3000,
      maximumConcurrentNodes: 1, failureCode: 'release_uncertain', stages: [['geo']],
      nodes: [{ nodeId: 'geo', toolRef: plan.nodes[0]!.toolRef, providerHost: 'provider.example', dependsOn: [],
        ceilingAudUnits: '1000001', state: 'succeeded', callRef: callResult.callRef, result: callResult }],
      dataFlows: [], hold: { status: 'uncertain', settledAudUnits: '1000001', releasedAudUnits: '0' },
    }
    const complete = { ...retained,
      next: [{ action: 'tool.plan.get', args: { planRef: command.planRef }, authority: 'same_principal' }],
      cancellation: { action: 'tool.plan.cancel', args: { planRef: command.planRef }, authority: 'same_principal' },
      ownerHandoff: { kind: 'attention_required', reason: 'plan_recovery_required', planRef: command.planRef,
        path: '/support', detail: 'Review the recorded Plan before another run.' },
    }
    const services = options(complete)
    const read = new Request(`https://ae.example/api/v1/tools/plans/${command.planRef}`)
    const response = await handleToolPlanGet(read, command.planRef, services)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(complete)
    expect(services.callService.planGet).toHaveBeenCalledWith(expect.objectContaining({ input: { planRef: command.planRef } }))
    expect(services.callService.planRun).not.toHaveBeenCalled()
  })

  it.each([handleToolPlanRunPost, handleToolPlanCancelPost])('returns complete controls while preserving the submitted command', async handler => {
    const complete = { ...running, next: [{ action: 'tool.plan.get', args: { planRef: command.planRef }, authority: 'same_principal' }] }
    const body = handler === handleToolPlanRunPost ? command : { planRef: command.planRef }
    const services = options(complete)
    const response = await handler(request(body), services)
    expect(await response.json()).toEqual(complete)
    const dispatch = handler === handleToolPlanRunPost ? services.callService.planRun : services.callService.planCancel
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ input: body }))
  })

  it('records cancellation for only the named Plan', async () => {
    const services = options(running)
    expect((await handleToolPlanCancelPost(request({ planRef: command.planRef }), services)).status).toBe(200)
    expect(services.callService.planCancel).toHaveBeenCalledWith(expect.objectContaining({ input: { planRef: command.planRef } }))
    expect(services.callService.planRun).not.toHaveBeenCalled()
  })
})
