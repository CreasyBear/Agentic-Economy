// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'

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
import type { PublicToolRef } from '@/modules/capability-supply/public'

import {
  buildAgentTargetsPageUrl,
  buildApprovalBody,
  buildDenyBody,
  mapConsentActionResultToDecision,
  useAgentConsentDecision,
} from './useAgentConsentDecision'

import { ConsentToolAccessFieldset } from './components/ConsentToolAccessFieldset'
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
const callableRef = `operation:v1:${'a'.repeat(64)}` as PublicToolRef
const callableRow = {
  id: callableRef, source: 'current' as const, access: 'ae_callable' as const, toolRef: callableRef,
  title: 'Weather Tool', summary: 'Get weather.', provider: 'Provider',
  actionClass: 'retrieve' as const, objectClass: 'data' as const, readiness: 'ready' as const,
  price: { kind: 'unavailable' as const }, detailRef: callableRef,
  next: [{ action: 'describe' as const, authority: 'public' as const, args: { toolRef: callableRef } }],
}
const externalRow = {
  id: 'external:weather', source: 'coinbase' as const, access: 'external_listing' as const,
  title: 'External Weather', summary: 'Weather source.', provider: 'External',
  actionClass: 'retrieve' as const, objectClass: 'data' as const, readiness: 'unverified' as const,
  price: { kind: 'unavailable' as const }, detailRef: 'external:weather',
  next: [{ action: 'describe-external' as const, authority: 'public' as const, args: { id: 'external:weather' } }],
}
const searchMeta = {
  schemaVersion: 'registry-tools:v3' as const, query: 'weather', partialResults: false,
  assessed: { source: 'all' as const, scope: 'complete' as const, examined: 2, coverage: 'complete' as const },
  pagination: { limit: 8, hasMore: false },
  next: [{ action: 'broaden' as const, authority: 'public' as const, args: { query: 'weather' } }],
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

  it('releases approval after reverification cancellation and preserves choices for retry', async () => {
    clerkMocks.reverifyMode = 'cancel'
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ kind: 'approved', grantRef: 'grant-hook' }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' },
      details: baseDetails,
    }))

    act(() => {
      result.current.dispatch({ kind: 'select_mode', value: 'approval_required' })
      result.current.setApprovedToolAccess('selected_tools')
      result.current.addApprovedTool(callableRef)
    })
    await act(async () => { await result.current.approve() })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.decision).toEqual({ phase: 'idle' })
    expect(result.current.selectedMode).toBe('approval_required')
    expect(result.current.approvedToolAccess).toBe('selected_tools')
    expect(result.current.approvedToolRefs).toEqual([callableRef])

    clerkMocks.reverifyMode = 'pass'
    await act(async () => { await result.current.approve() })
    expect(fetchMock).toHaveBeenCalledWith('/oauth/authorize', expect.objectContaining({
      method: 'POST',
      body: `grant_ref=grant-hook&expected_grant_revision=2&expected_target_revision=2&decision=approve&authority_mode=approval_required&approved_tool_access=selected_tools&connection_target=new_agent&approved_tool_ref=${encodeURIComponent(callableRef)}`,
    }))
    expect(result.current.decision).toEqual({ phase: 'approved' })
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

  it('dispatches one deny and keeps the decision closed after an unknown outcome', async () => {
    const pendingResponses: Array<(response: Response) => void> = []
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      pendingResponses.push(resolve)
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' },
      details: baseDetails,
    }))
    let denyAttempts: Promise<void>[] = []

    await act(async () => {
      denyAttempts = [result.current.deny(), result.current.deny()]
    })
    const requestCount = fetchMock.mock.calls.length
    await act(async () => {
      pendingResponses.forEach(resolve => resolve(new Response('bad', { status: 500 })))
      await Promise.all(denyAttempts)
    })

    expect(requestCount).toBe(1)
    expect(fetchMock).toHaveBeenCalledWith('/oauth/authorize', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_ref=grant-hook&decision=deny',
    }))
    expect(result.current.decision).toEqual({ phase: 'outcome_unknown' })

    await act(async () => { await result.current.deny() })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('admits approve before a same-turn deny and posts only the approval body', async () => {
    const pendingResponses: Array<(response: Response) => void> = []
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      pendingResponses.push(resolve)
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' },
      details: baseDetails,
    }))
    let decisionAttempts: Promise<void>[] = []

    await act(async () => {
      decisionAttempts = [result.current.approve(), result.current.deny()]
    })
    const requestCount = fetchMock.mock.calls.length
    await act(async () => {
      pendingResponses.forEach((resolve, index) => {
        const body = String(fetchMock.mock.calls[index]?.[1]?.body)
        resolve(body.includes('decision=approve')
          ? Response.json({ kind: 'approved', grantRef: 'grant-hook' })
          : Response.json({ kind: 'denied', grantRef: 'grant-hook' }))
      })
      await Promise.all(decisionAttempts)
    })

    expect(requestCount).toBe(1)
    expect(fetchMock).toHaveBeenCalledWith('/oauth/authorize', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_ref=grant-hook&expected_grant_revision=2&expected_target_revision=2&decision=approve&authority_mode=read_only&approved_tool_access=all_admitted&connection_target=new_agent',
    }))
    expect(result.current.decision).toEqual({ phase: 'approved' })
  })

  it('admits deny before a same-turn approve and posts only the denial body', async () => {
    const pendingResponses: Array<(response: Response) => void> = []
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      pendingResponses.push(resolve)
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' },
      details: baseDetails,
    }))
    let decisionAttempts: Promise<void>[] = []

    await act(async () => {
      decisionAttempts = [result.current.deny(), result.current.approve()]
    })
    const requestCount = fetchMock.mock.calls.length
    await act(async () => {
      pendingResponses.forEach((resolve, index) => {
        const body = String(fetchMock.mock.calls[index]?.[1]?.body)
        resolve(body.includes('decision=approve')
          ? Response.json({ kind: 'approved', grantRef: 'grant-hook' })
          : Response.json({ kind: 'denied', grantRef: 'grant-hook' }))
      })
      await Promise.all(decisionAttempts)
    })

    expect(requestCount).toBe(1)
    expect(fetchMock).toHaveBeenCalledWith('/oauth/authorize', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_ref=grant-hook&decision=deny',
    }))
    expect(result.current.decision).toEqual({ phase: 'denied' })
  })

  it('renders executable scoped next-page action without offering an external ToolRef', () => {
    const onContinueSearch = vi.fn()
    render(createElement(ConsentToolAccessFieldset, {
      pending: false, toolAccess: 'all_admitted', approvedToolAccess: 'selected_tools',
      approvedToolRefs: [], approvedToolRefSet: new Set<string>(), toolQuery: 'weather',
      toolSearch: { pending: false, results: [], noMatchMessage: 'More Tools may be on another page.', continuation: { query: 'weather', cursor: 'opaque' } },
      onApprovedToolAccessChange: vi.fn(), onToolQueryChange: vi.fn(), onFindTools: vi.fn(),
      onContinueSearch, onAddApprovedTool: vi.fn(), onRemoveApprovedTool: vi.fn(),
    }))
    expect(screen.getByText('More Tools may be on another page.')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onContinueSearch).toHaveBeenCalledOnce()
  })

  it('calls searchMarketTools with trimmed query and limit', async () => {
    vi.mocked(searchMarketTools).mockResolvedValue({
      ...searchMeta, kind: 'noMatch', results: [], reason: 'No matching Tools.',
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

  it('offers only admitted callable ToolRefs, never external-only listings', async () => {
    vi.mocked(searchMarketTools).mockResolvedValue({
      ...searchMeta, kind: 'match', results: [externalRow, callableRow],
    })
    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' }, details: baseDetails,
    }))
    act(() => result.current.setToolQuery('weather'))
    await act(async () => { await result.current.findTools() })
    expect(result.current.toolSearch.results).toEqual([{ toolRef: callableRef, title: callableRow.title }])
    expect(result.current.toolSearch.results).not.toContainEqual(expect.objectContaining({ title: externalRow.title }))
  })

  it('shows a matched Tool and Next page together, then selects the Tool and follows the cursor', async () => {
    const cursor = 'match:next-page'
    vi.mocked(searchMarketTools).mockResolvedValueOnce({
      ...searchMeta, kind: 'match', results: [callableRow],
      pagination: { limit: 8, hasMore: true, nextCursor: cursor },
      next: [{ action: 'next-page', authority: 'public', args: { query: 'weather', cursor } }],
    }).mockResolvedValueOnce({ ...searchMeta, kind: 'noMatch', results: [], reason: 'No matching Tools.' })
    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' }, details: baseDetails,
    }))
    act(() => { result.current.setApprovedToolAccess('selected_tools'); result.current.setToolQuery('weather') })
    await act(async () => { await result.current.findTools() })

    const { container } = render(createElement(ConsentToolAccessFieldset, {
      pending: false, toolAccess: result.current.toolAccess,
      approvedToolAccess: result.current.approvedToolAccess,
      approvedToolRefs: result.current.approvedToolRefs,
      approvedToolRefSet: result.current.approvedToolRefSet,
      toolQuery: result.current.toolQuery,
      toolSearch: result.current.toolSearch,
      onApprovedToolAccessChange: result.current.setApprovedToolAccess,
      onToolQueryChange: result.current.setToolQuery,
      onFindTools: result.current.findTools,
      onContinueSearch: result.current.continueSearch,
      onAddApprovedTool: result.current.addApprovedTool,
      onRemoveApprovedTool: result.current.removeApprovedTool,
    }))
    expect(within(container).getByText('Weather Tool')).not.toBeNull()
    expect(within(container).queryByRole('status')).toBeNull()
    fireEvent.click(within(container).getByRole('button', { name: 'Add' }))
    expect(result.current.approvedToolRefs).toEqual([callableRef])
    fireEvent.click(within(container).getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(searchMarketTools).toHaveBeenLastCalledWith({ query: 'weather', limit: 8, cursor }))
    expect(result.current.toolSearch.continuation).toBeUndefined()
  })

  it('explains why a matching external-only listing cannot be authorized', async () => {
    vi.mocked(searchMarketTools).mockResolvedValue({ ...searchMeta, kind: 'match', results: [externalRow] })
    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' }, details: baseDetails,
    }))
    act(() => result.current.setToolQuery('weather'))
    await act(async () => { await result.current.findTools() })
    expect(result.current.toolSearch).toMatchObject({ results: [], noMatchMessage: expect.stringMatching(/cannot be authorized/) })
  })

  it('shows scoped continuation and executes the exact cursor without admitting external listings', async () => {
    const cursor = 'next-page:opaque'
    vi.mocked(searchMarketTools).mockResolvedValueOnce({
      ...searchMeta, kind: 'scoped', reason: 'More supply remains.', results: [externalRow],
      partialResults: true, assessed: { source: 'all', scope: 'page', examined: 2, coverage: 'partial' },
      pagination: { limit: 8, hasMore: true, nextCursor: cursor },
      next: [{ action: 'next-page', authority: 'public', args: { query: 'weather', cursor } }],
    }).mockResolvedValueOnce({ ...searchMeta, kind: 'match', results: [callableRow] })
    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' }, details: baseDetails,
    }))
    act(() => result.current.setToolQuery('weather'))
    await act(async () => { await result.current.findTools() })
    expect(result.current.toolSearch.results).toEqual([])
    expect(result.current.toolSearch.continuation).toEqual({ query: 'weather', cursor })
    await act(async () => { result.current.continueSearch(); await waitFor(() => expect(searchMarketTools).toHaveBeenCalledTimes(2)) })
    expect(searchMarketTools).toHaveBeenLastCalledWith({ query: 'weather', limit: 8, cursor })
    expect(result.current.toolSearch.results).toEqual([{ toolRef: callableRef, title: callableRow.title }])
  })

  it('offers retry instead of a Tool when search is unavailable', async () => {
    vi.mocked(searchMarketTools).mockResolvedValue({
      ...searchMeta, kind: 'unavailable', results: [], reason: 'source_unavailable',
      next: [{ action: 'retry', authority: 'public', args: { query: 'weather' } }],
    })
    const { result } = renderHook(() => useAgentConsentDecision({
      locator: { kind: 'user_code', value: 'CODE' }, details: baseDetails,
    }))
    act(() => result.current.setToolQuery('weather'))
    await act(async () => { await result.current.findTools() })
    expect(result.current.toolSearch).toEqual({ pending: false, error: expect.stringMatching(/Try again/) })
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
