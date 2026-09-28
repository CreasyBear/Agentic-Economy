// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'
import type { AgentSpendingPolicyState } from '@/modules/agent-access/spending-policy-update'
import { agentFacts, agentSpendingPolicyFacts } from '../agent-operator-console-model'
import { useAgentSpendingLimits } from './useAgentSpendingLimits'

const known: Extract<AgentSpendingPolicyState, { kind: 'known' }> = {
  kind: 'known', principalRef: 'prin_hook', grantRef: 'grant_hook', generation: 4,
  spendingPolicyDigest: 'digest_hook', expiresAt: Date.now() + 86_400_000, paused: false,
  maximumSpendPerCall: { currency: 'AUD', units: '5000000', exponent: 6 },
  maximumDailySpend: { currency: 'AUD', units: '25000000', exponent: 6 },
  maximumMonthlySpend: { currency: 'AUD', units: '100000000', exponent: 6 },
}
const detail: AgentDetail = {
  agent: { principalRef: known.principalRef, principalRevision: 1, displayName: 'Hook Agent',
    applicationRef: 'app_test', environment: 'production', status: 'connected',
    currentCredentialGeneration: 99, connectionCount: 0, connectorDisplayNames: [],
    authorityMode: 'spending_policy', spendingPolicy: known },
  spendingPolicy: known, connections: [], credentials: [], authorityMode: 'spending_policy',
  scopes: [], activity: [], dataState: 'source',
}

afterEach(() => vi.clearAllMocks())

describe('useAgentSpendingLimits', () => {
  it('blocks edits when the selected sheet refresh cannot read an expected grant', async () => {
    const read = vi.fn().mockResolvedValue({ kind: 'unavailable' })
    const update = vi.fn()
    const { result } = renderHook(() => useAgentSpendingLimits({ detail, onReadSpendingLimits: read, onUpdateSpendingLimits: update }))
    await waitFor(() => expect(result.current.policy.kind).toBe('unavailable'))
    expect(result.current.view.showHeaderActions).toBe(false)
    expect(result.current.view.readout.monthlyDisplay).toBe('—')
    act(() => result.current.handleStartEdit())
    expect(result.current.view.editing).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('only calls verified absence unset, not a failed read', async () => {
    const read = vi.fn().mockResolvedValue({ kind: 'unset' })
    const { result } = renderHook(() => useAgentSpendingLimits({ detail, onReadSpendingLimits: read }))
    await waitFor(() => expect(result.current.policy.kind).toBe('unset'))
    expect(result.current.view.showHeaderActions).toBe(false)
  })

  it('never falls back to credential generation when prewrite owner read expires', async () => {
    const read = vi.fn().mockResolvedValueOnce(known).mockResolvedValueOnce(known)
      .mockResolvedValueOnce({ kind: 'expired', expiresAt: Date.now() - 1 })
    const update = vi.fn()
    const { result } = renderHook(() => useAgentSpendingLimits({ detail, onReadSpendingLimits: read, onUpdateSpendingLimits: update }))
    await waitFor(() => expect(result.current.view.showHeaderActions).toBe(true))
    act(() => result.current.handleStartEdit())
    await waitFor(() => expect(result.current.view.editing).toBe(true))
    await act(async () => result.current.handleSave({ preventDefault: vi.fn() }))
    expect(result.current.policy.kind).toBe('expired')
    expect(result.current.view.editing).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('restores previously verified custom limits after another session pauses the Agent', async () => {
    const zero = { currency: 'AUD' as const, units: '0', exponent: 6 }
    const paused = {
      ...known, grantRef: 'grant_paused', generation: 5, spendingPolicyDigest: 'digest_paused',
      paused: true, maximumSpendPerCall: zero, maximumDailySpend: zero, maximumMonthlySpend: zero,
    }
    const read = vi.fn().mockResolvedValue(paused)
    const update = vi.fn().mockResolvedValue({
      kind: 'completed', principalRef: known.principalRef, grantRef: 'grant_resumed',
      generation: 6, spendingPolicyDigest: 'digest_resumed', correlationRef: 'corr_resumed',
    })
    const { result } = renderHook(() => useAgentSpendingLimits({ detail, onReadSpendingLimits: read, onUpdateSpendingLimits: update }))
    await waitFor(() => expect(result.current.policy).toMatchObject({ kind: 'known', paused: true }))
    act(() => result.current.handleTogglePause())
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(update).toHaveBeenCalledWith({
      principalRef: known.principalRef, expectedGeneration: 5,
      maximumSpendPerCall: known.maximumSpendPerCall,
      maximumDailySpend: known.maximumDailySpend,
      maximumMonthlySpend: known.maximumMonthlySpend,
    })
  })

  it('requires explicit limits to resume when a paused policy has no verified previous budget', async () => {
    const zero = { currency: 'AUD' as const, units: '0', exponent: 6 }
    const paused = {
      ...known, paused: true,
      maximumSpendPerCall: zero, maximumDailySpend: zero, maximumMonthlySpend: zero,
    }
    const pausedDetail: AgentDetail = {
      ...detail, spendingPolicy: paused, agent: { ...detail.agent, spendingPolicy: paused },
    }
    const read = vi.fn().mockResolvedValue(paused)
    const update = vi.fn()
    const { result } = renderHook(() => useAgentSpendingLimits({
      detail: pausedDetail, onReadSpendingLimits: read, onUpdateSpendingLimits: update,
    }))
    await waitFor(() => expect(result.current.view.showHeaderActions).toBe(true))
    expect(result.current.view.restoreAvailable).toBe(false)
    act(() => result.current.handleTogglePause())
    await waitFor(() => expect(result.current.view.editing).toBe(true))
    expect(result.current.view.perCallStr).toBe('')
    expect(update).not.toHaveBeenCalled()
  })

  it('shows buyer limits rounded up to cents without changing the exact policy', () => {
    const subcentPolicy: Extract<AgentSpendingPolicyState, { kind: 'known' }> = {
      ...known,
      maximumSpendPerCall: { currency: 'AUD', units: '1', exponent: 6 },
      maximumDailySpend: { currency: 'AUD', units: '10001', exponent: 6 },
      maximumMonthlySpend: { currency: 'AUD', units: '1234567', exponent: 6 },
    }
    const subcentDetail: AgentDetail = {
      ...detail, spendingPolicy: subcentPolicy, agent: { ...detail.agent, spendingPolicy: subcentPolicy },
    }
    const { result } = renderHook(() => useAgentSpendingLimits({ detail: subcentDetail }))

    expect(result.current.view.readout).toEqual({
      perCallDisplay: 'A$0.01', dailyDisplay: 'A$0.02', monthlyDisplay: 'A$1.24',
    })
    expect(agentFacts(subcentDetail).find((fact) => fact.label === 'Monthly limit')?.value).toBe('A$1.24')
    expect(agentSpendingPolicyFacts(subcentDetail).slice(1, 4).map((fact) => fact.value))
      .toEqual(['A$0.01', 'A$0.02', 'A$1.24'])
    expect(result.current.policy).toBe(subcentPolicy)
  })

})
