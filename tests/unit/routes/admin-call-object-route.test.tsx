/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import type * as ClerkModule from '@clerk/tanstack-react-start'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof ClerkModule>()),
  UserButton: () => null,
}))
vi.mock('@/components/ae/command-panel', () => ({ AeCommandPanel: () => null }))
vi.mock('@/components/ae/layout/AeNetworkHealthIndicator', () => ({
  AeNetworkHealthBanner: () => null,
  AeNetworkHealthIndicator: () => null,
}))
vi.mock('@/components/ae/layout/app-shell/AeWorkspaceIdentity', () => ({ AeWorkspaceIdentity: () => null }))
vi.mock('@/components/ae/layout/ThemeToggle', () => ({ ThemeToggle: () => null }))
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

afterEach(cleanup)

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
  timeline: [],
}

function renderCallPage() {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/search' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(
    <RouterContextProvider router={router}>
      <OperatorChromeProvider>
        <AeAppHeader
          signedIn
          operatorRole="admin"
          canAccessAdmin={false}
          minimal={false}
          mobileNavOpen={false}
          setMobileNavOpen={() => undefined}
          elevated={false}
          hydrated
          chatFrame={false}
        />
        <AdminCallObjectPage result={uncertainView} />
      </OperatorChromeProvider>
    </RouterContextProvider>,
  )
}

describe('/admin/calls/$callRef', () => {
  it('shows the canonical uncertainty sentence without claiming a zero charge', () => {
    const { container } = renderCallPage()
    const uncertainty = uncertainView.receipt.issue?.moneyMovement
    if (uncertainty === undefined) throw new Error('admin_call_fixture_uncertainty_missing')

    expect(screen.getByText(uncertainty)).toBeTruthy()
    expect(container.textContent).not.toContain('A$0.00')
  })

  it('shows Call as the identity heading with the exact copyable reference beneath it', () => {
    renderCallPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Call' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy Reference' })).toBeTruthy()
    expect(screen.getByText(callRefText)).toBeTruthy()
  })
})
