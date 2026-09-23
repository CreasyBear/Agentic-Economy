// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import { projectAgentDirectory } from '@/modules/agent-access/agent-access-console'
import { canonicalAgentRecord } from '../../../../../tests/helpers/agent-directory-fixture'

import { useAgentSelection } from './useAgentSelection'

const PRINCIPAL_ID = `prn_${'a'.repeat(32)}`

function baseDirectory(): AgentDirectoryProjection {
  const caller = {
    key: {
      keyId: 'key_test',
      name: 'Test',
      applicationRef: 'app',
      environment: 'sandbox' as const,
      authorityMode: 'read_only' as const,
      scopes: [],
      revoked: false,
      expired: false,
    },
    grant: {
      principalId: PRINCIPAL_ID,
      credentialId: 'key_test',
      applicationRef: 'app',
      environment: 'sandbox' as const,
      authorityMode: 'read_only' as const,
      toolAccess: 'all_admitted' as const,
      toolRefs: [],
      lifecycle: 'active' as const,
      expiresAt: 1,
      budget: {
        maximumSpendPerCall: { currency: 'AUD', units: '1', exponent: 2 },
        maximumDailySpend: { currency: 'AUD', units: '1', exponent: 2 },
        maximumMonthlySpend: { currency: 'AUD', units: '1', exponent: 2 },
        maximumConcurrentCalls: 1,
      },
      rate: { maximumCallsPerMinute: 1, maximumCallsPerHour: 1 },
    },
    principalId: PRINCIPAL_ID,
    activity: [],
    dataState: 'source' as const,
  }
  return projectAgentDirectory([caller], [canonicalAgentRecord([caller])])
}

describe('useAgentSelection', () => {
  it('resolves route-controlled selection from selectedPrincipalId', () => {
    const directory = baseDirectory()
    const { result } = renderHook(() => useAgentSelection({
      directoryItems: directory.items,
      directoryDetails: directory.details,
      selectedPrincipalId: PRINCIPAL_ID,
      getAgentHref: (id) => `/agent-access?caller=${id}`,
    }))

    expect(result.current.routeControlled).toBe(true)
    expect(result.current.selected?.agent.principalRef).toBe(PRINCIPAL_ID)
  })

  it('clears route selection at most once per dismiss', () => {
    const directory = baseDirectory()
    const onClearSelectedPrincipal = vi.fn()
    const { result } = renderHook(() => useAgentSelection({
      directoryItems: directory.items,
      directoryDetails: directory.details,
      selectedPrincipalId: PRINCIPAL_ID,
      getAgentHref: (id) => `/agent-access?caller=${id}`,
      onClearSelectedPrincipal,
    }))

    act(() => {
      result.current.handleSheetOpenChange(false)
      result.current.handleSheetOpenChange(false)
    })

    expect(onClearSelectedPrincipal).toHaveBeenCalledOnce()
  })

  it('uses local selection when route href is absent', () => {
    const directory = baseDirectory()
    const item = directory.items[0]
    if (item === undefined) throw new Error('missing item')
    const { result } = renderHook(() => useAgentSelection({
      directoryItems: directory.items,
      directoryDetails: directory.details,
    }))

    act(() => {
      result.current.setLocalSelected(item)
    })

    expect(result.current.routeControlled).toBe(false)
    expect(result.current.selected?.agent.principalRef).toBe(PRINCIPAL_ID)
  })

  it('returns undefined selected when caller is stale', () => {
    const directory = baseDirectory()
    const foreign = `prn_${'b'.repeat(32)}`
    const { result } = renderHook(() => useAgentSelection({
      directoryItems: directory.items,
      directoryDetails: directory.details,
      selectedPrincipalId: foreign,
      getAgentHref: (id) => `/agent-access?caller=${id}`,
    }))

    expect(result.current.selected).toBeUndefined()
    expect(result.current.selectedItem).toBeUndefined()
  })
})
