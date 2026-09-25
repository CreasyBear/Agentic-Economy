// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

import { toast } from '@/lib/ui/toast'
import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'
import type { AgentConnectionReadback } from '@/modules/agent-access/public'

import { useAgentLifecycleDialog } from './useAgentLifecycleDialog'

const detail: AgentDetail = {
  agent: {
    principalRef: 'prn_lifecycle_test',
    principalRevision: 1,
    displayName: 'Lifecycle Agent',
    applicationRef: 'app',
    environment: 'production',
    status: 'connected',
    currentCredentialGeneration: 2,
    connectionCount: 1,
    connectorDisplayNames: ['Codex'],
    authorityMode: 'spending_policy',
  },
  connections: [],
  credentials: [],
  authorityMode: 'spending_policy',
  scopes: [],
  activity: [],
  dataState: 'source',
}

const connection: AgentConnectionReadback = {
  connectionRef: 'connection_ref',
  revision: 7,
  principalRef: 'prn_lifecycle_test',
  agentDisplayName: 'Lifecycle Agent',
  connectorDisplayName: 'Codex',
  environment: 'production',
  state: 'active',
  authorityMode: 'spending_policy',
  toolAccess: 'all_admitted',
  toolRefs: [],
  spendingPolicy: {
    format: 'ae.agent-access-policy:v2',
    toolAccess: 'all_admitted',
    toolRefs: [],
    environment: 'production',
    budget: {
      budgetPolicyRef: 'budget:test',
      generation: 1,
      currency: 'AUD',
      exponent: 6,
      maximumSpendPerCall: { currency: 'AUD', units: '1', exponent: 6 },
      maximumDailySpend: { currency: 'AUD', units: '1', exponent: 6 },
      maximumMonthlySpend: { currency: 'AUD', units: '1', exponent: 6 },
      maximumConcurrentCalls: 1,
    },
    rate: { ratePolicyRef: 'rate:test', generation: 1, maximumCallsPerMinute: 1, maximumCallsPerHour: 1 },
  },
  commercialScopes: [],
  connectedAt: 1,
  lastRotatedAt: 1,
  accessExpiresAt: 1,
  connectionExpiresAt: 1,
  credentialGeneration: 1,
}

describe('useAgentLifecycleDialog', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('dispatches connection disconnect with revision', async () => {
    const onDisconnectConnection = vi.fn(async () => undefined)
    const { result } = renderHook(() => useAgentLifecycleDialog({
      onDisconnectAgent: vi.fn(),
      onDisconnectConnection,
    }))
    const trigger = document.createElement('button')

    act(() => {
      result.current.requestConnectionDisconnect(detail, connection, trigger)
    })
    await act(async () => {
      await result.current.confirmLifecycle()
    })

    expect(onDisconnectConnection).toHaveBeenCalledWith('connection_ref', 7)
    expect(toast.success).toHaveBeenCalledWith('Connection disconnected')
  })

  it('dispatches agent disconnect with principal ref only', async () => {
    const onDisconnectAgent = vi.fn(async () => undefined)
    const { result } = renderHook(() => useAgentLifecycleDialog({
      onDisconnectAgent,
    }))
    const trigger = document.createElement('button')

    act(() => {
      result.current.requestDisconnect(detail, trigger)
    })
    await act(async () => {
      await result.current.confirmLifecycle()
    })

    expect(onDisconnectAgent).toHaveBeenCalledWith('prn_lifecycle_test')
    expect(toast.success).toHaveBeenCalledWith('Agent access revoked')
  })

  it('ignores duplicate confirm while in flight', async () => {
    let resolve: (() => void) | undefined
    const onDisconnectAgent = vi.fn(() => new Promise<void>((r) => {
      resolve = r
    }))
    const { result } = renderHook(() => useAgentLifecycleDialog({
      onDisconnectAgent,
    }))
    const trigger = document.createElement('button')

    act(() => {
      result.current.requestDisconnect(detail, trigger)
    })
    await act(async () => {
      void result.current.confirmLifecycle()
      void result.current.confirmLifecycle()
    })
    expect(onDisconnectAgent).toHaveBeenCalledOnce()
    resolve?.()
    await waitFor(() => expect(result.current.revokePending).toBe(false))
  })

  it('freeze mode does not change callback arguments', async () => {
    const onDisconnectAgent = vi.fn(async () => undefined)
    const { result } = renderHook(() => useAgentLifecycleDialog({
      onDisconnectAgent,
    }))
    const trigger = document.createElement('button')

    act(() => {
      result.current.requestDisconnect(detail, trigger)
      result.current.setRevocationMode('freeze')
    })
    await act(async () => {
      await result.current.confirmLifecycle()
    })

    expect(onDisconnectAgent).toHaveBeenCalledWith('prn_lifecycle_test')
  })

  it('keeps dialog open on failure with diagnostic toast', async () => {
    const onDisconnectAgent = vi.fn(async () => {
      throw new Error('failed')
    })
    const { result } = renderHook(() => useAgentLifecycleDialog({
      onDisconnectAgent,
    }))
    const trigger = document.createElement('button')

    act(() => {
      result.current.requestDisconnect(detail, trigger)
    })
    await act(async () => {
      await result.current.confirmLifecycle()
    })

    expect(result.current.lifecycleTarget?.kind).toBe('agent')
    expect(result.current.revokeDiagnostic?.whatHappened).toBe('Could not revoke agent access.')
    expect(toast.error).toHaveBeenCalledWith('Could not revoke agent access.')
  })

  it('resets revocation mode when dialog closes', () => {
    const { result } = renderHook(() => useAgentLifecycleDialog({
      onDisconnectAgent: vi.fn(),
    }))
    const trigger = document.createElement('button')

    act(() => {
      result.current.requestDisconnect(detail, trigger)
      result.current.setRevocationMode('freeze')
      result.current.handleLifecycleDialogOpenChange(false)
    })

    expect(result.current.revocationMode).toBe('drain')
    expect(result.current.lifecycleTarget).toBeUndefined()
  })
})
