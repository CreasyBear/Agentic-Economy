import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleJourneyStatusGet } from '@/lib/server/journey-status-api'
import { readJourneySourceStatus } from '@/lib/server/journey-status-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import type { CallService } from '@/modules/capability-execution/call-authority'

vi.mock('@/lib/server/journey-status-source', () => ({ readJourneySourceStatus: vi.fn() }))
const principal = {
  principalId: `prn_${'1'.repeat(32)}`, ownerId: `acc_${'2'.repeat(32)}`,
  credentialId: 'credential:one', applicationRef: 'agentic-economy', environment: 'sandbox' as const,
  scopes: ['market_tools:call'], authorityMode: 'read_only' as const,
}
const toolRef = `operation:v1:${'a'.repeat(64)}`
const callRef = `operation-invocation:v1:${'b'.repeat(64)}`
const quoteRef = `operation-commitment:v1:${'c'.repeat(64)}`
const turnRef = 'turn_00000000-0000-4000-8000-000000000001'
const authenticate = async () => ({ isAuthenticated: true as const, tokenType: 'api_key' as const,
  id: principal.credentialId, subject: 'user_status', scopes: principal.scopes })
const readCallStatus = vi.fn(async () => ({ kind: 'found' as const, callRef, version: 1, toolRef, state: 'in_progress' as const }))
const options = { authenticate, resolvePrincipal: async () => principal,
  callService: { readCallStatus } as unknown as CallService }
function request(ref: string) { return new Request(`https://ae.test/api/v1/status/${ref}`) }

describe('GET /api/v1/status/{ref}', () => {
  afterEach(() => { setHttpRateLimitAdmissionForTests(undefined); vi.clearAllMocks() })

  it('rejects malformed refs before a read or admission', async () => {
    const result = await handleJourneyStatusGet(request('operation-commitment:v1:bad'), 'operation-commitment:v1:bad', options)
    expect(result.status).toBe(400)
    expect(result.headers.get('content-type')).toBe('application/problem+json')
    expect(await result.json()).toMatchObject({ code: 'malformed_ref', next: [] })
    expect(readCallStatus).not.toHaveBeenCalled()
  })

  it('requires buyer authentication for Tool status as well as private refs', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const authenticate = vi.fn(async () => ({ isAuthenticated: false as const, tokenType: null, id: null, subject: null, scopes: null }))
    const result = await handleJourneyStatusGet(request(toolRef), toolRef, { authenticate })
    expect(result.status).toBe(401)
    expect(authenticate).toHaveBeenCalledOnce()
  })

  it('requires buyer authentication before any Call status read', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const result = await handleJourneyStatusGet(request(callRef), callRef, {
      authenticate: async () => ({ isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null }),
      callService: options.callService,
    })
    expect(result.status).toBe(401)
    expect(readCallStatus).not.toHaveBeenCalled()
  })

  it('maps a revoked Call authority to a permission problem, not working status', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    readCallStatus.mockResolvedValueOnce({ kind: 'refused', callRef, code: 'grant_revoked', retryable: false } as never)
    const result = await handleJourneyStatusGet(request(callRef), callRef, options)
    expect(result.status).toBe(403)
    expect(await result.json()).toMatchObject({ code: 'principal_denied', next: [] })
  })

  it('returns kind-specific Call, Quote and Turn snapshots using only read services', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    vi.mocked(readJourneySourceStatus).mockResolvedValueOnce({ quoteRef, principalRef: principal.principalId, toolRef,
      state: 'committed', expiresAt: Date.now() + 1000,
      maxSpend: { currency: 'AUD', units: '2000', exponent: 6 }, currency: 'AUD' })
    vi.mocked(readJourneySourceStatus).mockResolvedValueOnce({ turnRef, threadId: 'thread-1', state: 'working', inFlightCallRefs: [] })
    const call = await handleJourneyStatusGet(request(callRef), callRef, options)
    const quote = await handleJourneyStatusGet(request(quoteRef), quoteRef, options)
    const turn = await handleJourneyStatusGet(request(turnRef), turnRef, options)
    expect([call.status, quote.status, turn.status]).toEqual([200, 200, 200])
    expect(await call.json()).toMatchObject({ kind: 'call', ref: callRef, workState: 'working' })
    expect(await quote.json()).toMatchObject({ kind: 'quote', ref: quoteRef, commitment: 'committed' })
    expect(await turn.json()).toMatchObject({ kind: 'turn', ref: turnRef, workState: 'working' })
    expect(readCallStatus).toHaveBeenCalledOnce()
    expect(vi.mocked(readJourneySourceStatus).mock.calls.map(([kind]) => kind)).toEqual(['quote', 'turn'])
  })
})
