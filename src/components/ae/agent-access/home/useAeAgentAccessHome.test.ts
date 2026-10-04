// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClerkRuntimeError } from '@clerk/shared/error'
import type { AgentOnboardingRequest } from '@/modules/agent-access/public'
import type { AgentDetail, AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'

const mocks = vi.hoisted(() => ({
  readRequest: vi.fn(), update: vi.fn(), decide: vi.fn(), readDirectory: vi.fn(), readPolicy: vi.fn(), readApprovals: vi.fn(),
  navigate: vi.fn(), capture: vi.fn(), noop: vi.fn(), prompts: 0, cancel: false,
}))
vi.mock('@tanstack/react-router', () => ({ useLocation: () => ({ hash: '' }), useNavigate: () => mocks.navigate }))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/lib/server/agent-access-console.functions', () => ({
  readAgentDirectoryServer: mocks.readDirectory, readAgentDirectoryPageServer: mocks.noop,
}))
vi.mock('@/lib/server/agent-access-consent.functions', () => ({ readAgentOnboardingRequestServer: mocks.readRequest }))
vi.mock('@/modules/agent-access/agent-access.functions', () => ({
  updateAgentSpendingLimitsServer: mocks.update, readAgentSpendingLimitsServer: mocks.readPolicy,
  disconnectAgentServer: mocks.noop, revokeOwnerConnectionServer: mocks.noop, renameAgentServer: mocks.noop,
}))
vi.mock('@/modules/capability-execution/call-approval.functions', () => ({
  listPendingCallApprovalsServer: mocks.readApprovals, decideCallApprovalServer: mocks.decide,
}))
vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: mocks.capture }))
// External Clerk boundary: the actual typed reverification wrapper processes
// the server refusal and retries the exact supplied command.
vi.mock('@clerk/tanstack-react-start', () => ({
  useReverification: (request: (...args: unknown[]) => Promise<unknown>) => async (...args: unknown[]) => {
    const result = await request(...args)
    if (typeof result === 'object' && result !== null && 'clerk_error' in result) {
      mocks.prompts += 1
      if (mocks.cancel) throw new ClerkRuntimeError('Verification cancelled', { code: 'reverification_cancelled' })
      return await request(...args)
    }
    return result
  },
}))

import { useAeAgentAccessHome } from './useAeAgentAccessHome'

const directory: AgentDirectoryProjection = { items: [], details: [], activityCoverage: 'complete' }
const params = { principalRef: 'prn_agent', expectedGeneration: 1,
  maximumSpendPerCall: { currency: 'AUD', units: '2000000', exponent: 6 },
  maximumDailySpend: { currency: 'AUD', units: '5000000', exponent: 6 },
  maximumMonthlySpend: { currency: 'AUD', units: '20000000', exponent: 6 } }
const completed = { kind: 'completed', principalRef: params.principalRef, grantRef: 'grt_next', generation: 2,
  spendingPolicyDigest: 'sha256:next', correlationRef: 'corr-next' }

function renderHome(initialDirectory = directory, search: { caller?: string; resumeTool?: string } = {}) {
  return renderHook(() => useAeAgentAccessHome({ canonicalBaseUrl: 'https://ae.example.test',
    initialDirectory, search }))
}

beforeEach(() => {
  mocks.prompts = 0
  mocks.cancel = false
  mocks.readApprovals.mockResolvedValue([])
  mocks.readDirectory.mockResolvedValue(directory)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.resetAllMocks() })

describe('spending MFA client command', () => {
  it('retries the same key and limits after MFA, with no prompt for a completed reduction', async () => {
    mocks.update.mockResolvedValueOnce({ kind: 'refused', code: 'mfa_reverification_required', correlationRef: 'corr' })
      .mockResolvedValueOnce(completed).mockResolvedValueOnce(completed)
    const { result } = renderHome()
    await act(async () => { expect(await result.current.onUpdateSpendingLimits(params)).toEqual(completed) })
    expect(mocks.prompts).toBe(1)
    expect(mocks.update.mock.calls[0]?.[0]).toEqual(mocks.update.mock.calls[1]?.[0])
    expect(mocks.update.mock.calls[0]?.[0].data).toMatchObject(params)
    const lower = { ...params, expectedGeneration: 2, maximumSpendPerCall: { ...params.maximumSpendPerCall, units: '1000000' } }
    await act(async () => { await result.current.onUpdateSpendingLimits(lower) })
    expect(mocks.prompts).toBe(1)
  })

  it('retains the command key after cancellation without reporting a source failure', async () => {
    mocks.cancel = true
    mocks.update.mockResolvedValueOnce({ kind: 'refused', code: 'mfa_reverification_required', correlationRef: 'corr' })
      .mockResolvedValueOnce(completed)
    const { result } = renderHome()
    await act(async () => {
      expect(await result.current.onUpdateSpendingLimits(params)).toMatchObject({ kind: 'refused', code: 'mfa_reverification_required' })
    })
    expect(mocks.capture).not.toHaveBeenCalled()
    mocks.cancel = false
    await act(async () => { await result.current.onUpdateSpendingLimits(params) })
    expect(mocks.update.mock.calls[0]?.[0]).toEqual(mocks.update.mock.calls[1]?.[0])
  })

  it('retains an uncertain command key and allocates a new one only for changed reviewed limits', async () => {
    mocks.update.mockRejectedValueOnce(new Error('lost acknowledgement')).mockResolvedValue(completed)
    const { result } = renderHome()
    await act(async () => { await result.current.onUpdateSpendingLimits(params) })
    await act(async () => { await result.current.onUpdateSpendingLimits(params) })
    expect(mocks.update.mock.calls[0]?.[0]).toEqual(mocks.update.mock.calls[1]?.[0])
    await act(async () => { await result.current.onUpdateSpendingLimits({ ...params, expectedGeneration: 2 }) })
    expect(mocks.update.mock.calls[2]?.[0].data.idempotencyKey).not.toBe(mocks.update.mock.calls[1]?.[0].data.idempotencyKey)
  })
})

describe('owner Call approval MFA', () => {
  it('retries the same Call decision after verification and leaves denials prompt-free', async () => {
    mocks.decide.mockResolvedValueOnce({ kind: 'refused', code: 'mfa_reverification_required' })
      .mockResolvedValueOnce({ kind: 'approved', callRef: 'call-one' })
      .mockResolvedValueOnce({ kind: 'denied', callRef: 'call-two' })
    const { result } = renderHome()
    await act(async () => { result.current.onDecideApproval('call-one', 'Tool one', 'approve') })
    expect(mocks.prompts).toBe(1)
    expect(mocks.decide.mock.calls[0]?.[0]).toEqual(mocks.decide.mock.calls[1]?.[0])
    expect(mocks.decide.mock.calls[1]?.[0]).toEqual({ data: { callRef: 'call-one', decision: 'approve' } })
    expect(result.current.approvalStatus).toBe('Tool one approved once.')
    await act(async () => { result.current.onDecideApproval('call-two', 'Tool two', 'deny') })
    expect(mocks.prompts).toBe(1)
    expect(result.current.approvalStatus).toBe('Tool two declined.')
  })

  it('leaves a cancelled decision available without reporting an uncertain outcome', async () => {
    mocks.cancel = true
    mocks.decide.mockResolvedValueOnce({ kind: 'refused', code: 'mfa_reverification_required' })
    const { result } = renderHome()
    await act(async () => { result.current.onDecideApproval('call-one', 'Tool one', 'approve') })
    expect(mocks.decide).toHaveBeenCalledTimes(1)
    expect(result.current.approvalDecision).toBeUndefined()
    expect(result.current.approvalStatus).toBeUndefined()
    expect(result.current.approvalsError).toBeUndefined()
    expect(mocks.capture).not.toHaveBeenCalled()
  })

  it('shows the MFA requirement after one unsuccessful verification attempt', async () => {
    mocks.decide.mockResolvedValue({ kind: 'refused', code: 'mfa_reverification_required' })
    const { result } = renderHome()
    await act(async () => { result.current.onDecideApproval('call-one', 'Tool one', 'approve') })
    expect(mocks.prompts).toBe(1)
    expect(mocks.decide).toHaveBeenCalledTimes(2)
    expect(result.current.approvalsError).toBe('Verify with two-factor authentication to continue.')
    expect(result.current.approvalStatus).toBeUndefined()
  })
})

const liveDetail: AgentDetail = {
  agent: { principalRef: 'prn_live', principalRevision: 1, displayName: 'Research Agent', applicationRef: 'ae', environment: 'sandbox',
    status: 'connected', authorityMode: 'approval_required', spendingPolicy: { kind: 'unavailable' }, connectionCount: 1, connectorDisplayNames: ['Codex'] },
  connections: [], credentials: [{ credentialRef: 'crd_live', generation: 1, lifecycle: 'active', issuedAt: 1, expiresAt: 999 }],
  currentCredentialRef: 'crd_live', authorityMode: 'approval_required', scopes: ['market_tools:call'], spendingPolicy: { kind: 'unavailable' }, activity: [], dataState: 'source',
}
const liveDirectory = (detail: AgentDetail): AgentDirectoryProjection => ({ items: [detail.agent], details: [detail] })

describe('live Agent onboarding observation', () => {
  it('updates authentication, queued work, running work and receipt without an owner refresh or write', async () => {
    vi.useFakeTimers()
    const authed = { ...liveDetail, credentials: [{ ...liveDetail.credentials[0]!, lastAuthenticatedAt: 2 }] }
    const identity = { callRef: 'call_live', credentialRef: 'crd_live', toolRef: 'tool_live', createdAt: 3, updatedAt: 4 }
    const delivered = { ...authed, activity: [{ ...identity, toolLabel: 'Research', providerRef: 'provider_live', state: 'completed' as const,
      deliveryState: 'delivered' as const, paymentState: 'settled' as const, receiptRef: 'receipt_live' }], liveCalls: [{ ...identity, phase: 'finished' as const }] }
    mocks.readDirectory.mockResolvedValueOnce(liveDirectory(authed))
      .mockResolvedValueOnce(liveDirectory({ ...authed, liveCalls: [{ ...identity, phase: 'queued' }] }))
      .mockResolvedValueOnce(liveDirectory({ ...authed, liveCalls: [{ ...identity, phase: 'running' }] }))
      .mockResolvedValueOnce(liveDirectory(delivered))
    const { result } = renderHome(liveDirectory(liveDetail), { caller: 'prn_live' })
    expect(result.current.firstUse.kind).toBe('authorized')
    for (const kind of ['authenticated', 'running', 'running', 'delivered']) {
      await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
      expect(result.current.firstUse.kind).toBe(kind)
      expect(result.current.loading).toBe(false)
    }
    expect(result.current.firstUse).toMatchObject({ kind: 'delivered', call: { callRef: 'call_live', receiptRef: 'receipt_live' } })
    expect(mocks.readDirectory.mock.calls.every(([input]) => input.data.principalRef === 'prn_live')).toBe(true)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.decide).not.toHaveBeenCalled()
  })

  it('retains confirmed progress on an outage and backs off before recovering', async () => {
    vi.useFakeTimers()
    mocks.readDirectory.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(liveDirectory(liveDetail))
    const { result } = renderHome(liveDirectory(liveDetail), { caller: 'prn_live' })
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(result.current.liveUpdates).toBe('delayed')
    expect(result.current.firstUse.kind).toBe('unavailable')
    expect(result.current.directory.details).toEqual([liveDetail])
    expect(result.current.directoryError).toBeUndefined()
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(mocks.readDirectory).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(mocks.readDirectory).toHaveBeenCalledTimes(2)
    expect(result.current.liveUpdates).toBe('current')
  })

  it('retains the original Call when a successful read reports an unavailable source', async () => {
    vi.useFakeTimers()
    const identity = { callRef: 'call_retained', credentialRef: 'crd_live', toolRef: 'tool_live', createdAt: 3, updatedAt: 4 }
    const running = { ...liveDetail, liveCalls: [{ ...identity, phase: 'running' as const }] }
    mocks.readDirectory.mockResolvedValueOnce(liveDirectory({ ...liveDetail, dataState: 'unavailable' }))
      .mockResolvedValue(liveDirectory(running))
    const { result } = renderHome(liveDirectory(running), { caller: 'prn_live' })
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(result.current.liveUpdates).toBe('delayed')
    expect(result.current.firstUse).toMatchObject({ kind: 'running', call: { callRef: 'call_retained' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(result.current.liveUpdates).toBe('current')
    expect(result.current.firstUse).toMatchObject({ kind: 'running', call: { callRef: 'call_retained' } })
  })

  it('pauses hidden pages, resumes immediately, coalesces manual reads and stops after unmount', async () => {
    vi.useFakeTimers()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    let resolveRead!: (value: AgentDirectoryProjection) => void
    mocks.readDirectory.mockReturnValue(new Promise<AgentDirectoryProjection>(resolve => { resolveRead = resolve }))
    const { result, unmount } = renderHome(liveDirectory(liveDetail), { caller: 'prn_live' })
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(mocks.readDirectory).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await act(async () => { result.current.onDirectoryRetry(); await vi.advanceTimersByTimeAsync(15_000) })
    expect(mocks.readDirectory).toHaveBeenCalledTimes(1)
    unmount()
    await act(async () => { resolveRead(liveDirectory({ ...liveDetail, dataState: 'unavailable' })); await vi.advanceTimersByTimeAsync(15_000) })
    expect(mocks.readDirectory).toHaveBeenCalledTimes(1)
    expect(result.current.firstUse.kind).toBe('authorized')
  })

  it('refreshes an Agent from a later page without dropping other loaded Agents', async () => {
    vi.useFakeTimers()
    const other = { ...liveDetail, agent: { ...liveDetail.agent, principalRef: 'prn_other' } }
    const initial = { items: [other.agent, liveDetail.agent], details: [other, liveDetail], nextCursor: 'opaque_next' }
    mocks.readDirectory.mockResolvedValue(liveDirectory({ ...liveDetail, credentials: [{ ...liveDetail.credentials[0]!, lastAuthenticatedAt: 2 }] }))
    const { result } = renderHome(initial, { caller: 'prn_live' })
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(result.current.firstUse.kind).toBe('authenticated')
    expect(result.current.directory.items.map(item => item.principalRef)).toEqual(['prn_other', 'prn_live'])
    expect(result.current.directory.nextCursor).toBe('opaque_next')
  })

  it('preserves pagination when a new Agent appears after an initially empty directory', async () => {
    vi.useFakeTimers()
    mocks.readDirectory.mockResolvedValue({ ...liveDirectory(liveDetail), nextCursor: 'opaque_more_agents' })
    const { result } = renderHome()
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(result.current.directory.nextCursor).toBe('opaque_more_agents')
    expect(result.current.firstUse.kind).toBe('choose_agent')
  })

  it('discards an in-flight observation when the owner switches Agents', async () => {
    vi.useFakeTimers()
    const other = { ...liveDetail, agent: { ...liveDetail.agent, principalRef: 'prn_other' } }
    const initial = { items: [liveDetail.agent, other.agent], details: [liveDetail, other] }
    let resolveOld!: (value: AgentDirectoryProjection) => void
    mocks.readDirectory.mockReturnValueOnce(new Promise<AgentDirectoryProjection>(resolve => { resolveOld = resolve }))
      .mockResolvedValue(liveDirectory({ ...other, credentials: [{ ...other.credentials[0]!, lastAuthenticatedAt: 2 }] }))
    const { result, rerender } = renderHook(({ caller }) => useAeAgentAccessHome({
      canonicalBaseUrl: 'https://ae.example.test', initialDirectory: initial, search: { caller },
    }), { initialProps: { caller: 'prn_live' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    rerender({ caller: 'prn_other' })
    await act(async () => { resolveOld(liveDirectory({ ...liveDetail, credentials: [{ ...liveDetail.credentials[0]!, lastAuthenticatedAt: 2 }] })) })
    expect(result.current.firstUse).toMatchObject({ kind: 'authorized', agent: { principalRef: 'prn_other' } })
    expect(result.current.directory.details.find(detail => detail.agent.principalRef === 'prn_live')?.credentials[0]?.lastAuthenticatedAt).toBeUndefined()
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(mocks.readDirectory.mock.calls[1]?.[0]).toEqual({ data: { principalRef: 'prn_other' } })
    expect(result.current.firstUse).toMatchObject({ kind: 'authenticated', agent: { principalRef: 'prn_other' } })
  })
})


describe('request to Agent to exact Call continuity', () => {
  it('follows pre-issuance, exchange and Calls, retains delayed reads and clears ownership refusal', async () => {
    vi.useFakeTimers()
    let request: AgentOnboardingRequest = { kind: 'request', grantRef: 'grant:exact', revision: 1, clientName: 'Codex',
      flow: 'authorization_code', environment: 'sandbox', phase: 'pending', createdAt: 1, expiresAt: 999 }
    const search = { grantRef: 'grant:exact', state: 'callback-state' }
    mocks.readRequest.mockImplementation(async () => request)
    mocks.readDirectory.mockResolvedValue(liveDirectory(liveDetail))
    const { result } = renderHook(() => useAeAgentAccessHome({ canonicalBaseUrl: 'https://ae.example', initialDirectory: directory, search }))
    await act(async () => {})
    expect(result.current.onboarding).toMatchObject({ phase: 'pending' })
    expect(mocks.readDirectory).not.toHaveBeenCalled()
    request = { ...request, phase: 'approved', revision: 2, principalRef: 'prn_live' }
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(result.current.firstUse).toMatchObject({ kind: 'authorized', agent: { principalRef: 'prn_live' } })
    request = { ...request, phase: 'exchanged', revision: 3 }
    const live = { callRef: 'call_original', credentialRef: 'old-key', toolRef: 'tool_live', createdAt: 3, updatedAt: 4, phase: 'running' as const }
    mocks.readDirectory.mockResolvedValue(liveDirectory({ ...liveDetail, liveCalls: [live] }))
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(result.current.firstUse).toMatchObject({ kind: 'running', access: { authenticated: false } })
    expect(mocks.navigate).toHaveBeenCalledWith(expect.objectContaining({ search: { ...search, caller: 'prn_live', callRef: 'call_original' }, replace: true }))
    request = { kind: 'unavailable' }
    const changed = { ...liveDetail, agent: { ...liveDetail.agent, authorityMode: 'read_only' as const }, liveCalls: [{ ...live, phase: 'recovery_required' as const }] }
    mocks.readDirectory.mockResolvedValue(liveDirectory(changed))
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(result.current.onboarding).toMatchObject({ phase: 'exchanged' })
    expect(result.current.liveUpdates).toBe('delayed')
    expect(result.current.firstUse).toMatchObject({ kind: 'recover', call: { callRef: 'call_original' }, access: { kind: 'browse_only' } })
    expect(mocks.readDirectory.mock.calls.at(-1)?.[0]).toEqual({ data: { principalRef: 'prn_live', callRef: 'call_original' } })
    request = { kind: 'refused', reason: 'owner_mismatch' }
    const reads = mocks.readDirectory.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(result.current.onboarding).toEqual(request)
    expect(result.current.directory).toEqual({ items: [], details: [] })
    expect(mocks.readDirectory).toHaveBeenCalledTimes(reads)
    expect(mocks.readRequest.mock.calls.every(([input]) => input.data.grantRef === 'grant:exact')).toBe(true)
    expect(mocks.decide).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('does not apply an old request after switching to another verification link', async () => {
    vi.useFakeTimers()
    let resolveOld!: (value: AgentOnboardingRequest) => void
    const observed = { kind: 'request' as const, grantRef: 'grant:new', revision: 1, clientName: 'Cursor', flow: 'device_code' as const,
      environment: 'sandbox' as const, phase: 'pending' as const, createdAt: 1, expiresAt: 999 }
    mocks.readRequest.mockReturnValueOnce(new Promise<AgentOnboardingRequest>(resolve => { resolveOld = resolve })).mockResolvedValue(observed)
    const { result, rerender } = renderHook(({ grantRef }) => useAeAgentAccessHome({ canonicalBaseUrl: 'https://ae.example', initialDirectory: directory, search: { grantRef } }),
      { initialProps: { grantRef: 'grant:old' } })
    rerender({ grantRef: 'grant:new' })
    await act(async () => { resolveOld({ ...observed, grantRef: 'grant:old', principalRef: 'prn_wrong' }) })
    expect(result.current.onboarding).toBeUndefined()
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(result.current.onboarding).toMatchObject({ grantRef: 'grant:new', clientName: 'Cursor' })
    expect(mocks.readDirectory).not.toHaveBeenCalled()
  })
  it('keeps request evidence when pinning a Call causes a delayed route bootstrap', async () => {
    const known: AgentOnboardingRequest = { kind: 'request', grantRef: 'grant:keep', revision: 3, clientName: 'Codex',
      flow: 'authorization_code', environment: 'sandbox', phase: 'exchanged', principalRef: 'prn_live', createdAt: 1, expiresAt: 999 }
    const search = { grantRef: 'grant:keep' }
    mocks.readRequest.mockResolvedValue({ kind: 'unavailable' })
    mocks.readDirectory.mockResolvedValue(liveDirectory(liveDetail))
    const { result, rerender } = renderHook<ReturnType<typeof useAeAgentAccessHome>, Readonly<{ initialOnboarding: AgentOnboardingRequest; caller: string }>>(({ initialOnboarding, caller }) => useAeAgentAccessHome({ canonicalBaseUrl: 'https://ae.example',
      initialDirectory: liveDirectory(liveDetail), initialOnboarding, search: { ...search, caller } }),
      { initialProps: { initialOnboarding: known, caller: 'prn_live' } })
    await act(async () => {})
    rerender({ initialOnboarding: { kind: 'unavailable' }, caller: 'prn_live' })
    await act(async () => {})
    expect(result.current.onboarding).toEqual(known)
    expect(result.current.liveUpdates).toBe('delayed')
  })

})
