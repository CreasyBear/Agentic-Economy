/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import {
  AeOwnerOfferingEditorWithNavigationSafety,
  type OwnerOfferingEditorValue,
  type OwnerOfferingSaveResult,
} from '@/components/ae/offerings/AeOwnerOfferings'
import { emptyOwnerOfferingEditorValue } from '@/components/ae/offerings/AeOwnerOfferings.exports'

async function renderEditor(onSave: (value: OwnerOfferingEditorValue) => Promise<OwnerOfferingSaveResult>) {
  const rootRoute = createRootRoute({ component: Outlet })
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/edit',
      component: () => (
        <AeOwnerOfferingEditorWithNavigationSafety
          initialValue={emptyOwnerOfferingEditorValue}
          onSave={onSave}
          draftKey="navigation-test"
        />
      ),
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/owner/offerings',
      component: () => <h1>Operations</h1>,
    }),
  ])
  const router = createRouter({
    routeTree,
    history: createBrowserHistory(),
  })

  await router.load()
  render(<RouterProvider router={router} />)
  return router
}

function dirtyEditor(): void {
  fireEvent.change(screen.getAllByLabelText(/Coverage/i)[0] as HTMLElement, {
    target: { value: 'Adelaide' },
  })
}

beforeEach(() => {
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/edit')
})

afterEach(cleanup)

describe('owner offering editor navigation safety', () => {
  it('blocks internal navigation, reports a stored draft truthfully, and restores focus', async () => {
    const onSave = vi.fn(async (value: OwnerOfferingEditorValue) => ({
      kind: 'saved' as const,
      value,
      message: 'Saved.',
    }))
    const router = await renderEditor(onSave)
    dirtyEditor()
    await waitFor(() => expect(window.sessionStorage.getItem('ae.ownerOfferingDraft.v1:navigation-test')).not.toBeNull())

    const back = screen.getByRole('link', { name: 'Back to Operations' })
    back.focus()
    fireEvent.click(back)

    expect((await screen.findByRole('alertdialog')).textContent).toContain(
      'A draft remains in this browser, but it is not saved to your supplier account.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue editing' }))
    await waitFor(() => expect(document.activeElement).toBe(back))
    expect(router.state.location.pathname).toBe('/edit')

    fireEvent.click(back)
    await screen.findByRole('alertdialog')
    fireEvent.click(screen.getByRole('button', { name: 'Leave anyway' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/owner/offerings'))
  })

  it('warns that dirty changes only exist on the page when storage is denied', async () => {
    const availableStorage = window.sessionStorage
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => { throw new DOMException('denied', 'SecurityError') },
        removeItem: () => undefined,
      },
    })
    try {
      await renderEditor(async (value) => ({ kind: 'saved', value, message: 'Saved.' }))
      dirtyEditor()
      fireEvent.click(screen.getByRole('link', { name: 'Back to Operations' }))

      expect((await screen.findByRole('alertdialog')).textContent).toContain(
        'These changes exist only on this page and will be lost if you leave.',
      )
    } finally {
      Object.defineProperty(window, 'sessionStorage', { configurable: true, value: availableStorage })
    }
  })

  it('keeps a requested destination blocked until a pending save succeeds', async () => {
    let finishSave: ((result: OwnerOfferingSaveResult) => void) | undefined
    const onSave = vi.fn(() => new Promise<OwnerOfferingSaveResult>((resolve) => {
      finishSave = resolve
    }))
    const router = await renderEditor(onSave)
    dirtyEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    fireEvent.click(screen.getByRole('link', { name: 'Back to Operations' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toContain('Stay on this page until the outcome is known.')
    expect(screen.getByRole('button', { name: 'Keep waiting' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Leave anyway' })).toBeNull()
    expect(router.state.location.pathname).toBe('/edit')

    finishSave?.({
      kind: 'saved',
      value: { ...emptyOwnerOfferingEditorValue, serviceAreaSummary: 'Adelaide' },
      message: 'Saved.',
    })
    await waitFor(() => expect(router.state.location.pathname).toBe('/owner/offerings'))
  })

  it('cancels blocked navigation and retains entered data when a save is rejected', async () => {
    let rejectSave: ((reason?: unknown) => void) | undefined
    const onSave = vi.fn(() => new Promise<OwnerOfferingSaveResult>((_resolve, reject) => {
      rejectSave = reject
    }))
    const router = await renderEditor(onSave)
    dirtyEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    fireEvent.click(screen.getByRole('link', { name: 'Back to Operations' }))
    await screen.findByRole('alertdialog')

    rejectSave?.(new Error('private upstream detail'))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(router.state.location.pathname).toBe('/edit')
    expect(screen.getByDisplayValue('Adelaide')).toBeTruthy()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('The Operation save could not be confirmed.')
    expect(alert.textContent).not.toContain('private upstream detail')
  })

  it('enables native beforeunload protection only while the editor is dirty', async () => {
    await renderEditor(async (value) => ({ kind: 'saved', value, message: 'Saved.' }))
    const cleanUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanUnload)
    expect(cleanUnload.defaultPrevented).toBe(false)

    dirtyEditor()
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyUnload)
    expect(dirtyUnload.defaultPrevented).toBe(true)
  })
})
