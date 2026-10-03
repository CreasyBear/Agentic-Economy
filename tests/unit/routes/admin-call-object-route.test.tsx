/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type * as ClerkModule from '@clerk/tanstack-react-start'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
const clerkAuth = vi.hoisted(() => ({ orgId: null as string | null, isLoaded: true }))

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof ClerkModule>()),
  OrganizationSwitcher: () => null,
  UserButton: () => null,
  useAuth: () => clerkAuth,
}))
vi.mock('@/components/ae/command-panel', () => ({ AeCommandPanel: () => null }))
vi.mock('@/components/ae/layout/AeNetworkHealthIndicator', () => ({
  AeNetworkHealthBanner: () => null,
  AeNetworkHealthIndicator: () => null,
}))
vi.mock('@/components/ae/layout/ThemeToggle', () => ({ ThemeToggle: () => null }))
vi.mock('@/components/ae/layout/app-shell/OperatorWorkspaceMenu', () => ({ OperatorWorkspaceMenu: () => null }))
vi.mock('@/components/ae/layout/app-shell/WorkspaceMenu', () => ({ WorkspaceMenu: () => null }))
vi.mock('@/components/ae/website/AeSiteNav', () => ({
  AeSiteDrawerNav: () => null,
  AeSiteIconButton: () => null,
  AeSitePrimaryNav: () => null,
}))

import { AeAppHeader } from '@/components/ae/layout/app-shell/AeAppHeader'
import { OperatorChromeProvider } from '@/components/ae/layout/AeOperatorPage'
import { AdminCallObjectPage } from '@/components/ae/admin/call-object/AdminCallObjectPage'
import { parseCallRef } from '@/modules/capability-execution/call-contracts'
import type { CallStatusResult } from '@/modules/capability-execution/call-recovery-contracts'
import {
  projectCallReceipt,
  projectFoundCallPurchaseStatus,
} from '@/modules/capability-execution/call-receipt-view'
import type { AdminCallView } from '@/lib/operator/admin-console/views'

afterEach(() => {
  cleanup()
  clerkAuth.orgId = null
  clerkAuth.isLoaded = true
})

const callRefText = `operation-invocation:v1:${'a'.repeat(64)}`
const parsedCallRef = parseCallRef(callRefText)
if (parsedCallRef.kind === 'malformed') throw new Error('admin_call_fixture_ref_invalid')

const uncertainStatus = {
  kind: 'found',
  callRef: callRefText,
  version: 1,
  toolRef: `operation:v1:${'b'.repeat(64)}`,
  state: 'reconciliation_required',
  usage: {
    usageRef: 'usage:admin-call-test',
    observedAt: Date.UTC(2026, 8, 22, 3),
    chargeState: 'outcome_unknown',
    amount: { currency: 'AUD', units: '0', exponent: 2 },
    priceDigest: `sha256:${'c'.repeat(64)}`,
  },
} satisfies Extract<CallStatusResult, { kind: 'found' }>

const uncertainView: AdminCallView = {
  kind: 'call',
  ref: parsedCallRef.ref,
  state: 'reconciliation_required',
  purchase: projectFoundCallPurchaseStatus(uncertainStatus),
  receipt: projectCallReceipt(uncertainStatus),
  quoteRef: null,
  toolRef: null,
  workspaceRef: null,
  agentRef: null,
  correlationId: null,
  resolution: null,
  answerModelCost: null,
  timeline: [],
}

function renderCallPage(view: AdminCallView = uncertainView) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/search' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  const renderTree = () => (
    <RouterContextProvider router={router}>
      <OperatorChromeProvider>
        <AeAppHeader
          signedIn
          operatorRole="admin"
          minimal={false}
          mobileNavOpen={false}
          setMobileNavOpen={() => undefined}
          elevated={false}
          hydrated
          chatFrame={false}
        />
        <AdminCallObjectPage result={view} />
      </OperatorChromeProvider>
    </RouterContextProvider>
  )
  const rendered = render(renderTree())
  return { ...rendered, router, rerenderTree: () => rendered.rerender(renderTree()) }
}

describe('/admin/calls/$callRef', () => {
  it('shows the whole answer subtotal and its unpriced Jev request separately from Call money', () => {
    const requests = [
      { requestRef: 'sdk:one:0', source: 'openrouter' as const, purpose: 'initial' as const, requestedModel: 'test/model', model: 'test/actual',
        inputTokens: 10, outputTokens: 20, providerGenerationId: 'generation:one', accounting: { status: 'priced' as const, amountUsd: '0.001', source: 'inline' as const } },
      { requestRef: 'jev:one', source: 'jev' as const, purpose: 'discovery_rerank' as const, requestedModel: '~typesafe/jev-latest',
        accounting: { status: 'unpriced' as const, reason: 'jev_usage_only' as const } },
    ]
    renderCallPage({ ...uncertainView, answerModelCost: {
      cost: { turnRef: 'turn:answer', status: 'incomplete', knownCostUsd: '0.001', requestCount: 2, unknownRequestCount: 1,
        requests }, callRefs: [callRefText, 'operation-invocation:v1:second'], callsTruncated: false,
    } })
    expect(screen.getByText('Known subtotal US$0.001 · incomplete (1 unpriced request)')).toBeTruthy()
    expect(screen.getByText('The cost of the originating chat answer, shared by all its Calls.')).toBeTruthy()

    fireEvent.click(screen.getByText('Request details'))
    const table = screen.getByRole('table', { name: 'Answer model requests' })
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent?.trim())).toEqual([
      'Request', 'Model', 'Tokens in / out', 'USD cost',
    ])
    const requestRows = () => within(table).getAllByRole('row').slice(1)
    const firstColumnValues = () => requestRows().map((row) => within(row).getAllByRole('cell')[0]?.textContent?.trim())
    expect(firstColumnValues()).toEqual(['OpenRouter · initialgeneration:one', 'Jev · discovery rerankjev:one'])

    expect(within(table).getByRole('button', { name: 'Sort by Request' })).toBeTruthy()
    expect(within(table).getByRole('button', { name: 'Sort by Model' })).toBeTruthy()
    expect(within(table).getAllByRole('columnheader')[2]?.getAttribute('aria-sort')).toBeNull()
    expect(within(table).getAllByRole('columnheader')[3]?.getAttribute('aria-sort')).toBeNull()
    expect(within(table).getAllByRole('columnheader')[2]?.hasAttribute('data-numeric')).toBe(true)
    expect(within(table).getAllByRole('columnheader')[3]?.hasAttribute('data-numeric')).toBe(true)
    expect(within(table).getByText('test/actual')).toBeTruthy()
    expect(within(table).getByText('Reported model')).toBeTruthy()
    expect(within(table).getByText('~typesafe/jev-latest')).toBeTruthy()
    expect(within(table).getByText('Requested model')).toBeTruthy()
    expect(within(table).getByText('10 / 20')).toBeTruthy()
    expect(within(table).getByText('Unknown / Unknown')).toBeTruthy()
    expect(within(table).getByText('0.001', { exact: true })).toBeTruthy()
    expect(within(table).getByText('Response usage')).toBeTruthy()
    expect(within(table).getByText('Unknown', { exact: true })).toBeTruthy()
    expect(within(table).getByText('jev usage only')).toBeTruthy()

    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Request' }))
    expect(within(table).getAllByRole('columnheader')[0]?.getAttribute('aria-sort')).toBe('ascending')
    expect(firstColumnValues()).toEqual(['OpenRouter · initialgeneration:one', 'Jev · discovery rerankjev:one'])
    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Model' }))
    expect(within(table).getAllByRole('columnheader')[1]?.getAttribute('aria-sort')).toBe('ascending')
    expect(firstColumnValues()).toEqual(['Jev · discovery rerankjev:one', 'OpenRouter · initialgeneration:one'])
    expect(requests.map((request) => request.requestRef)).toEqual(['sdk:one:0', 'jev:one'])

    expect(screen.getByText('test/actual')).toBeTruthy()
    expect(screen.getByText('jev usage only')).toBeTruthy()
    expect(screen.getByText('Related Calls (2)')).toBeTruthy()
    expect(screen.getByText('Unknown')).toBeTruthy()
  })

  it('shows the canonical uncertainty sentence without claiming a zero charge', () => {
    const { container } = renderCallPage()
    const uncertainty = uncertainView.receipt.issue?.moneyMovement
    if (uncertainty === undefined) throw new Error('admin_call_fixture_uncertainty_missing')

    expect(screen.getByText(uncertainty)).toBeTruthy()
    expect(container.textContent).not.toContain('A$0.00')
  })

  it('refreshes route data when the active organization changes', async () => {
    const page = renderCallPage()
    const invalidate = vi.spyOn(page.router, 'invalidate')
    expect(invalidate).not.toHaveBeenCalled()

    clerkAuth.orgId = 'org_test'
    page.rerenderTree()
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
  })

})
