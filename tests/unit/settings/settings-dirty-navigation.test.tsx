/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
})
