/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { AeNavigationSafetyBoundary } from '@/components/ae/layout/AeNavigationSafetyBoundary'

beforeEach(() => window.history.replaceState(null, '', '/edit'))
afterEach(cleanup)

describe('AeNavigationSafetyBoundary focus recovery', () => {
  it('falls back from a removed departure trigger to Save, then to the form heading', async () => {
    const first = await renderHarness(false)
    const departure = screen.getByRole('link', { name: 'Leave editor' })
    departure.focus()
    fireEvent.click(departure)
    await screen.findByRole('alertdialog')
    fireEvent.click(screen.getByRole('button', { name: 'Continue editing' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' })))
    first.unmount()

    await renderHarness(true)
    const secondDeparture = screen.getByRole('link', { name: 'Leave editor' })
    secondDeparture.focus()
    fireEvent.click(secondDeparture)
    await screen.findByRole('alertdialog')
    fireEvent.click(screen.getByRole('button', { name: 'Continue editing' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Editable source' })))
  })
})

async function renderHarness(removeSaveOnDeparture: boolean) {
  const rootRoute = createRootRoute({ component: Outlet })
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/edit',
      component: () => <SafetyHarness removeSaveOnDeparture={removeSaveOnDeparture} />,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/done',
      component: () => <h1>Done</h1>,
    }),
  ])
  const router = createRouter({ routeTree, history: createBrowserHistory() })
  await router.load()
  return render(<RouterProvider router={router} />)
}

function SafetyHarness({ removeSaveOnDeparture }: { removeSaveOnDeparture: boolean }) {
  const [showDeparture, setShowDeparture] = useState(true)
  const [showSave, setShowSave] = useState(true)
  const saveRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  return (
    <AeNavigationSafetyBoundary
      state={{ dirty: true, pending: false, saveOutcome: 'idle' }}
      title="Leave editor?"
      pendingTitle="Finishing save"
      description="Unsaved changes remain."
      pendingDescription="Waiting for save."
      saveActionRef={saveRef}
      headingRef={headingRef}
    >
      <h2 ref={headingRef} tabIndex={-1}>Editable source</h2>
      {showSave ? <button ref={saveRef} type="button">Save</button> : null}
      {showDeparture ? (
        <Link
          to={'/done' as never}
          onClick={() => {
            setShowDeparture(false)
            if (removeSaveOnDeparture) setShowSave(false)
          }}
        >
          Leave editor
        </Link>
      ) : null}
    </AeNavigationSafetyBoundary>
  )
}
