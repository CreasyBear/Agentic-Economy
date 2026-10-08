// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AgentCredentialSource, AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import { projectAgentDirectory } from '@/modules/agent-access/agent-access-console'
import type { AgentOnboardingRequest } from '@/modules/agent-access/public'
import { canonicalAgentRecord } from '../../helpers/agent-directory-fixture'

const routeHarness = vi.hoisted(() => ({
  search: {} as import('@/modules/agent-access/agent-lifecycle.view-model').AgentAccessSearch,
  location: { pathname: '/agent-access', hash: '' },
  navigate: vi.fn(),
  consoleProps: undefined as Record<string, unknown> | undefined,
  installProps: undefined as Record<string, unknown> | undefined,
  loaderData: undefined as unknown as Readonly<{
    canonicalBaseUrl: string
    directory: AgentDirectoryProjection
    onboarding?: AgentOnboardingRequest
    directoryUnavailable?: boolean
  }>,
  serverFns: new Map<unknown, (...args: never[]) => Promise<unknown>>(),
  readRequest: vi.fn(), readDirectory: vi.fn(),
  readCanonicalBaseUrl: vi.fn(),
  disconnectRef: Symbol('disconnect'),
  disconnectConnectionRef: Symbol('disconnect-connection'),
  renameRef: Symbol('rename'),
  updateSpendingLimitsRef: Symbol('update-spending-limits'),
  readSpendingLimitsRef: Symbol('read-spending-limits'),
  readApprovalsRef: Symbol('read-approvals'),
  decideApprovalRef: Symbol('decide-approval'),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, search, children }: { to: string; params?: Record<string, string>; search?: Record<string, string>; children?: ReactNode }) => {
    const path = Object.entries(params ?? {}).reduce((value, [name, parameter]) => value.replace(`$${name}`, encodeURIComponent(parameter)), to)
    const query = new URLSearchParams(Object.entries(search ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')).toString()
    return <a href={`${path}${query ? `?${query}` : ''}`}>{children}</a>
  },
  Outlet: () => null,
  createFileRoute: () => (options: Record<string, unknown>) => {
    const route = {
      ...options,
      useLoaderData: () => routeHarness.loaderData,
      useSearch: () => routeHarness.search,
    }
    return { ...route, options: route }
  },
  useLocation: () => routeHarness.location,
  useNavigate: () => routeHarness.navigate,
}))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...await importOriginal(),
  createClientOnlyFn: (fn: (...args: never[]) => unknown) => fn,
  useServerFn: (reference: unknown) => routeHarness.serverFns.get(reference) ?? (async () => undefined),
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useReverification: (request: (...args: unknown[]) => Promise<unknown>) => request,
}))

vi.mock('@/components/ae/console/agent-operator-console/AeAgentOperatorConsole', () => ({
  AeAgentOperatorConsole: (props: Record<string, unknown>) => {
    routeHarness.consoleProps = props
    return <div data-testid="agent-console" />
  },
}))

vi.mock('@/components/ae/console/AeAssistantInstallFunnel', () => ({
  AeAssistantInstallFunnel: (props: Record<string, unknown>) => {
    routeHarness.installProps = props
    return <div data-testid="agent-install" />
  },
}))

vi.mock('@/components/ae/agent-access/AeAgentSecurityHistory', () => ({
  AeAgentSecurityHistory: ({ principalRef }: { principalRef: string }) => <div data-agent-history={principalRef} />,
}))

vi.mock('@/components/ae/layout/AeOperatorPage', () => ({
  AeOperatorPage: ({ children }: { children?: ReactNode }) => children ?? null,
}))

vi.mock('@/lib/operator/route-options', () => ({ operatorRouteOptions: {} }))

vi.mock('@/lib/server/canonical-url.functions', () => ({
  readCanonicalBaseUrlServer: routeHarness.readCanonicalBaseUrl,
}))

vi.mock('@/lib/server/agent-access-consent.functions', () => ({ readAgentOnboardingRequestServer: routeHarness.readRequest }))
vi.mock('@/lib/server/agent-access-console.functions', () => ({
  readAgentDirectoryServer: routeHarness.readDirectory,
  readAgentDirectoryPageServer: routeHarness.readDirectory,
}))

vi.mock('@/modules/agent-access/agent-access.functions', () => ({
  disconnectAgentServer: routeHarness.disconnectRef,
  revokeOwnerConnectionServer: routeHarness.disconnectConnectionRef,
  renameAgentServer: routeHarness.renameRef,
  updateAgentSpendingLimitsServer: routeHarness.updateSpendingLimitsRef,
  readAgentSpendingLimitsServer: routeHarness.readSpendingLimitsRef,
}))

vi.mock('@/modules/capability-execution/call-approval.functions', () => ({
  decideCallApprovalServer: routeHarness.decideApprovalRef,
  listPendingCallApprovalsServer: routeHarness.readApprovalsRef,
}))

import {
  Route as AgentAccessRoute,
  validateAgentAccessSearch,
} from '@/routes/_operator/agent-access'

const PRINCIPAL_ID = `prn_${'1'.repeat(32)}`
const FOREIGN_PRINCIPAL_ID = `prn_${'2'.repeat(32)}`
const TOOL_REF = `operation:v1:${'a'.repeat(64)}`
const KEY_ID = 'key_private_route_canary'

const caller: AgentCredentialSource = {
  key: {
    keyId: KEY_ID,
    name: 'Route assistant',
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'read_only',
    scopes: ['market_tools:call'],
    revoked: false,
    expired: false,
  },
  grant: {
    principalId: PRINCIPAL_ID,
    credentialId: KEY_ID,
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'read_only',
    toolAccess: 'all_admitted',
    toolRefs: [],
    lifecycle: 'active',
    expiresAt: 604_800_000,
    budget: {
      maximumSpendPerCall: { currency: 'USD', units: '500', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '2500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '10000', exponent: 2 },
      maximumConcurrentCalls: 2,
    },
    rate: { maximumCallsPerMinute: 30, maximumCallsPerHour: 300 },
  },
  principalId: PRINCIPAL_ID,
  activity: [],
  dataState: 'source',
}
const directory = projectAgentDirectory([caller], [canonicalAgentRecord([caller])])

function onboardingRequest(phase: Extract<AgentOnboardingRequest, { kind: 'request' }>['phase']) {
  return {
    kind: 'request',
    grantRef: 'grant:codex',
    revision: 2,
    clientName: 'Codex',
    flow: 'authorization_code',
    environment: 'sandbox',
    phase,
    createdAt: 1,
    expiresAt: 999,
    principalRef: PRINCIPAL_ID,
  } satisfies Extract<AgentOnboardingRequest, { kind: 'request' }>
}

function renderRoute() {
  const Component = AgentAccessRoute.options.component
  if (Component === undefined) throw new Error('agent_access_route_component_missing')
  return render(createElement(Component))
}

function installServerFns(readDirectory: () => Promise<AgentDirectoryProjection> = async () => directory) {
  const rename = vi.fn(async () => ({
    kind: 'completed' as const,
    principalRef: PRINCIPAL_ID,
    displayName: 'Research assistant',
    revision: 2,
    correlationRef: 'agent:rename-safe',
  }))
  routeHarness.serverFns.set(routeHarness.readRequest, routeHarness.readRequest)
  routeHarness.serverFns.set(routeHarness.readDirectory, readDirectory)
  routeHarness.serverFns.set(routeHarness.renameRef, rename)
  routeHarness.serverFns.set(routeHarness.readApprovalsRef, async () => [])
  routeHarness.serverFns.set(routeHarness.decideApprovalRef, async () => ({ kind: 'denied' }))
  return { rename }
}

beforeEach(() => {
  routeHarness.loaderData = { canonicalBaseUrl: 'https://market.example', directory }
  routeHarness.readCanonicalBaseUrl.mockResolvedValue('https://market.example')
  routeHarness.readDirectory.mockResolvedValue(directory)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  routeHarness.search = {}
  routeHarness.location = { pathname: '/agent-access', hash: '' }
  routeHarness.navigate.mockReset()
  routeHarness.consoleProps = undefined
  routeHarness.installProps = undefined
  routeHarness.serverFns.clear()
  routeHarness.loaderData = { canonicalBaseUrl: 'https://market.example', directory }
  routeHarness.readDirectory.mockReset()
  routeHarness.readCanonicalBaseUrl.mockReset()
})

describe('agent-access caller locator validation', () => {
  it('accepts only one trimmed canonical principal scalar', () => {
    expect(validateAgentAccessSearch({ caller: PRINCIPAL_ID })).toEqual({ caller: PRINCIPAL_ID })
    expect(validateAgentAccessSearch({ caller: `  ${PRINCIPAL_ID}  ` })).toEqual({ caller: PRINCIPAL_ID })

    const hostileValues: readonly unknown[] = [
      undefined,
      null,
      [],
      [PRINCIPAL_ID],
      { value: PRINCIPAL_ID },
      '',
      '   ',
      PRINCIPAL_ID.toUpperCase(),
      `${PRINCIPAL_ID}0`,
      'key_private_route_canary',
      'clerk_api_key:key_private_route_canary',
      'ae_buyer_secret_canary_do_not_echo',
    ]
    for (const caller of hostileValues) {
      expect(validateAgentAccessSearch({ caller })).toEqual({})
    }
  })

  it('accepts only a canonical Tool continuation and does not discard a valid caller', () => {
    expect(validateAgentAccessSearch({ caller: PRINCIPAL_ID, resumeTool: ` ${TOOL_REF} ` })).toEqual({
      caller: PRINCIPAL_ID,
      resumeTool: TOOL_REF,
    })
    for (const resumeTool of ['', 'tool:opaque', `${TOOL_REF}0`, TOOL_REF.toUpperCase(), [TOOL_REF], { value: TOOL_REF }]) {
      expect(validateAgentAccessSearch({ caller: PRINCIPAL_ID, resumeTool })).toEqual({ caller: PRINCIPAL_ID })
    }
  })

  it('keeps a known setup step and drops a malformed one without leaving Agents', () => {
    expect(validateAgentAccessSearch({ setup: 'choose' })).toEqual({ setup: 'choose' })
    expect(validateAgentAccessSearch({ setup: 'oauth', caller: PRINCIPAL_ID })).toEqual({
      setup: 'oauth',
      caller: PRINCIPAL_ID,
    })
    expect(validateAgentAccessSearch({ setup: 'market' })).toEqual({})
    expect(validateAgentAccessSearch({ setup: ['oauth'] })).toEqual({})
    expect(validateAgentAccessSearch({ caller: PRINCIPAL_ID, setup: 'public' })).toEqual({ caller: PRINCIPAL_ID })
  })

  it('keeps only an exact known setup app without normalizing or echoing malformed values', () => {
    for (const setupApp of ['codex', 'claude-code', 'cursor'] as const) {
      expect(validateAgentAccessSearch({ setupApp })).toEqual({ setupApp })
    }

    const hostileValues: readonly unknown[] = [
      undefined,
      null,
      [],
      ['codex'],
      { value: 'codex' },
      '',
      ' ',
      ' codex ',
      'Codex',
      'CLAUDE-CODE',
      'Cursor',
      'clerk_api_key:private-canary',
      'ae_buyer_secret_canary_do_not_echo',
    ]
    for (const setupApp of hostileValues) {
      expect(validateAgentAccessSearch({ setupApp })).toEqual({})
    }
  })
})

describe('agent-access caller route continuation', () => {
  it('shows the Agent-initiated Call and receipt automatically on the same owner page', async () => {
    vi.useFakeTimers()
    const active: AgentCredentialSource = { ...caller, key: { ...caller.key, authorityMode: 'approval_required' },
      grant: { ...caller.grant!, authorityMode: 'approval_required' } }
    const canonical = canonicalAgentRecord([active])
    const initial = projectAgentDirectory([active], [canonical])
    const identity = { callRef: 'call:live-route', credentialRef: KEY_ID, toolRef: TOOL_REF, createdAt: 1, updatedAt: 2 }
    const running = projectAgentDirectory([active], [canonical], [], [{ principalRef: PRINCIPAL_ID, activity: [], dataState: 'source',
      activityIsDone: true, liveCalls: [{ ...identity, phase: 'running' }] }])
    const delivered = projectAgentDirectory([active], [canonical], [], [{ principalRef: PRINCIPAL_ID, dataState: 'source', activityIsDone: true,
      liveCalls: [{ ...identity, phase: 'finished' }], activity: [{ ...identity, toolLabel: 'Research', providerRef: 'provider:route',
        state: 'completed', deliveryState: 'delivered', paymentState: 'settled', receiptRef: 'receipt:route' }] }])
    routeHarness.loaderData = { canonicalBaseUrl: 'https://market.example', directory: initial }
    routeHarness.search = { caller: PRINCIPAL_ID, resumeTool: TOOL_REF }
    installServerFns(vi.fn().mockResolvedValueOnce(running).mockResolvedValue(delivered))
    renderRoute()
    expect(screen.getByRole('heading', { name: 'Access approved; waiting for your Agent' })).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(screen.getByRole('heading', { name: 'The Tool is running' })).toBeTruthy()
    const callHref = `/calls/${encodeURIComponent(identity.callRef)}?${new URLSearchParams({
      returnTo: 'agent', returnCaller: PRINCIPAL_ID, returnTool: TOOL_REF,
    })}`
    expect(screen.getByRole('link', { name: 'View live Call' }).getAttribute('href')).toBe(callHref)
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(screen.getByRole('heading', { name: 'A Tool result is recorded' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View Tool result and receipt' }).getAttribute('href')).toBe(callHref)
    expect(screen.queryByRole('button', { name: 'Copy instruction for your Agent' })).toBeNull()
  })

  it('loads the directory before rendering the route', async () => {
    const loader = AgentAccessRoute.options.loader
    if (typeof loader !== 'function') throw new Error('agent_access_loader_missing')

    await expect(loader({ deps: {}, location: { pathname: '/agent-access' } } as never)).resolves.toEqual({
      canonicalBaseUrl: 'https://market.example',
      directory,
      onboarding: undefined,
      directoryUnavailable: false,
    })
    expect(routeHarness.readDirectory).toHaveBeenCalledOnce()
  })

  it('keeps setup app selection out of loader dependencies while preserving request and continuation locators', () => {
    const loaderDeps = AgentAccessRoute.options.loaderDeps
    if (typeof loaderDeps !== 'function') throw new Error('agent_access_loader_deps_missing')

    expect(loaderDeps({ search: {
      caller: PRINCIPAL_ID,
      callRef: 'call:one',
      grantRef: 'grant:one',
      userCode: 'user:one',
      setupApp: 'cursor',
    } })).toEqual({
      caller: PRINCIPAL_ID,
      callRef: 'call:one',
      grantRef: 'grant:one',
      userCode: 'user:one',
    })
  })

  it('binds setup app choice to route search and preserves continuation when changed or cleared', () => {
    routeHarness.search = validateAgentAccessSearch({
      setup: 'oauth',
      setupApp: 'cursor',
      caller: PRINCIPAL_ID,
      resumeTool: TOOL_REF,
      callRef: 'call:setup-app',
    })
    const disconnectAgent = vi.fn()
    const disconnectConnection = vi.fn()
    const updateSpendingLimits = vi.fn()
    const decideApproval = vi.fn(async () => ({ kind: 'denied' }))
    const { rename } = installServerFns()
    routeHarness.serverFns.set(routeHarness.disconnectRef, disconnectAgent)
    routeHarness.serverFns.set(routeHarness.disconnectConnectionRef, disconnectConnection)
    routeHarness.serverFns.set(routeHarness.updateSpendingLimitsRef, updateSpendingLimits)
    routeHarness.serverFns.set(routeHarness.decideApprovalRef, decideApproval)

    const Component = AgentAccessRoute.options.component
    if (Component === undefined) throw new Error('agent_access_route_component_missing')
    const rendered = render(createElement(Component))

    expect(routeHarness.installProps).toMatchObject({ setupApp: 'cursor', resumeToolRef: TOOL_REF })
    const onSetupAppChange = routeHarness.installProps?.onSetupAppChange as
      ((setupApp: 'codex' | 'claude-code' | 'cursor' | undefined) => void) | undefined
    expect(onSetupAppChange).toBeTypeOf('function')
    act(() => onSetupAppChange?.('codex'))
    expect(routeHarness.navigate).toHaveBeenLastCalledWith({
      to: '/agent-access',
      search: {
        setup: 'oauth',
        caller: PRINCIPAL_ID,
        resumeTool: TOOL_REF,
        callRef: 'call:setup-app',
        setupApp: 'codex',
      },
      replace: true,
      resetScroll: false,
      viewTransition: false,
    })

    routeHarness.search = { ...routeHarness.search, setupApp: 'codex' }
    rendered.rerender(createElement(Component))
    expect(routeHarness.installProps).toMatchObject({ setupApp: 'codex', resumeToolRef: TOOL_REF })

    const onClearSetupApp = routeHarness.installProps?.onSetupAppChange as
      ((setupApp: 'codex' | 'claude-code' | 'cursor' | undefined) => void) | undefined
    act(() => onClearSetupApp?.(undefined))
    expect(routeHarness.navigate).toHaveBeenLastCalledWith({
      to: '/agent-access',
      search: {
        setup: 'oauth',
        caller: PRINCIPAL_ID,
        resumeTool: TOOL_REF,
        callRef: 'call:setup-app',
      },
      replace: true,
      resetScroll: false,
      viewTransition: false,
    })
    expect(disconnectAgent).not.toHaveBeenCalled()
    expect(disconnectConnection).not.toHaveBeenCalled()
    expect(rename).not.toHaveBeenCalled()
    expect(updateSpendingLimits).not.toHaveBeenCalled()
    expect(decideApproval).not.toHaveBeenCalled()
  })

  it('passes the exact validated locator to client selection but never to the owner read', async () => {
    routeHarness.search = { caller: PRINCIPAL_ID }
    installServerFns()

    renderRoute()

    await waitFor(() => expect(routeHarness.consoleProps?.directory).toEqual(directory))
    expect(routeHarness.consoleProps?.selectedPrincipalId).toBe(PRINCIPAL_ID)
    expect(routeHarness.navigate).not.toHaveBeenCalled()

    const getAgentHref = routeHarness.consoleProps?.getAgentHref as ((principalId: string) => string) | undefined
    expect(getAgentHref?.(PRINCIPAL_ID)).toBe(`/agent-access?caller=${PRINCIPAL_ID}`)
  })

  it('renames the exact Principal revision then reloads authoritative directory state', async () => {
    routeHarness.search = { caller: PRINCIPAL_ID }
    const readDirectory = vi.fn(async () => directory)
    const { rename } = installServerFns(readDirectory)
    renderRoute()

    await waitFor(() => expect(routeHarness.consoleProps?.onRenameAgent).toBeTypeOf('function'))
    const onRename = routeHarness.consoleProps?.onRenameAgent as (
      principalRef: string,
      expectedRevision: number,
      displayName: string,
    ) => Promise<boolean>
    await expect(onRename(PRINCIPAL_ID, directory.items[0]!.principalRevision, 'Research assistant')).resolves.toBe(true)

    expect(rename).toHaveBeenCalledWith({
      data: {
        principalRef: PRINCIPAL_ID,
        expectedRevision: directory.items[0]!.principalRevision,
        displayName: 'Research assistant',
      },
    })
    expect(readDirectory).toHaveBeenCalledOnce()
    expect(routeHarness.consoleProps?.selectedPrincipalId).toBe(PRINCIPAL_ID)
    expect(routeHarness.navigate).not.toHaveBeenCalled()
  })

  it('retains the selected Tool through Agent selection and offers one browser return', async () => {
    routeHarness.search = { caller: PRINCIPAL_ID, resumeTool: TOOL_REF }
    installServerFns()

    renderRoute()

    const returnAction = await screen.findByRole('link', { name: 'Return to selected Tool' })
    expect(returnAction.getAttribute('href')).toBe(`/tools/${encodeURIComponent(TOOL_REF)}`)
    expect(screen.getByText(/Browser access does not create a Call/u)).toBeTruthy()
    const getAgentHref = routeHarness.consoleProps?.getAgentHref as ((principalRef: string) => string) | undefined
    expect(getAgentHref?.(FOREIGN_PRINCIPAL_ID)).toBe(`/agent-access?caller=${encodeURIComponent(FOREIGN_PRINCIPAL_ID)}&resumeTool=${encodeURIComponent(TOOL_REF)}`)
    const clear = routeHarness.consoleProps?.onClearSelectedPrincipal as (() => void) | undefined
    clear?.()
    expect(routeHarness.navigate).toHaveBeenCalledWith({
      to: '/agent-access', search: { resumeTool: TOOL_REF }, replace: true,
    })
  })

  it('reveals the Tool return only after an empty directory confirms a connection', async () => {
    const emptyDirectory: AgentDirectoryProjection = { items: [], details: [] }
    routeHarness.loaderData = { canonicalBaseUrl: 'https://market.example', directory: emptyDirectory }
    routeHarness.search = { resumeTool: TOOL_REF }
    installServerFns(async () => directory)

    renderRoute()

    expect(routeHarness.installProps?.resumeToolRef).toBe(TOOL_REF)
    expect(screen.queryByRole('link', { name: 'Return to selected Tool' })).toBeNull()
    const checkConnection = routeHarness.installProps?.onCheckConnection as (() => void) | undefined
    act(() => checkConnection?.())

    expect(await screen.findByRole('link', { name: 'Return to selected Tool' })).toBeTruthy()
    expect(screen.getByText(/Browser access does not create a Call/u)).toBeTruthy()
  })

  it('treats a directory read outage as scoped recovery rather than a destructive state', async () => {
    const emptyDirectory: AgentDirectoryProjection = { items: [], details: [] }
    routeHarness.loaderData = { canonicalBaseUrl: 'https://market.example', directory: emptyDirectory }
    installServerFns(async () => { throw new Error('directory offline') })

    renderRoute()
    const checkConnection = routeHarness.installProps?.onCheckConnection as (() => void) | undefined
    act(() => checkConnection?.())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Last confirmed Call records are retained')
    expect(alert.className).not.toContain('text-destructive')
    expect(routeHarness.installProps).toBeTruthy()
  })

  it('keeps known Agents visible when a directory refresh fails', async () => {
    installServerFns(async () => { throw new Error('directory offline') })
    renderRoute()

    const consoleView = screen.getByTestId('agent-console')
    const addAgent = screen.getByRole('region', { name: 'Add another Agent' })
    expect(consoleView.compareDocumentPosition(addAgent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Connect an Agent' }))
    const checkConnection = routeHarness.installProps?.onCheckConnection as (() => void) | undefined
    act(() => checkConnection?.())

    expect(await screen.findByText('Agents could not be refreshed')).toBeTruthy()
    expect(routeHarness.consoleProps?.accessUnavailable).toBe(false)
    expect(routeHarness.consoleProps?.directory).toEqual(directory)
    expect(screen.getByTestId('agent-console')).toBeTruthy()
  })

  it('scopes an older-page failure beside its retry without hiding loaded Agents', async () => {
    const pagedDirectory = { ...directory, nextCursor: 'cursor:more' }
    routeHarness.loaderData = { canonicalBaseUrl: 'https://market.example', directory: pagedDirectory }
    installServerFns(async () => { throw new Error('older agents offline') })
    renderRoute()

    fireEvent.click(screen.getByRole('button', { name: 'Load more Agents' }))

    expect((await screen.findByRole('alert')).textContent).toContain('The Agents already shown remain available')
    expect(screen.getByRole('button', { name: 'Try loading more Agents again' })).toBeTruthy()
    expect(routeHarness.consoleProps?.accessUnavailable).toBe(false)
    expect(routeHarness.consoleProps?.directory).toEqual(pagedDirectory)
  })

  it('preserves an unmatched loader-backed locator for the in-shell not-found state', async () => {
    routeHarness.search = { caller: FOREIGN_PRINCIPAL_ID }
    installServerFns()

    renderRoute()
    await waitFor(() => expect(routeHarness.consoleProps?.selectedPrincipalId).toBe(FOREIGN_PRINCIPAL_ID))
    expect(routeHarness.navigate).not.toHaveBeenCalled()
    expect(screen.queryByTestId('agent-install')).toBeNull()
  })

  it('links key management to settings without exposing a second revoke control', async () => {
    routeHarness.search = { caller: PRINCIPAL_ID }
    installServerFns()
    renderRoute()

    await waitFor(() => expect(routeHarness.consoleProps?.directory).toEqual(directory))
    expect(screen.getByRole('link', { name: 'Manage Agent keys' }).getAttribute('href')).toBe('/owner/settings/agent-keys')
    expect(routeHarness.consoleProps?.onRevokeCredential).toBeUndefined()
    const clearSelection = routeHarness.consoleProps?.onClearSelectedPrincipal as (() => void) | undefined
    clearSelection?.()
    expect(routeHarness.navigate).toHaveBeenCalledWith({
      to: '/agent-access',
      search: {},
      replace: true,
    })
  })
  it('shows the exact request before any Agent exists and preserves its review callback', async () => {
    routeHarness.search = { grantRef: 'grant:codex', state: 'callback-state' }
    routeHarness.loaderData = { canonicalBaseUrl: 'https://market.example', directory: { items: [], details: [] } }
    routeHarness.readRequest.mockResolvedValue({ kind: 'request', grantRef: 'grant:codex', revision: 1, phase: 'pending',
      clientName: 'Codex', environment: 'sandbox', flow: 'authorization_code', createdAt: 1, expiresAt: 999 })
    installServerFns()
    renderRoute()
    expect(await screen.findByRole('heading', { name: 'Your Agent is asking for access' })).toBeTruthy()
    expect(screen.getByText('Codex · Sandbox')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Review access request' }).getAttribute('href')).toBe('/agent-access/authorize?grant_ref=grant%3Acodex&state=callback-state')
    expect(screen.queryByTestId('agent-install')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Access approved; waiting for your Agent' })).toBeNull()
    expect(routeHarness.readRequest).toHaveBeenCalledWith({ data: { grantRef: 'grant:codex' } })
  })

  it.each([
    { phase: 'pending', title: 'Your Agent is asking for access', setup: 'oauth' },
    { phase: 'issuing', title: 'Preparing the approved access' },
    { phase: 'approved', title: 'Access approved; waiting for your Agent' },
    { phase: 'exchanging', title: 'Your Agent is collecting its access' },
  ] as const)('gives the $phase request the only progress and setup lane', async ({ phase, title, setup }) => {
    const request = onboardingRequest(phase)
    routeHarness.search = { grantRef: request.grantRef, ...(setup === undefined ? {} : { setup }) }
    routeHarness.loaderData = { canonicalBaseUrl: 'https://market.example', directory, onboarding: request, directoryUnavailable: false }
    routeHarness.readRequest.mockResolvedValue(request)
    installServerFns()

    renderRoute()

    expect(await screen.findByRole('heading', { name: title })).toBeTruthy()
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(screen.queryByTestId('agent-install')).toBeNull()
    expect(routeHarness.installProps).toBeUndefined()
    expect(screen.queryByRole('region', { name: 'Add another Agent' })).toBeNull()
    if (phase === 'pending') expect(screen.getByRole('link', { name: 'Review access request' })).toBeTruthy()
  })

  it('hands first-use progress back to the Agent after access exchange', async () => {
    const request = onboardingRequest('exchanged')
    routeHarness.search = { grantRef: request.grantRef }
    routeHarness.loaderData = { canonicalBaseUrl: 'https://market.example', directory, onboarding: request, directoryUnavailable: false }
    routeHarness.readRequest.mockResolvedValue(request)
    installServerFns()

    renderRoute()

    expect(await screen.findByRole('heading', { name: 'Access returned to your Agent' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Explore Tools with your Agent' })).toBeTruthy()
  })

  it('keeps the exact original Call recovery action beside an in-flight request', async () => {
    const request = onboardingRequest('exchanging')
    const callRef = 'call:request-original'
    const canonical = canonicalAgentRecord([caller])
    const originalCall = {
      callRef,
      credentialRef: KEY_ID,
      toolRef: TOOL_REF,
      createdAt: 1,
      updatedAt: 2,
      toolLabel: 'Research',
      providerRef: 'provider:route',
      state: 'outcome_unknown' as const,
      deliveryState: 'unknown' as const,
      paymentState: 'unknown' as const,
    }
    const directoryWithRecovery = projectAgentDirectory([caller], [canonical], [], [{
      principalRef: PRINCIPAL_ID,
      dataState: 'source',
      activityIsDone: true,
      activity: [originalCall],
    }])
    routeHarness.search = { grantRef: request.grantRef, callRef }
    routeHarness.loaderData = {
      canonicalBaseUrl: 'https://market.example',
      directory: directoryWithRecovery,
      onboarding: request,
      directoryUnavailable: false,
    }
    routeHarness.readRequest.mockResolvedValue(request)
    installServerFns(async () => directoryWithRecovery)

    renderRoute()

    expect(await screen.findByRole('heading', { name: 'Your Agent is collecting its access' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Resolve the existing Call' })).toBeTruthy()
    expect(screen.getByText('Needs recovery')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Check existing Call' }).getAttribute('href'))
      .toBe(`/calls/${encodeURIComponent(callRef)}?returnTo=agent`)
    expect(screen.queryByTestId('agent-install')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Add another Agent' })).toBeNull()
  })

  it('rejects ambiguous or malformed progress locators without selecting another attempt', () => {
    expect(validateAgentAccessSearch({ grantRef: 'grant:one', userCode: [] })).toEqual({ requestInvalid: true })
    expect(validateAgentAccessSearch({ grantRef: '   ' })).toEqual({ requestInvalid: true })
    expect(validateAgentAccessSearch({ callRef: ['call:one'] })).toEqual({ callInvalid: true })
    expect(validateAgentAccessSearch({ callRef: 'call:bare' })).toEqual({ callRef: 'call:bare', callInvalid: true })
    expect(validateAgentAccessSearch({ caller: 'not-a-principal', callRef: 'call:malformed-caller' }))
      .toEqual({ callRef: 'call:malformed-caller', callInvalid: true })
    expect(validateAgentAccessSearch({ caller: PRINCIPAL_ID, callRef: 'call:caller' }))
      .toEqual({ caller: PRINCIPAL_ID, callRef: 'call:caller' })
    expect(validateAgentAccessSearch({ grantRef: 'grant:one', callRef: 'call:grant', state: 'opaque' }))
      .toEqual({ grantRef: 'grant:one', callRef: 'call:grant', state: 'opaque' })
    expect(validateAgentAccessSearch({ caller: 'not-a-principal', grantRef: 'grant:one', callRef: 'call:request' }))
      .toEqual({ callRef: 'call:request', grantRef: 'grant:one' })
    expect(validateAgentAccessSearch({ caller: PRINCIPAL_ID, grantRef: 'grant:one', callRef: 'call:caller-and-request' }))
      .toEqual({ caller: PRINCIPAL_ID, callRef: 'call:caller-and-request', grantRef: 'grant:one' })
    expect(validateAgentAccessSearch({ caller: PRINCIPAL_ID, grantRef: 'grant:one', userCode: 'user:two', callRef: 'call:conflict' }))
      .toEqual({ caller: PRINCIPAL_ID, callRef: 'call:conflict', callInvalid: true, requestInvalid: true })
    expect(validateAgentAccessSearch({ grantRef: 'grant:one', callRef: 'call:one', state: 'opaque' })).toEqual({ grantRef: 'grant:one', callRef: 'call:one', state: 'opaque' })
  })

  it('blocks an incomplete Call link without selecting another Call or offering new actions', () => {
    const active: AgentCredentialSource = { ...caller, key: { ...caller.key, authorityMode: 'approval_required' },
      grant: { ...caller.grant!, authorityMode: 'approval_required' } }
    const canonical = canonicalAgentRecord([active])
    const otherCall = { callRef: 'call:other', credentialRef: KEY_ID, toolRef: TOOL_REF, createdAt: 1, updatedAt: 2 }
    const directoryWithOtherCall = projectAgentDirectory([active], [canonical], [], [{ principalRef: PRINCIPAL_ID,
      dataState: 'source', activityIsDone: true, liveCalls: [{ ...otherCall, phase: 'running' }], activity: [] }])
    const readDirectory = vi.fn(async () => directoryWithOtherCall)
    routeHarness.loaderData = { canonicalBaseUrl: 'https://market.example', directory: directoryWithOtherCall }
    routeHarness.search = validateAgentAccessSearch({ callRef: 'call:original' })
    installServerFns(readDirectory)

    renderRoute()

    expect(screen.getByText('This Call link is incomplete or invalid. Open the original link from your Agent. Another Call will not be selected.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'View live Call' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Return to selected Tool' })).toBeNull()
    expect(screen.queryByRole('button', { name: /connect|purchase|buy/iu })).toBeNull()
    expect(screen.queryByTestId('agent-install')).toBeNull()
    expect(screen.queryByTestId('agent-console')).toBeNull()
    expect(readDirectory).not.toHaveBeenCalled()
    expect(routeHarness.navigate).not.toHaveBeenCalled()
  })

  it('keeps a pending request and consent independent of the Agent directory', async () => {
    const loader = AgentAccessRoute.options.loader
    if (typeof loader !== 'function') throw new Error('loader_missing')
    const pending = { kind: 'request', grantRef: 'grant:pending', revision: 1, phase: 'pending', clientName: 'Codex',
      environment: 'sandbox', flow: 'authorization_code', createdAt: 1, expiresAt: 999 }
    routeHarness.readRequest.mockResolvedValue(pending)
    routeHarness.readDirectory.mockRejectedValue(new Error('directory unavailable'))
    await expect(loader({ deps: { grantRef: 'grant:pending' }, location: { pathname: '/agent-access' } } as never))
      .resolves.toMatchObject({ directory: { items: [], details: [] }, onboarding: pending })
    await expect(loader({ deps: {}, location: { pathname: '/agent-access/authorize' } } as never)).resolves.toMatchObject({ directory: { items: [], details: [] } })
    expect(routeHarness.readDirectory).not.toHaveBeenCalled()
  })
  it('renders a recoverable initial source outage without losing the Call locator', async () => {
    const loader = AgentAccessRoute.options.loader
    if (typeof loader !== 'function') throw new Error('loader_missing')
    routeHarness.readDirectory.mockRejectedValue(new Error('directory unavailable'))
    await expect(loader({ deps: { caller: PRINCIPAL_ID, callRef: 'call:original' }, location: { pathname: '/agent-access' } } as never))
      .resolves.toMatchObject({ directoryUnavailable: true, directory: { items: [], details: [] } })
    expect(routeHarness.readDirectory).toHaveBeenCalledWith({ data: { principalRef: PRINCIPAL_ID, callRef: 'call:original' } })
  })

})
