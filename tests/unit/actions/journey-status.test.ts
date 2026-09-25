import { describe, expect, it, vi } from 'vitest'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { findAction } from '@/modules/actions/index'
import { readJourneySourceStatus } from '@/lib/server/journey-status-source'

const journeyStatusAction = findAction('journey.status') ?? (() => { throw new Error('journey_status_not_registered') })()
vi.mock('@/lib/server/journey-status-source', () => ({ readJourneySourceStatus: vi.fn() }))

const principal: AgentAccessPrincipal = {
  principalId: 'prn_00000000000040008000000000000044', ownerId: 'acc_00000000000040008000000000000044',
  credentialId: 'crd_test', applicationRef: 'app_test', environment: 'production',
  scopes: ['market_tools:call'], authorityMode: 'spending_policy',
}
const callRef = `operation-invocation:v1:${'a'.repeat(64)}`
const quoteRef = `operation-commitment:v1:${'b'.repeat(64)}`
const toolRef = `operation:v1:${'c'.repeat(64)}`
const turnRef = 'turn_00000000-0000-4000-8000-000000000001'
const readCallStatus = vi.fn(async () => ({ kind: 'found' as const, callRef, version: 3, toolRef, state: 'in_progress' as const }))
const context = { request: new Request('https://ae.test/status'), agentAccessPrincipal: principal,
  callService: { readCallStatus }, correlationId: 'corr-1' }

async function status(kind: 'call' | 'quote' | 'turn', ref: string) {
  return await journeyStatusAction.run({ data: { ref: { kind, ref } }, context } as never)
}

describe('journey.status read projection', () => {
  it('reads the same CallRef and offers only same-ref recovery, without executing a mutation', async () => {
    const result = await status('call', callRef)
    expect(result).toMatchObject({ kind: 'call', ref: callRef, recovery: { state: 'in_progress' }, workState: 'working',
      next: [{ action: 'status', args: { ref: { kind: 'call', ref: callRef } } }, { action: 'wait', args: { callRef, afterVersion: 3 } }] })
    expect(readCallStatus).toHaveBeenCalledOnce()
    expect(readJourneySourceStatus).not.toHaveBeenCalled()
    expect(journeyStatusAction.outputSchema.parse(result)).toEqual(result)
  })

  it('reads a committed Quote and a Turn under the principal without a write', async () => {
    vi.mocked(readJourneySourceStatus).mockResolvedValueOnce({ quoteRef, principalRef: principal.principalId,
      toolRef, state: 'committed', expiresAt: Date.now() + 1000, maxSpend: { currency: 'AUD', units: '2000', exponent: 6 }, currency: 'AUD' })
    vi.mocked(readJourneySourceStatus).mockResolvedValueOnce({ turnRef, threadId: 'thread-1', state: 'working', inFlightCallRefs: [callRef] })
    const quote = await status('quote', quoteRef)
    const turn = await status('turn', turnRef)
    expect(quote).toMatchObject({ kind: 'quote', ref: quoteRef, commitment: 'committed', next: [{ action: 'describe', args: { toolRef } }] })
    expect(turn).toMatchObject({ kind: 'turn', ref: turnRef, workState: 'working', next: [
      { action: 'status', args: { ref: { kind: 'turn', ref: turnRef } } },
      { action: 'status', args: { ref: { kind: 'call', ref: callRef } } },
    ] })
    expect(vi.mocked(readJourneySourceStatus).mock.calls.map(([kind]) => kind)).toEqual(['quote', 'turn'])
    expect(journeyStatusAction.outputSchema.parse(quote)).toEqual(quote)
    expect(journeyStatusAction.outputSchema.parse(turn)).toEqual(turn)
  })
})
