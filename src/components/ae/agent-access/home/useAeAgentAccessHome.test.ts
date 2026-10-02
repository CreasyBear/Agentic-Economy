// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClerkRuntimeError } from '@clerk/shared/error'
import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'

const mocks = vi.hoisted(() => ({
  update: vi.fn(), decide: vi.fn(), readDirectory: vi.fn(), readPolicy: vi.fn(), readApprovals: vi.fn(),
  navigate: vi.fn(), capture: vi.fn(), noop: vi.fn(), prompts: 0, cancel: false,
}))
vi.mock('@tanstack/react-router', () => ({ useLocation: () => ({ hash: '' }), useNavigate: () => mocks.navigate }))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/lib/server/agent-access-console.functions', () => ({
  readAgentDirectoryServer: mocks.readDirectory, readAgentDirectoryPageServer: mocks.noop,
}))
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

function renderHome() {
  return renderHook(() => useAeAgentAccessHome({ canonicalBaseUrl: 'https://ae.example.test',
    initialDirectory: directory, search: {} }))
}

beforeEach(() => {
  mocks.prompts = 0
  mocks.cancel = false
  mocks.readApprovals.mockResolvedValue([])
  mocks.readDirectory.mockResolvedValue(directory)
})
afterEach(() => { vi.resetAllMocks() })

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
