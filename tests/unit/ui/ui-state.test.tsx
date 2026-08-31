/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { AeInlineState } from '@/components/ae/feedback/AeInlineState'
import { AePageState } from '@/components/ae/layout/AePageState'
import {
  AE_UI_STATES,
  AE_UI_STATE_PRESENTATIONS,
  getAeUiStatePresentation,
} from '@/lib/ui/ui-state'

describe('canonical UI state contract', () => {
  it('defines complete presentation and recovery semantics for every state', () => {
    expect(Object.keys(AE_UI_STATE_PRESENTATIONS).sort()).toEqual([...AE_UI_STATES].sort())

    for (const state of AE_UI_STATES) {
      const presentation = getAeUiStatePresentation(state)
      expect(presentation.label.trim()).not.toBe('')
      expect(presentation.title.trim()).not.toBe('')
      expect(presentation.description.trim()).not.toBe('')
    }
  })

  it('never offers command retry when the outcome is unknown', () => {
    const unknown = getAeUiStatePresentation('outcome_unknown')
    expect(unknown.recoveryActions).toEqual(['reload_status', 'escalate'])
    expect(unknown.recoveryActions).not.toContain('retry_confirmed_no_dispatch')
  })

  it('renders state-driven page copy while preserving factual overrides', () => {
    const first = renderAt(<AePageState state="unavailable" />)
    expect(screen.getByRole('alert').textContent).toContain('Temporarily unavailable')
    expect(screen.getByRole('alert').textContent).toContain('No newer state is claimed')
    first.unmount()

    renderAt(
      <AePageState
        state="outcome_unknown"
        title="Payout outcome unknown"
        description="Check payout status before starting another transfer."
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('Payout outcome unknown')
    expect(screen.getByRole('alert').textContent).toContain('Check payout status')
  })

  it('announces inline save truth without relying on a toast', () => {
    render(<AeInlineState state="saved" description="This draft is stored in your supplier account." />)
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.textContent).toContain('Saved')
    expect(status.textContent).toContain('stored in your supplier account')
  })
})

function renderAt(ui: ReactElement) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}
