import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import { convexTestWithMarketComponents } from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'

function journeyLogs(spy: ReturnType<typeof vi.spyOn>): Array<{ journey: string; outcome: string; good: boolean }> {
  return spy.mock.calls.flatMap((call: readonly [unknown, unknown]) => {
    const [prefix, body] = call
    if (prefix !== '[ae.journey]' || typeof body !== 'string') return []
    return [JSON.parse(body) as { journey: string; outcome: string; good: boolean }]
  })
}

describe('journey terminal emission', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits one quote signal from the quote action when admission refuses', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const backend = convexTestWithMarketComponents()
    const toolRef = `operation:v1:${'ab'.repeat(32)}`
    const quoted = await backend.action(api.capabilityQuotes.quote, await withSourceWrite('protected_action', {
      operationKey: 'test:journey:quote:missing-grant',
      correlationId: 'test:journey:quote:missing-grant',
      principal: {
        principalId: 'principal:journey-missing',
        ownerId: 'account:journey-missing',
        credentialId: 'credential:journey-missing',
        applicationRef: 'application:journey-missing',
        environment: 'sandbox' as const,
        scopes: ['market_tools:call'],
        authorityMode: 'approval_required' as const,
      },
      toolRef,
      input: { value: 'x402-validation' },
    }))

    expect(quoted).toMatchObject({ kind: 'refused', code: 'grant_not_found', retryable: false })
    expect(journeyLogs(info).filter((event) => event.journey === 'quote')).toEqual([
      { journey: 'quote', outcome: 'refused', good: false },
    ])
  })

  it('emits one call signal on the first pending refusal and none on replay', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const backend = convexTestWithMarketComponents()
    const callRef = `operation-invocation:v1:${'cd'.repeat(32)}`
    const identity = {
      callRef,
      principalId: 'principal:journey-call',
      credentialId: 'credential:journey-call',
      idempotencyKey: 'idempotency:journey-call',
    }
    await backend.run(async (ctx) => {
      await ctx.db.insert('capabilityCalls', {
        ...identity,
        ownerId: 'account:journey-call',
        applicationRef: 'application:journey-call',
        toolRef: `operation:v1:${'ef'.repeat(32)}`,
        quoteRef: `operation-commitment:v1:${'12'.repeat(32)}`,
        environment: 'sandbox',
        grantRef: 'grant:journey-call',
        grantGeneration: 1,
        policyDigest: 'sha256:journey-call',
        grantExpiresAt: Date.now() + 60_000,
        state: 'pending',
        inputDigest: 'sha256:journey-input',
        requestDigest: 'sha256:journey-request',
        toolJson: '{}',
        inputJson: '{}',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    })

    const first = await backend.mutation(internal.capabilityCalls.refuseUnclaimed, {
      ...identity,
      code: 'authority_denied',
      retryable: false,
    })
    const replay = await backend.mutation(internal.capabilityCalls.refuseUnclaimed, {
      ...identity,
      code: 'authority_denied',
      retryable: false,
    })

    expect(first).toEqual({ kind: 'refused', releaseRequired: false })
    expect(replay).toEqual({ kind: 'refused', releaseRequired: false })
    expect(journeyLogs(info).filter((event) => event.journey === 'call')).toEqual([
      { journey: 'call', outcome: 'refused', good: false },
    ])
  })
})
