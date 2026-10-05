/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('convex/react', () => ({ useMutation: () => vi.fn() }))
vi.mock('@/lib/server/workspace-profile.functions', () => ({ renameWorkspaceServer: vi.fn() }))

import { TaxProfileForm } from '@/components/ae/settings/TaxProfileForm'
import { WorkspaceNameEditor } from '@/components/ae/settings/WorkspaceNameEditor'

beforeEach(() => window.history.replaceState(null, '', '/edit'))
afterEach(cleanup)

async function renderRoute(component: () => React.ReactElement) {
  const rootRoute = createRootRoute({ component: Outlet })
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/edit', component }),
    createRoute({ getParentRoute: () => rootRoute, path: '/market', component: () => <h1>Tax</h1> }),
  ])
  const router = createRouter({ routeTree, history: createBrowserHistory() })
  await router.load()
  return render(<RouterProvider router={router} />)
}

describe('dirty settings navigation', () => {
  it('prompts before leaving a typed workspace name and not before a clean form', async () => {
    await renderRoute(() => <>
      <Link to="/market">Open Tax</Link>
      <WorkspaceNameEditor name="Acme" canonicalName="Acme" accountRevision={1} clerkOrgId="org_1" canEdit />
    </>)
    fireEvent.click(screen.getByRole('link', { name: 'Open Tax' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Tax' })).toBeTruthy()
  })

  it('keeps a typed workspace name on the page until the user leaves on purpose', async () => {
    await renderRoute(() => <>
      <Link to="/market">Open Tax</Link>
      <WorkspaceNameEditor name="Acme" canonicalName="Acme" accountRevision={1} clerkOrgId="org_1" canEdit />
    </>)
    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Renamed Acme' } })
    fireEvent.click(screen.getByRole('link', { name: 'Open Tax' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Leave without saving the workspace name?')
    fireEvent.click(screen.getByRole('button', { name: 'Continue editing' }))
    expect(screen.getByLabelText('Workspace name')).toHaveValue('Renamed Acme')
  })

  it('prompts for a dirty tax form and lets a clean tax form leave', async () => {
    await renderRoute(() => <>
      <Link to="/market">Open Tax</Link>
      <TaxProfileForm initialData={{ kind: 'missing', revision: 0 }} onSubmit={vi.fn()} />
    </>)
    fireEvent.change(screen.getByLabelText(/legal business name/i), { target: { value: 'Acme Pty Ltd' } })
    fireEvent.click(screen.getByRole('link', { name: 'Open Tax' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Leave without saving tax details?')
  })

  it.each([true, false])('resumes a departure after tax save only when no later draft remains (later edit: %s)', async laterEdit => {
    let finishSave!: () => void
    const onSubmit = vi.fn(() => new Promise<void>(resolve => { finishSave = resolve }))
    await renderRoute(() => <>
      <Link to="/market">Open Tax</Link>
      <TaxProfileForm initialData={{ kind: 'available', revision: 2, legalName: 'Acme Pty Ltd', abn: '51824753556', addressLine1: '1 Market Street', locality: 'Sydney', postalCode: '2000', country: 'AU' }} onSubmit={onSubmit} />
    </>)
    fireEvent.change(screen.getByLabelText('Legal business name'), { target: { value: 'Submitted Pty Ltd' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    if (laterEdit) fireEvent.change(screen.getByLabelText('Legal business name'), { target: { value: 'Later draft Pty Ltd' } })
    fireEvent.click(screen.getByRole('link', { name: 'Open Tax' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Tax details are still saving')
    await act(async () => { finishSave(); await Promise.resolve() })
    if (laterEdit) {
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
      expect(window.location.pathname).toBe('/edit')
      expect(screen.getByLabelText('Legal business name')).toHaveValue('Later draft Pty Ltd')
      expect(screen.getByRole('group', { name: 'Unsaved changes' })).toHaveTextContent('1 unsaved change')
    } else {
      await waitFor(() => expect(window.location.pathname).toBe('/market'))
      expect(screen.queryByLabelText('Legal business name')).toBeNull()
    }
  })
})
