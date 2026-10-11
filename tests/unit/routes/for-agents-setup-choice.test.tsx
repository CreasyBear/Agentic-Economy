/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
} from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const { readCanonicalBaseUrlServer, readAvailabilityServer } = vi.hoisted(() => ({ readCanonicalBaseUrlServer: vi.fn(), readAvailabilityServer: vi.fn() }))

vi.mock('@/lib/server/canonical-url.functions', () => ({ readCanonicalBaseUrlServer }))
vi.mock('@/lib/server/availability.functions', () => ({ readAvailabilityServer }))

import { Route } from '@/routes/for-agents'

const forAgentsSearchValidator = (() => {
  const validator = Route.options.validateSearch
  if (typeof validator !== 'function') throw new Error('The /for-agents search validator is unavailable')
  return validator
})()

const forAgentsRouteComponent = (() => {
  const component = Route.options.component
  if (component === undefined) throw new Error('The /for-agents route component is unavailable')
  return component
})()

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  readCanonicalBaseUrlServer.mockResolvedValue('https://ae.example/')
  readAvailabilityServer.mockResolvedValue('soon')
})

describe('public Agent app setup choice', () => {
  it.each([
    ['codex', 'Codex MCP command'],
    ['claude-code', 'Claude Code MCP command'],
    ['cursor', 'Cursor MCP command'],
  ] as const)('restores the %s recipe from the public URL after a fresh mount', async (setupApp, recipeName) => {
    const { router } = renderForAgents(`/for-agents?setupApp=${setupApp}#agent-setup`)

    expect(await screen.findByRole('region', { name: recipeName })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Connect and approve access' })).toBeTruthy()
    for (const otherRecipe of ['Codex MCP command', 'Claude Code MCP command', 'Cursor MCP command']) {
      if (otherRecipe !== recipeName) {
        expect(screen.queryByRole('region', { name: otherRecipe })).toBeNull()
      }
    }
    expect(router.state.location.pathname).toBe('/for-agents')
    expect(router.state.location.search).toEqual({ setupApp })
    expect(router.state.location.hash).toBe('agent-setup')
  })

  it.each([
    '/for-agents?setupApp=Codex',
    '/for-agents?setupApp=%20codex',
    '/for-agents?setupApp=codex%20',
    '/for-agents?setupApp=opaque-token',
    '/for-agents?setupApp=codex&setupApp=cursor',
  ])('shows the chooser for invalid public setup choice %s', async (entry) => {
    renderForAgents(entry)

    expect(await screen.findByRole('group', { name: 'Choose your Agent app' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Codex MCP command' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Claude Code MCP command' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Cursor MCP command' })).toBeNull()
  })

  it.each([
    ['trimmed-looking value', ' codex'],
    ['case variant', 'Codex'],
    ['suffixed value', 'codex '],
    ['array', ['codex']],
    ['object', { app: 'codex' }],
    ['credential-like value', 'eyJhbGciOiJub25lIn0'],
  ])('rejects a %s and ignores unrelated search fields', (_description, setupApp) => {
    expect(forAgentsSearchValidator({ setupApp, apiKey: 'private', other: 'ignored' })).toEqual({})
  })

  it('writes selection and edits into the same URL, preserves the hash, and does not reload the public base URL', async () => {
    const { router } = renderForAgents('/market?from=previous', '/for-agents#agent-setup')

    const chooser = await screen.findByRole('group', { name: 'Choose your Agent app' })
    fireEvent.click(within(chooser).getByRole('button', { name: 'Codex' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ setupApp: 'codex' }))
    expect(router.state.location.pathname).toBe('/for-agents')
    expect(router.state.location.hash).toBe('agent-setup')
    expect(readCanonicalBaseUrlServer).toHaveBeenCalledTimes(1)

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Agent app' }))
    expect(await screen.findByRole('group', { name: 'Choose your Agent app' })).toBeTruthy()
    await waitFor(() => expect(router.state.location.search).toEqual({}))
    expect(router.state.location.pathname).toBe('/for-agents')
    expect(router.state.location.hash).toBe('agent-setup')
    expect(readCanonicalBaseUrlServer).toHaveBeenCalledTimes(1)

    router.history.back()
    await waitFor(() => expect(router.state.location.pathname).toBe('/market'))
    expect(router.state.location.search).toEqual({ from: 'previous' })
  })

  it('continues with the selected app without claiming approval, a key, or a Call', async () => {
    const { router } = renderForAgents('/for-agents?setupApp=claude-code')

    expect(await screen.findByRole('region', { name: 'Claude Code MCP command' })).toBeTruthy()
    expect(screen.getByText(/Your Account balance never grants permission to spend/u)).toBeTruthy()
    expect(screen.getByText(/Only a delivered Tool result and receipt completes first use/u)).toBeTruthy()
    expect(screen.queryByText('Connection complete')).toBeNull()
    expect(router.state.location.href).not.toMatch(/(?:apiKey|grantRef|callRef|token)=/iu)

    fireEvent.click(screen.getByRole('link', { name: 'Continue after approval' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/agent-access'))
    expect(router.state.location.search).toEqual({ setupApp: 'claude-code' })
    expect(router.state.location.href).not.toMatch(/(?:apiKey|grantRef|callRef|token)=/iu)
    expect(screen.queryByText(/connection (?:complete|approved)|call created/iu)).toBeNull()
  })
})

function renderForAgents(...initialEntries: string[]) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/for-agents',
      validateSearch: (search: Record<string, unknown>) => forAgentsSearchValidator(search),
      loader: () => (Route.options.loader as () => Promise<{ canonicalBaseUrl: string; availability: string }>)(),
      component: forAgentsRouteComponent,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/agent-access',
      component: AgentAccessDestination,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/market',
      component: () => <h1>Previous page</h1>,
    }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries }),
  })
  render(<RouterProvider router={router} />)
  return { router }
}

function AgentAccessDestination() {
  const location = useLocation()
  return <output aria-label="Agent access search">{JSON.stringify(location.search)}</output>
}
