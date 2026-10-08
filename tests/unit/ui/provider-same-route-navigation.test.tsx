// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider } from '@tanstack/react-router'
import { useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { AeNavigationSafetyBoundary } from '@/components/ae/layout/AeNavigationSafetyBoundary'
afterEach(cleanup)
async function show(dirty: boolean) {
  function Editor() {
    const ref = useRef<HTMLHeadingElement>(null)
    return <AeNavigationSafetyBoundary blockSearchChanges state={{ dirty, pending: false, saveOutcome: 'idle' }} title="Leave draft?" pendingTitle="Saving" description="Unsaved terms remain." pendingDescription="Waiting" saveActionRef={ref} headingRef={ref}>
      <h1 ref={ref} tabIndex={-1}>Saved draft</h1><Link to={'/edit' as never} search={{ draft: 'different' } as never}>Open different draft</Link>
    </AeNavigationSafetyBoundary>
  }
  const root = createRootRoute({ component: Outlet })
  const edit = createRoute({ getParentRoute: () => root, path: '/edit', validateSearch: (value: Record<string, unknown>) => ({ draft: value.draft }), component: Editor })
  const router = createRouter({ routeTree: root.addChildren([edit]), history: createMemoryHistory({ initialEntries: ['/edit?draft=original'] }) })
  await router.load(); render(<RouterProvider router={router} />); return router
}
describe('Provider draft search navigation guard', () => {
  it('retains dirty terms when the owner declines a same-path draft change', async () => {
    const router = await show(true)
    fireEvent.click(await screen.findByRole('link', { name: 'Open different draft' }))
    await screen.findByRole('alertdialog', { name: 'Leave draft?' })
    fireEvent.click(screen.getByRole('button', { name: 'Continue editing' }))
    expect(router.state.location.search.draft).toBe('original')
  })
  it('allows a clean same-path draft change without a discard prompt', async () => {
    const router = await show(false)
    fireEvent.click(await screen.findByRole('link', { name: 'Open different draft' }))
    await new Promise<void>(resolve => router.subscribe('onResolved', () => resolve()))
    expect(router.state.location.search.draft).toBe('different')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
