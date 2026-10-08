/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlanOwnerStatus } from '@/components/ae/plans/usePlanOwnerStatus'
import type { OwnerPlanPageRead } from '@/modules/capability-execution/plan/owner.contracts'
import { planGetResultSchema } from '@/modules/capability-execution/plan/runtime.schemas'
import { parsePlan, planQuoteResultSchema } from '@/modules/capability-execution/plan/parse'

const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, userId: 'owner:first', sessionId: 'session:first', orgId: null as string | null }))
const read = vi.hoisted(() => vi.fn())
vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: () => auth }))
vi.mock('@/modules/capability-execution/plan/owner.functions', () => ({ readOwnerPlanServer: read }))
vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: vi.fn() }))
const toolRef = `operation:v1:${'a'.repeat(64)}`
const parsed = parsePlan({ nodes: [{ id: 'lookup', toolRef, input: { city: 'Sydney' }, dependsOn: [] }] })
if ('kind' in parsed) throw new Error('invalid fixture')
const fixturePlan = parsed
function available(planRef = 'plan:ui'): OwnerPlanPageRead {
  const quote = planQuoteResultSchema.parse({ kind: 'quoted', planRef, planDigest: 'sha256:ui',
    nodes: [{ nodeId: 'lookup', toolRef, inputMode: 'literal', priceClass: 'unknown', pricingDigest: 'sha256:price', ceilingAudUnits: '1000000', rateToleranceBps: 50, validation: 'typed', dependsOn: [] }],
    stages: [['lookup']], approvedTotalAudUnits: '1000000', currency: 'AUD', exponent: 6, expiresAt: 2000, dataFlows: [] })
  const progress = planGetResultSchema.parse({ kind: 'available', planRef, planDigest: 'sha256:ui', state: 'running',
    approvedTotalAudUnits: '1000000', currency: 'AUD', exponent: 6, expiresAt: 2000, runDeadlineAt: 3000,
    stages: [['lookup']], maximumConcurrentNodes: 1, dataFlows: [],
    nodes: [{ nodeId: 'lookup', toolRef, providerHost: 'provider.example', state: 'admitted', dependsOn: [], ceilingAudUnits: '1000000', callRef: 'call:ui' }],
    hold: { status: 'reserved', heldAudUnits: '1000000', settledAudUnits: '0', releasedAudUnits: '0' } })
  if (progress.kind !== 'available') throw new Error('invalid fixture')
  return { kind: 'available', plan: fixturePlan, quote, progress, callStatuses: [] }
}
beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(auth, { isLoaded: true, isSignedIn: true, userId: 'owner:first', sessionId: 'session:first', orgId: null })
  read.mockReset()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('retained owner Plan facts', () => {
  it('keeps confirmed facts displayable after a failed poll, retries and clears the stale guard after success', async () => {
    const initial = available()
    read.mockRejectedValueOnce(new Error('transport unavailable')).mockResolvedValueOnce(initial)
    const { result } = renderHook(() => usePlanOwnerStatus(initial, 'plan:ui', false))
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(result.current.result).toBe(initial)
    expect(result.current.stale).toBe(true)
    expect(result.current.readProblem).toContain('Last confirmed results remain visible')
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(read).toHaveBeenCalledTimes(2)
    expect(result.current.stale).toBe(false)
    expect(result.current.readProblem).toBeUndefined()
  })

  it('clears retained facts on explicit access denial and on authentication failures', async () => {
    read.mockResolvedValueOnce({ kind: 'refused', code: 'plan_access_denied' })
    const initial = available()
    const { result } = renderHook(() => usePlanOwnerStatus(initial, 'plan:ui', false))
    await act(async () => { await result.current.refresh() })
    expect(result.current.result).toEqual({ kind: 'refused', code: 'plan_access_denied' })
    read.mockRejectedValueOnce(new Error('unauthenticated'))
    await act(async () => { await result.current.refresh() })
    expect(result.current.result).toBeUndefined()
    expect(result.current.readProblem).toContain('Access to this Plan could not be confirmed')
  })

  it('hides the prior Account facts immediately and ignores its in-flight response after identity changes', async () => {
    let resolveOld: ((value: OwnerPlanPageRead) => void) | undefined
    const oldRead = new Promise<OwnerPlanPageRead>(resolve => { resolveOld = resolve })
    read.mockReturnValueOnce(oldRead).mockResolvedValueOnce({ kind: 'refused', code: 'plan_access_denied' })
    const initial = available()
    const { result, rerender } = renderHook(() => usePlanOwnerStatus(initial, 'plan:ui', false))
    act(() => { void result.current.refresh() })
    auth.userId = 'owner:second'; auth.sessionId = 'session:second'
    rerender()
    expect(result.current.result).toBeUndefined()
    await act(async () => { await Promise.resolve() })
    expect(result.current.result).toEqual({ kind: 'refused', code: 'plan_access_denied' })
    await act(async () => { resolveOld?.(available()); await oldRead })
    expect(result.current.result).toEqual({ kind: 'refused', code: 'plan_access_denied' })
    auth.isSignedIn = false
    rerender()
    expect(result.current.result).toBeUndefined()
    expect(result.current.authenticated).toBe(false)
  })

  it('does not claim retained facts when no Plan was available before the read failure', async () => {
    const initial = { kind: 'refused', code: 'plan_not_found' } as const
    read.mockRejectedValueOnce(new Error('transport unavailable'))
    const { result } = renderHook(() => usePlanOwnerStatus(initial, 'plan:ui', false))
    await act(async () => { await result.current.refresh() })
    expect(result.current.result).toBeUndefined()
    expect(result.current.readProblem).not.toContain('remain visible')
  })

  it('does not retain results when a read returns another Plan', async () => {
    read.mockResolvedValueOnce(available('plan:other'))
    const initial = available()
    const { result } = renderHook(() => usePlanOwnerStatus(initial, 'plan:ui', false))
    await act(async () => { await result.current.refresh() })
    expect(result.current.result).toBeUndefined()
    expect(result.current.readProblem).toContain('another Plan')
  })
})
