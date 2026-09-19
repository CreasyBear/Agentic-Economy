// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const clerkMocks = vi.hoisted(() => ({
  reverifyMode: 'pass' as 'pass' | 'cancel',
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useReverification: (fetcher: (body: string) => Promise<ConsentActionResult>) => async (body: string) => {
    if (clerkMocks.reverifyMode === 'cancel') {
      throw Object.assign(new Error('reverification_cancelled'), { code: 'reverification_cancelled' })
    }
    return await fetcher(body)
  },
}))

vi.mock('@clerk/tanstack-react-start/errors', () => ({
  isReverificationCancelledError: (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'reverification_cancelled',
}))

vi.mock('@/components/ae/command-panel/market-tools-client', () => ({
  searchMarketTools: vi.fn(),
}))

import { searchMarketTools } from '@/components/ae/command-panel/market-tools-client'
import type {
  AgentAccessAuthorizeFormDetails,
  ConsentActionResult,
} from '@/modules/agent-access/consent.contracts'

import {
  buildAgentTargetsPageUrl,
  buildApprovalBody,
  buildDenyBody,
  mapConsentActionResultToDecision,
  useAgentConsentDecision,
} from './useAgentConsentDecision'

const baseDetails: AgentAccessAuthorizeFormDetails = {
  state: 'ready',
  grantRef: 'grant-hook',
  grantRevision: 2,
  flow: 'device_code',
  clientName: 'Hook client',
  mode: 'read_only',
  environment: 'sandbox',
  toolAccess: 'all_admitted',
  toolRefs: [],
  expiresInSeconds: 3600,
  accessSummary: 'Limits',
  agentTargets: [],
  agentTargetsUnavailable: false,
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  clerkMocks.reverifyMode = 'pass'
})

describe('buildApprovalBody', () => {
  it('builds new-agent approve body', () => {
    const body = buildApprovalBody({
      grantRef: 'grant-1',
      grantRevision: 1,
      connectionTarget: 'new_agent',
      replacementMode: 'planned',
      agentTargets: [],
      agentTargetsUnavailable: false,
      selectedMode: 'spending_policy',
      approvedToolAccess: 'all_admitted',
      approvedToolRefs: [],
    })
    expect(body).toBe(
      'grant_ref=grant-1&expected_grant_revision=1&expected_target_revision=1&decision=approve&authority_mode=spending_policy&approved_tool_access=all_admitted&connection_target=new_agent',
    )
  })

  it('builds replace-credential body with principal and replacement mode', () => {
    const body = buildApprovalBody({
      grantRef: 'grant-replace',
      grantRevision: 1,
      oauthState: 'opaque return state',
      connectionTarget: 'replace_credential',
      replacementPrincipalRef: 'prn_agent_a',
      replacementMode: 'compromise',
      agentTargets: [{ principalRef: 'prn_agent_a', principalRevision: 3, displayName: 'A' }],
      agentTargetsUnavailable: false,
      selectedMode: 'approval_required',
      approvedToolAccess: 'all_admitted',
      approvedToolRefs: [],
    })
    expect(body).toContain('connection_target=replace_credential')
    expect(body).toContain('principal_ref=prn_agent_a')
    expect(body).toContain('expected_target_revision=3')
    expect(body).toContain('replacement_mode=compromise')
    expect(body).toContain('state=opaque+return+state')
  })

  it('appends approved_tool_ref entries', () => {
    const ref = `operation:v1:${'b'.repeat(64)}`
    const body = buildApprovalBody({
      grantRef: 'grant-selected',
      grantRevision: 1,
      connectionTarget: 'new_agent',
      replacementMode: 'planned',
      agentTargets: [],
      agentTargetsUnavailable: false,
      selectedMode: 'read_only',
      approvedToolAccess: 'selected_tools',
      approvedToolRefs: [ref],
    })
    expect(body).toContain('approved_tool_access=selected_tools')
    expect(body).toContain(`approved_tool_ref=${encodeURIComponent(ref)}`)
  })

  it('returns undefined when replacement revision is missing', () => {
    expect(buildApprovalBody({
      grantRef: 'grant-1',
      grantRevision: 1,
      connectionTarget: 'replace_credential',
      replacementPrincipalRef: 'missing',
      replacementMode: 'planned',
      agentTargets: [],
      agentTargetsUnavailable: false,
      selectedMode: 'read_only',
      approvedToolAccess: 'all_admitted',
      approvedToolRefs: [],
    })).toBeUndefined()
  })

  it('returns undefined when agent targets are unavailable', () => {
    expect(buildApprovalBody({
      grantRef: 'grant-1',
      grantRevision: 1,
      connectionTarget: 'new_agent',
      replacementMode: 'planned',
      agentTargets: [],
      agentTargetsUnavailable: true,
      selectedMode: 'read_only',
      approvedToolAccess: 'all_admitted',
      approvedToolRefs: [],
    })).toBeUndefined()
  })

  it('returns undefined when selected tools are empty', () => {
    expect(buildApprovalBody({
      grantRef: 'grant-1',
      grantRevision: 1,
      connectionTarget: 'new_agent',
      replacementMode: 'planned',
      agentTargets: [],
      agentTargetsUnavailable: false,
      selectedMode: 'read_only',
      approvedToolAccess: 'selected_tools',
      approvedToolRefs: [],
    })).toBeUndefined()
  })
})

describe('buildDenyBody', () => {
  it('carries grant_ref, decision=deny, and optional state', () => {
    expect(buildDenyBody('grant-deny')).toBe('grant_ref=grant-deny&decision=deny')
    expect(buildDenyBody('grant-deny', 'opaque return state')).toBe('grant_ref=grant-deny&decision=deny&state=opaque+return+state')
  })
})

describe('buildAgentTargetsPageUrl', () => {
  it('encodes user_code locator without state', () => {
    expect(buildAgentTargetsPageUrl({ kind: 'user_code', value: 'PAGE-CODE' })).toBe('/oauth/authorize?user_code=PAGE-CODE')
  })

  it('encodes grant_ref locator', () => {
    expect(buildAgentTargetsPageUrl({ kind: 'grant_ref', value: 'authorization:callback' })).toBe('/oauth/authorize?grant_ref=authorization%3Acallback')
  })

  it('preserves agent_cursor encoding', () => {
    expect(buildAgentTargetsPageUrl({ kind: 'user_code', value: 'PAGE-CODE' }, 'opaque+/cursor==')).toBe(
      '/oauth/authorize?user_code=PAGE-CODE&agent_cursor=opaque%2B%2Fcursor%3D%3D',
    )
  })
})

describe('mapConsentActionResultToDecision', () => {
  it('maps outcome_unknown to outcome_unknown phase', () => {
    expect(mapConsentActionResultToDecision({
      kind: 'outcome_unknown',
      grantRef: 'g',
      readbackRef: 'r',
    })).toEqual({ phase: 'outcome_unknown' })
  })

  it('maps RFC-style unavailable to error with correlation reference', () => {
    expect(mapConsentActionResultToDecision({
      kind: 'unavailable',
      code: 'security_control_unavailable',
      correlationRef: 'oauth:ref',
    })).toEqual({
      phase: 'error',
      errorCode: 'security_control_unavailable',
      errorReference: 'oauth:ref',
    })
  })

  it('maps rate_limited to source_unavailable error, not a permanent loader code', () => {
    expect(mapConsentActionResultToDecision({ kind: 'rate_limited', retryAfter: 30 })).toEqual({
      phase: 'error',
      errorCode: 'source_unavailable',
    })
  })
})

describe('useAgentConsentDecision', () => {
  it('posts deny body and redirects on denied', async () => {
    const redirectTo = 'https://client.example/callback?error=access_denied'
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ kind: 'denied', grantRef: 'grant-hook', redirectTo }))
    vi.stubGlobal('fetch', fetchMock)
    const assign = vi.fn()
    vi.stubGlobal('window', { ...window, location: { assign } })

    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' },
      details: baseDetails,
      submitApproval: async () => ({ kind: 'approved', grantRef: 'grant-hook' }),
    }))

    await act(async () => { await result.current.deny() })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toBe('grant_ref=grant-hook&decision=deny')
    expect(assign).toHaveBeenCalledWith(redirectTo)
  })

  it('maps deny HTTP failure to outcome_unknown', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' },
      details: baseDetails,
      submitApproval: async () => ({ kind: 'approved', grantRef: 'grant-hook' }),
    }))

    await act(async () => { await result.current.deny() })
    expect(result.current.decision).toEqual({ phase: 'outcome_unknown' })
  })

  it('assigns redirect on approve without checking response.ok', async () => {
    const redirectTo = 'https://client.example/callback?code=issued'
    const assign = vi.fn()
    vi.stubGlobal('window', { ...window, location: { assign } })
    const submitApproval = vi.fn().mockResolvedValue({ kind: 'approved', grantRef: 'grant-hook', redirectTo })

    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' },
      details: baseDetails,
      submitApproval,
    }))

    await act(async () => { await result.current.approve() })
    expect(submitApproval).toHaveBeenCalledOnce()
    expect(assign).toHaveBeenCalledWith(redirectTo)
  })

  it('does not fetch when reverification is cancelled', async () => {
    clerkMocks.reverifyMode = 'cancel'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' },
      details: baseDetails,
    }))

    await act(async () => { await result.current.approve() })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.decision).toEqual({ phase: 'idle' })
  })

  it('dispatches only one approve while in flight', async () => {
    let resolveApproval: ((value: { kind: 'approved'; grantRef: string }) => void) | undefined
    const submitApproval = vi.fn().mockImplementation(async () => await new Promise((resolve) => {
      resolveApproval = resolve
    }))

    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' },
      details: baseDetails,
      submitApproval,
    }))

    await act(async () => {
      void result.current.approve()
      void result.current.approve()
    })
    expect(submitApproval).toHaveBeenCalledOnce()
    await act(async () => { resolveApproval?.({ kind: 'approved', grantRef: 'grant-hook' }) })
  })

  it('calls searchMarketTools with trimmed query and limit', async () => {
    vi.mocked(searchMarketTools).mockResolvedValue({
      kind: 'ok',
      schemaVersion: 'registry-tools:v3',
      query: 'weather',
      count: 0,
      items: [],
      pagination: { limit: 8, hasMore: false },
    })
    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' },
      details: baseDetails,
      submitApproval: async () => ({ kind: 'approved', grantRef: 'grant-hook' }),
    }))

    act(() => result.current.setToolQuery('  weather  '))
    await act(async () => { await result.current.findTools() })
    expect(searchMarketTools).toHaveBeenCalledWith({ query: 'weather', limit: 8 })
  })

  it('maps approve JSON error body to source_unavailable via error phase', async () => {
    const submitApproval = vi.fn().mockResolvedValue({ kind: 'refused', code: 'invalid_grant' })
    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' },
      details: baseDetails,
      submitApproval,
    }))
    await act(async () => { await result.current.approve() })
    await waitFor(() => expect(result.current.decision).toEqual({ phase: 'error', errorCode: 'invalid_grant' }))
  })
})
