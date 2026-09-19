// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'
import type { AgentSpendingLimitsResult } from '@/modules/agent-access/spending-policy-update'

import { useAgentSpendingLimits } from './useAgentSpendingLimits'

describe('useAgentSpendingLimits', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  const baseDetail: AgentDetail = {
    agent: {
      principalRef: 'prin_hook_test',
      principalRevision: 1,
      displayName: 'Hook Agent',
      applicationRef: 'app_test',
      environment: 'production',
      status: 'connected',
      currentCredentialGeneration: 1,
      connectionCount: 0,
      connectorDisplayNames: [],
      authorityMode: 'spending_policy',
    },
    connections: [],
    credentials: [],
    authorityMode: 'spending_policy',
    scopes: [],
    grant: {
      principalId: 'prin_hook_test',
      credentialId: 'cred_1',
      applicationRef: 'app_test',
      environment: 'production',
      authorityMode: 'spending_policy',
      toolAccess: 'all_admitted',
      toolRefs: [],
      lifecycle: 'active',
      expiresAt: 1705000000000,
      budget: {
        maximumSpendPerCall: { currency: 'AUD', units: '5000000', exponent: 6 },
        maximumDailySpend: { currency: 'AUD', units: '25000000', exponent: 6 },
        maximumMonthlySpend: { currency: 'AUD', units: '100000000', exponent: 6 },
        maximumConcurrentCalls: 1,
      },
      rate: { maximumCallsPerMinute: 60, maximumCallsPerHour: 1000 },
    },
    activity: [],
    dataState: 'source',
  }

  it('starts in read mode with formatted readout', () => {
    const { result } = renderHook(() =>
      useAgentSpendingLimits({
        detail: baseDetail,
        onUpdateSpendingLimits: vi.fn(),
      }),
    )

    expect(result.current.view.editing).toBe(false)
    expect(result.current.view.readout.perCallDisplay).toMatch(/A\$5\.00/)
    expect(result.current.view.showHeaderActions).toBe(true)
  })

  it('enters edit mode with decimal strings on handleStartEdit', () => {
    const { result } = renderHook(() =>
      useAgentSpendingLimits({
        detail: baseDetail,
        onUpdateSpendingLimits: vi.fn(),
      }),
    )

    act(() => {
      result.current.handleStartEdit()
    })

    expect(result.current.view.editing).toBe(true)
    expect(result.current.view.perCallStr).toBe('5')
    expect(result.current.view.dailyStr).toBe('25')
    expect(result.current.view.monthlyStr).toBe('100')
  })

  it('dispatches update with parsed amounts on save', async () => {
    const onUpdate = vi.fn().mockResolvedValue({
      kind: 'completed',
      principalRef: baseDetail.agent.principalRef,
      grantRef: 'grant_1',
      generation: 2,
      spendingPolicyDigest: 'digest',
      correlationRef: 'corr',
    } satisfies AgentSpendingLimitsResult)

    const onRead = vi.fn().mockResolvedValue({
      kind: 'current',
      principalRef: baseDetail.agent.principalRef,
      grantRef: 'grant_1',
      generation: 1,
      spendingPolicyDigest: 'digest',
      maximumSpendPerCall: baseDetail.grant!.budget.maximumSpendPerCall,
      maximumDailySpend: baseDetail.grant!.budget.maximumDailySpend,
      maximumMonthlySpend: baseDetail.grant!.budget.maximumMonthlySpend,
    })

    const { result } = renderHook(() =>
      useAgentSpendingLimits({
        detail: baseDetail,
        onUpdateSpendingLimits: onUpdate,
        onReadSpendingLimits: onRead,
      }),
    )

    act(() => {
      result.current.handleStartEdit()
    })

    await act(async () => {
      result.current.handleSave({ preventDefault: vi.fn() })
    })

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedGeneration: 1,
          maximumSpendPerCall: { currency: 'AUD', units: '5000000', exponent: 6 },
        }),
      )
    })
  })
})
