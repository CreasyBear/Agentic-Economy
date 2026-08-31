// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AgentOperatorKeyReadback } from '@/modules/agent-access/agent-operator-view-model'

const routeHarness = vi.hoisted(() => ({
  search: {} as Readonly<{ caller?: string }>,
  location: { pathname: '/agent-access', hash: '' },
  navigate: vi.fn(),
  consoleProps: undefined as Record<string, unknown> | undefined,
  serverFns: new Map<unknown, (...args: never[]) => Promise<unknown>>(),
  readConsoleRef: Symbol('read-console'),
  revokeRef: Symbol('revoke'),
  readApprovalsRef: Symbol('read-approvals'),
  decideApprovalRef: Symbol('decide-approval'),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: ReactNode }) => children ?? null,
  Outlet: () => null,
  createFileRoute: () => (options: Record<string, unknown>) => {
    const route = {
      ...options,
      useLoaderData: () => 'https://market.example',
      useSearch: () => routeHarness.search,
    }
    return { ...route, options: route }
  },
  useLocation: () => routeHarness.location,
  useNavigate: () => routeHarness.navigate,
}))

vi.mock('@tanstack/react-start', () => ({
  useServerFn: (reference: unknown) => routeHarness.serverFns.get(reference) ?? (async () => undefined),
}))

vi.mock('@/components/ae/console/AeAgentOperatorConsole', () => ({
  AeAgentOperatorConsole: (props: Record<string, unknown>) => {
    routeHarness.consoleProps = props
    return null
  },
}))

vi.mock('@/components/ae/console/AeAssistantInstallFunnel', () => ({
  AeAssistantInstallFunnel: () => null,
}))

vi.mock('@/components/ae/layout/AeOperatorShell', () => ({
  AeOperatorShell: ({ children }: { children?: ReactNode }) => children ?? null,
}))

vi.mock('@/lib/client/local-e2e-auth', () => ({
  isLocalE2EAuthBypassEnabled: () => false,
}))

vi.mock('@/lib/operator/route-options', () => ({ operatorRouteOptions: {} }))

vi.mock('@/lib/server/canonical-url.functions', () => ({
  readCanonicalBaseUrlServer: Symbol('canonical-url'),
}))

vi.mock('@/lib/server/agent-access-console.functions', () => ({
  readAgentAccessConsoleServer: routeHarness.readConsoleRef,
}))

vi.mock('@/modules/agent-access/agent-access.functions', () => ({
  revokeAgentAccessKeyServer: routeHarness.revokeRef,
}))

vi.mock('@/modules/capability-execution/operation-approval.functions', () => ({
  decideOperationApprovalServer: routeHarness.decideApprovalRef,
  listPendingOperationApprovalsServer: routeHarness.readApprovalsRef,
}))

import {
  Route as AgentAccessRoute,
  validateAgentAccessSearch,
} from '@/routes/_operator/agent-access'

const PRINCIPAL_ID = `prn_${'1'.repeat(32)}`
const FOREIGN_PRINCIPAL_ID = `prn_${'2'.repeat(32)}`
const KEY_ID = 'key_private_route_canary'

const caller: AgentOperatorKeyReadback = {
  key: {
    keyId: KEY_ID,
    name: 'Route assistant',
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'inspect_only',
    scopes: ['market_operations:invoke'],
    revoked: false,
    expired: false,
  },
  grant: {
    principalId: PRINCIPAL_ID,
    credentialId: KEY_ID,
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'inspect_only',
    lifecycle: 'active',
    expiresAt: 604_800_000,
    budget: {
      maximumSpendPerInvocation: { currency: 'USD', units: '500', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '2500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '10000', exponent: 2 },
      maximumConcurrentInvocations: 2,
    },
    rate: { maximumCallsPerMinute: 30, maximumCallsPerHour: 300 },
  },
  principalId: PRINCIPAL_ID,
  activity: [],
  dataState: 'source',
}

function renderRoute() {
  const Component = AgentAccessRoute.options.component
  if (Component === undefined) throw new Error('agent_access_route_component_missing')
  return render(createElement(Component))
}

function installServerFns(readConsole: () => Promise<readonly AgentOperatorKeyReadback[]>) {
  const revoke = vi.fn(async () => ({ kind: 'revoked' as const, keyId: KEY_ID }))
  routeHarness.serverFns.set(routeHarness.readConsoleRef, readConsole)
  routeHarness.serverFns.set(routeHarness.revokeRef, revoke)
  routeHarness.serverFns.set(routeHarness.readApprovalsRef, async () => [])
  routeHarness.serverFns.set(routeHarness.decideApprovalRef, async () => ({ kind: 'denied' }))
  return { revoke }
}

afterEach(() => {
  cleanup()
  routeHarness.search = {}
  routeHarness.location = { pathname: '/agent-access', hash: '' }
  routeHarness.navigate.mockReset()
  routeHarness.consoleProps = undefined
  routeHarness.serverFns.clear()
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
})

describe('agent-access caller route continuation', () => {
  it('passes the exact validated locator to client selection but never to the owner read', async () => {
    routeHarness.search = { caller: PRINCIPAL_ID }
    const readConsole = vi.fn(async () => [caller])
    installServerFns(readConsole)

    renderRoute()

    await waitFor(() => expect(routeHarness.consoleProps?.items).toEqual([caller]))
    expect(routeHarness.consoleProps?.selectedPrincipalId).toBe(PRINCIPAL_ID)
    expect(readConsole).toHaveBeenCalledWith()
    expect(routeHarness.navigate).not.toHaveBeenCalled()

    const getAgentHref = routeHarness.consoleProps?.getAgentHref as ((principalId: string) => string) | undefined
    expect(getAgentHref?.(PRINCIPAL_ID)).toBe(`/agent-access?caller=${PRINCIPAL_ID}`)
  })

  it('waits for a successful owner read before canonicalizing an unmatched locator away', async () => {
    routeHarness.search = { caller: FOREIGN_PRINCIPAL_ID }
    let resolveRead: ((value: readonly AgentOperatorKeyReadback[]) => void) | undefined
    const readConsole = vi.fn(() => new Promise<readonly AgentOperatorKeyReadback[]>((resolve) => {
      resolveRead = resolve
    }))
    installServerFns(readConsole)

    renderRoute()
    await waitFor(() => expect(readConsole).toHaveBeenCalledOnce())
    expect(routeHarness.navigate).not.toHaveBeenCalled()

    await act(async () => resolveRead?.([caller]))
    await waitFor(() => expect(routeHarness.navigate).toHaveBeenCalledWith({
      to: '/agent-access',
      search: {},
      replace: true,
    }))
    expect(readConsole).toHaveBeenCalledWith()
  })

  it('preserves an unmatched locator when the owner read fails', async () => {
    routeHarness.search = { caller: FOREIGN_PRINCIPAL_ID }
    const readConsole = vi.fn(async () => {
      throw new Error('read unavailable')
    })
    installServerFns(readConsole)

    renderRoute()

    await waitFor(() => expect(routeHarness.consoleProps?.accessUnavailable).toBe(true))
    expect(routeHarness.navigate).not.toHaveBeenCalled()
    expect(readConsole).toHaveBeenCalledWith()
  })

  it('clears selection with replace and revokes only the selected key id', async () => {
    routeHarness.search = { caller: PRINCIPAL_ID }
    const readConsole = vi.fn(async () => [caller])
    const { revoke } = installServerFns(readConsole)
    renderRoute()

    await waitFor(() => expect(routeHarness.consoleProps?.items).toEqual([caller]))
    const clearSelection = routeHarness.consoleProps?.onClearSelectedPrincipal as (() => void) | undefined
    clearSelection?.()
    expect(routeHarness.navigate).toHaveBeenCalledWith({
      to: '/agent-access',
      search: {},
      replace: true,
    })

    const onRevoke = routeHarness.consoleProps?.onRevoke as ((keyId: string) => Promise<void>) | undefined
    const revokePromise = onRevoke?.(KEY_ID)
    expect(revokePromise).toBeInstanceOf(Promise)
    await act(async () => revokePromise)
    await waitFor(() => expect(revoke).toHaveBeenCalledWith({ data: { keyId: KEY_ID } }))
    expect(JSON.stringify(revoke.mock.calls)).not.toContain(PRINCIPAL_ID)
    expect(JSON.stringify(revoke.mock.calls)).not.toContain(FOREIGN_PRINCIPAL_ID)
  })
})
