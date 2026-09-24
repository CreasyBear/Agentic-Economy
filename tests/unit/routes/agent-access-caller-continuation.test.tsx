// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AgentCredentialSource, AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import { projectAgentDirectory } from '@/modules/agent-access/agent-access-console'
import { canonicalAgentRecord } from '../../helpers/agent-directory-fixture'

const routeHarness = vi.hoisted(() => ({
  search: {} as Readonly<{ caller?: string; resumeTool?: string }>,
  location: { pathname: '/agent-access', hash: '' },
  navigate: vi.fn(),
  consoleProps: undefined as Record<string, unknown> | undefined,
  installProps: undefined as Record<string, unknown> | undefined,
  loaderData: undefined as unknown as Readonly<{ canonicalBaseUrl: string; directory: AgentDirectoryProjection }>,
  serverFns: new Map<unknown, (...args: never[]) => Promise<unknown>>(),
  readDirectory: vi.fn(),
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
  Link: ({ to, params, children }: { to: string; params?: Record<string, string>; children?: ReactNode }) => (
    <a href={params?.toolRef === undefined ? to : to.replace('$toolRef', encodeURIComponent(params.toolRef))}>{children}</a>
  ),
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
})

describe('agent-access caller route continuation', () => {
  it('loads the directory before rendering the route', async () => {
    const loader = AgentAccessRoute.options.loader
    if (typeof loader !== 'function') throw new Error('agent_access_loader_missing')

    await expect(loader({} as never)).resolves.toEqual({
      canonicalBaseUrl: 'https://market.example',
      directory,
    })
    expect(routeHarness.readDirectory).toHaveBeenCalledOnce()
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
    expect(alert.textContent).toContain('Known Balance information is unaffected')
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
})
