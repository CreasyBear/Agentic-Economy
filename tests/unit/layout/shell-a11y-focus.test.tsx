/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import '../../setup/jsdom-platform'
import '../../setup/jsdom-dialog'

import { AeAppShell } from '@/components/ae/layout/AeAppShell'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEventOnce: vi.fn(),
}))

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start')>()),
  Show: ({ when, children, fallback }: { when: string; children: ReactNode; fallback?: ReactNode }) =>
    when === 'signed-out' ? children : (fallback ?? null),
  UserButton: () => <button type="button" aria-label="Account menu" />,
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => (
      <a href={to} {...rest}>{children}</a>
    ),
    useRouter: () => ({ routesByPath: {} }),
  }
})

afterEach(cleanup)

function focusableSelector(): string {
  return [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ')
}

function firstFocusableIn(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(focusableSelector())
}

describe('AeAppShell skip link (S-19)', () => {
  it('points at main-content with high-visibility focus ring tokens', () => {
    renderAppShell()

    const skip = screen.getByTestId('skip-to-content')
    expect(skip).toHaveAttribute('href', '#main-content')
    expect(skip.className).toContain('focus-visible:ring-2')
    expect(skip.className).toContain('focus-visible:ring-ring')
    expect(skip.className).toContain('focus-visible:ring-offset-2')
  })

  it('is the first tabbable element before shell chrome', () => {
    renderAppShell()

    const skip = screen.getByTestId('skip-to-content')
    const shellRoot = skip.parentElement
    expect(shellRoot).toBeTruthy()

    const firstFocusable = firstFocusableIn(shellRoot!)
    expect(firstFocusable).toBe(skip)

    const header = shellRoot!.querySelector('[data-shell="app-header"]')
    expect(header).toBeTruthy()
    expect(
      skip.compareDocumentPosition(header!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })
})

describe('AePublicPage main landmark (S-19)', () => {
  it('sets tabIndex -1 on editorial main-content', () => {
    render(
      <AePublicPage>
        <p>Editorial body</p>
      </AePublicPage>,
    )

    const main = document.getElementById('main-content')
    expect(main).toBeTruthy()
    expect(main).toHaveAttribute('tabindex', '-1')
  })

  it('sets tabIndex -1 on workspace main-content', () => {
    render(
      <AePublicPage
        kind="workspace"
        title="Workspace"
        description="Bounded surface."
      >
        <p>Workspace body</p>
      </AePublicPage>,
    )

    const main = document.getElementById('main-content')
    expect(main).toHaveAttribute('tabindex', '-1')
    expect(main).toHaveAttribute('data-shell-mode', 'workspace')
  })
})

describe('Dialog focus primitives (S-19)', () => {
  it('exposes aria-modal and accessible name while open', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test dialog</DialogTitle>
            <DialogDescription>Focus trap surface.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Test dialog' })
    expect(dialog).toBeVisible()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })
})

describe('Sheet modal primitives (S-19)', () => {
  it('exposes role dialog and aria-modal while open', () => {
    render(
      <Sheet open onOpenChange={() => {}}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Test sheet</SheetTitle>
            <SheetDescription>Drawer surface.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    )

    const sheet = screen.getByRole('dialog', { name: 'Test sheet' })
    expect(sheet).toBeVisible()
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(sheet).toHaveAttribute('data-slot', 'sheet-content')
  })
})

function renderAppShell(): void {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/market',
      staticData: { nav: { label: 'Market', header: { order: 0 } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/for-agents',
      staticData: { nav: { label: 'For agents', header: { order: 1 } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/for-providers',
      staticData: { nav: { label: 'For providers', header: { order: 2 } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/activity',
      staticData: { nav: { label: 'Calls', header: { order: 3 } } },
    }),
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in/$' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/market'] }),
  })

  render(
    <RouterContextProvider router={router}>
      <AeAppShell>
        <AePublicPage>
          <h1>Market</h1>
        </AePublicPage>
      </AeAppShell>
    </RouterContextProvider>,
  )
}
