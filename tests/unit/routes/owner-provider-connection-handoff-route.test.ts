/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type ComponentType, type ReactNode } from 'react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const mocks = vi.hoisted(() => ({
  readAttempt: vi.fn(),
  complete: vi.fn(),
  completeMcp: vi.fn(),
  startMcp: vi.fn(),
  cancel: vi.fn(),
  readIdentity: vi.fn(),
  readConnections: vi.fn(),
  resumeDraft: vi.fn(),
  assessSource: vi.fn(),
  sourceStart: vi.fn(),
}))

vi.mock('@/modules/capability-supply/supply-funnel.functions', () => ({
  readOwnerProviderConnectionAttemptServer: mocks.readAttempt,
  completeOwnerHttpProviderConnectionServer: mocks.complete,
  completeOwnerMcpProviderConnectionServer: mocks.completeMcp,
  startOwnerMcpProviderConnectionServer: mocks.startMcp,
  cancelOwnerProviderConnectionAttemptServer: mocks.cancel,
  readOwnerProviderConnectionsServer: mocks.readConnections,
  resumeOwnerSupplySourceDraftServer: mocks.resumeDraft,
  assessOwnerSupplySourceServer: mocks.assessSource,
  filterOwnerSupplyAuthorityOptions: vi.fn(),
  previewOwnerSupplySourceServer: vi.fn(),
  publishOwnerSupplySourceServer: vi.fn(),
  saveOwnerSupplySourceDraftServer: vi.fn(),
  startOwnerSupplySourceConnectionServer: vi.fn(),
}))
vi.mock('@/components/ae/offerings/provider-workspace.functions', () => ({ readProviderWorkspaceIdentityDetailServer: mocks.readIdentity }))
vi.mock('@/components/ae/layout/AeOperatorPage', async () => {
  const React = await import('react')
  return {
    AeOperatorPage: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => React.createElement(
      React.Fragment,
      undefined,
      React.createElement('h1', undefined, title),
      React.createElement('p', undefined, description),
      children,
    ),
  }
})
vi.mock('@/components/ae/supply/AeSupplySourceNativeStart', async () => {
  const React = await import('react')
  return {
    AeSupplySourceNativeStart: (props: { onDraftSaved: (candidateRef: string, connectionRef?: string) => Promise<void> }) => {
      mocks.sourceStart(props)
      return React.createElement('button', {
        type: 'button',
        onClick: () => void props.onDraftSaved(`sha256:${'a'.repeat(64)}`, 'connection:x402'),
      }, 'Save draft')
    },
  }
})
vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  useServerFn: (fn: unknown) => fn,
}))
vi.mock('@clerk/tanstack-react-start', () => ({ useReverification: (fn: unknown) => fn }))

import { Route } from '@/routes/_operator/owner.supply.connections.new'
import { Route as CallbackRoute } from '@/routes/_operator/owner.supply.connections.oauth.callback'
import { Route as DestinationRoute } from '@/routes/_operator/owner.operations.new'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Object.values(mocks).forEach((mock) => mock.mockReset())
})

describe('Provider connection handoff route', () => {
  it('loads only the opaque attempt selected by the handoff URL', async () => {
    const readback = {
      kind: 'available',
      attempt: {
        attemptRef: 'pca_one',
        sourceKind: 'http_credential',
        sourceOrigin: 'https://provider.example',
      },
    }
    mocks.readAttempt.mockResolvedValue(readback)

    const loader = Route.options.loader as (input: { deps: { attemptRef?: string } }) => Promise<unknown>
    await expect(loader({ deps: { attemptRef: 'pca_one' } })).resolves.toBe(readback)
    expect(mocks.readAttempt).toHaveBeenCalledWith({ data: { attemptRef: 'pca_one' } })
  })

  it('does not query when the handoff URL has no attempt', async () => {
    mocks.readAttempt.mockReset()
    const loader = Route.options.loader as (input: { deps: { attemptRef?: string } }) => Promise<unknown>
    await expect(loader({ deps: {} })).resolves.toEqual({ kind: 'not_found' })
    expect(mocks.readAttempt).not.toHaveBeenCalled()
  })

  it('names a missing handoff and gives the Add Tool recovery path', () => {
    vi.spyOn(Route, 'useLoaderData').mockReturnValue({ kind: 'not_found' } as never)
    const Component = Route.options.component
    if (Component === undefined) throw new Error('handoff_component_missing')
    const rootRoute = createRootRoute()
    const routeTree = rootRoute.addChildren([createRoute({ getParentRoute: () => rootRoute, path: '/' })])
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
    const RouterProvider = RouterContextProvider as ComponentType<{ router: typeof router }>

    render(createElement(RouterProvider, { router }, createElement(Component)))

    expect(screen.getByRole('heading', { level: 1, name: 'Connect Provider' })).toBeTruthy()
    expect(screen.getByText('Connection link unavailable')).toBeTruthy()
    expect(screen.getAllByText('Return to Add Tool and start again.').length).toBeGreaterThan(0)
  })

  it('preserves the requested environment when a saved draft navigation completes', async () => {
    vi.spyOn(DestinationRoute, 'useLoaderData').mockReturnValue({
      identity: { kind: 'available', businessId: 'business:one' },
      connections: [],
      resume: { kind: 'not_found' },
      resumeRequested: false,
      sourceUnavailable: false,
    } as never)
    vi.spyOn(DestinationRoute, 'useSearch').mockReturnValue({ environment: 'sandbox' } as never)
    const navigate = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(DestinationRoute, 'useNavigate').mockReturnValue(navigate as never)
    const Component = DestinationRoute.options.component
    if (Component === undefined) throw new Error('destination_component_missing')

    render(createElement(Component))
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({
      search: {
        draft: `sha256:${'a'.repeat(64)}`,
        connection: 'connection:x402',
        environment: 'sandbox',
      },
      replace: true,
    }))
  })

  it('returns a consumed MCP attempt through the exact saved-source destination resume', async () => {
    vi.spyOn(Route, 'useLoaderData').mockReturnValue({
      kind: 'available',
      attempt: {
        attemptRef: 'pca_consumed',
        sourceKind: 'mcp_oauth',
        sourceUrl: 'https://provider.example/mcp',
        sourceOrigin: 'https://provider.example',
        authentication: { kind: 'mcp_oauth' },
        environment: 'production',
        state: 'consumed',
        connectionRef: 'connection:mcp',
        draftRef: 'sds_exact_source',
        expiresAt: Date.now() + 60_000,
      },
    } as never)
    const Component = Route.options.component
    if (Component === undefined) throw new Error('handoff_component_missing')
    const rootRoute = createRootRoute()
    const routeTree = rootRoute.addChildren([createRoute({ getParentRoute: () => rootRoute, path: '/' })])
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
    const RouterProvider = RouterContextProvider as ComponentType<{ router: typeof router }>
    render(createElement(RouterProvider, { router }, createElement(Component)))
    const href = screen.getByRole('link', { name: 'Return to Add Tool' }).getAttribute('href')
    expect(href).toBe('/owner/operations/new?connection=connection%3Amcp&environment=production&draft=sds_exact_source')

    mocks.readIdentity.mockResolvedValue({ kind: 'available', businessId: 'business:one' })
    mocks.readConnections.mockResolvedValue([{ connectionRef: 'connection:mcp', businessId: 'business:one', available: true }])
    mocks.resumeDraft.mockResolvedValue({ kind: 'available', candidateRef: '', source: {}, preview: {}, connectionRef: 'connection:mcp' })
    const search = new URL(href!, 'https://agentic.example').searchParams
    const loader = DestinationRoute.options.loader as (input: { deps: { connectionRef?: string; environment?: 'production'; draftRef?: string } }) => Promise<unknown>
    await expect(loader({ deps: {
      connectionRef: search.get('connection')!,
      environment: search.get('environment') as 'production',
      draftRef: search.get('draft')!,
    } })).resolves.toMatchObject({ resume: { kind: 'available', connectionRef: 'connection:mcp' } })
    expect(mocks.resumeDraft).toHaveBeenCalledWith({ data: {
      businessId: 'business:one',
      draftRef: 'sds_exact_source',
      connectionRef: 'connection:mcp',
      environment: 'production',
    } })
  })

  it('names the Provider, OAuth access, environment, and saved Tool on an expired handoff', () => {
    vi.spyOn(Route, 'useLoaderData').mockReturnValue({
      kind: 'available',
      attempt: {
        attemptRef: 'pca_expired',
        sourceKind: 'mcp_oauth',
        sourceUrl: 'https://api.github.example/mcp',
        sourceOrigin: 'https://api.github.example',
        authentication: { kind: 'mcp_oauth' },
        environment: 'sandbox',
        state: 'expired',
        draftRef: 'sds_saved_tool',
        expiresAt: Date.now() - 1,
      },
    } as never)
    const Component = Route.options.component
    if (Component === undefined) throw new Error('handoff_component_missing')
    const rootRoute = createRootRoute()
    const routeTree = rootRoute.addChildren([createRoute({ getParentRoute: () => rootRoute, path: '/' })])
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
    const RouterProvider = RouterContextProvider as ComponentType<{ router: typeof router }>

    render(createElement(RouterProvider, { router }, createElement(Component)))

    expect(screen.getByRole('heading', { level: 1, name: 'Connect api.github.example' })).toBeTruthy()
    expect(screen.getByText('OAuth access for this Provider.')).toBeTruthy()
    expect(screen.getByText('Sandbox')).toBeTruthy()
    expect(screen.getByText('Connection link expired')).toBeTruthy()
    const href = screen.getByRole('link', { name: 'Return to Add Tool' }).getAttribute('href')
    expect(href).toBe('/owner/operations/new?draft=sds_saved_tool')
  })

  it('cancels the exact pending attempt and leaves the user in place when cancellation is unconfirmed', async () => {
    vi.spyOn(Route, 'useLoaderData').mockReturnValue({
      kind: 'available',
      attempt: {
        attemptRef: 'pca_cancel_exact', sourceKind: 'mcp_oauth', sourceUrl: 'https://provider.example/mcp',
        sourceOrigin: 'https://provider.example', authentication: { kind: 'mcp_oauth' }, environment: 'production',
        state: 'pending', draftRef: 'sds_exact_source', expiresAt: Date.now() + 60_000,
      },
    } as never)
    mocks.cancel.mockResolvedValue({ kind: 'refused', code: 'source_unavailable' })
    const Component = Route.options.component
    if (Component === undefined) throw new Error('handoff_component_missing')
    render(createElement(Component))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith({ data: {
      attemptRef: 'pca_cancel_exact',
      idempotencyKey: expect.stringMatching(/^cancel:/u),
    } }))
    expect(await screen.findByText(/could not confirm cancellation/u)).toBeTruthy()
  })

  it('reads the same attempt after an uncertain manual completion and does not label pending as retry-safe', async () => {
    const attempt = {
      attemptRef: 'pca_uncertain', sourceKind: 'http_credential', sourceUrl: 'https://provider.example/openapi.yaml',
      sourceOrigin: 'https://provider.example', authentication: { kind: 'http_bearer' }, environment: 'production',
      state: 'pending', draftRef: 'sds_exact_source', expiresAt: Date.now() + 60_000,
    } as const
    vi.spyOn(Route, 'useLoaderData').mockReturnValue({ kind: 'available', attempt } as never)
    mocks.complete.mockRejectedValue(new Error('response lost'))
    mocks.readAttempt.mockResolvedValue({ kind: 'available', attempt })
    const Component = Route.options.component
    if (Component === undefined) throw new Error('handoff_component_missing')
    render(createElement(Component))
    fireEvent.change(screen.getByLabelText('Bearer token'), { target: { value: 'credential-never-rendered' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Connect Provider' }).closest('form')!)
    expect(await screen.findByText(/still completing/u)).toBeTruthy()
    expect(mocks.complete).toHaveBeenCalledWith({ data: {
      attemptRef: 'pca_uncertain',
      credential: 'credential-never-rendered',
      idempotencyKey: 'provider-http:pca_uncertain',
    } })
    expect(mocks.readAttempt).toHaveBeenCalledWith({ data: { attemptRef: 'pca_uncertain' } })
    expect(screen.queryByText(/try again with the same credential/u)).toBeNull()
  })

  it('places a credential failure beside the credential field', async () => {
    vi.spyOn(Route, 'useLoaderData').mockReturnValue({
      kind: 'available',
      attempt: {
        attemptRef: 'pca_credential_error',
        sourceKind: 'http_credential',
        sourceUrl: 'https://api.provider.example/openapi.json',
        sourceOrigin: 'https://api.provider.example',
        authentication: { kind: 'api_key', location: 'header', name: 'X-API-Key' },
        environment: 'production',
        state: 'pending',
        draftRef: 'sds_saved_tool',
        expiresAt: Date.now() + 60_000,
      },
    } as never)
    mocks.complete.mockResolvedValue({ kind: 'refused', code: 'secret_unavailable' })
    const Component = Route.options.component
    if (Component === undefined) throw new Error('handoff_component_missing')

    render(createElement(Component))
    const field = screen.getByLabelText('X-API-Key API key')
    fireEvent.change(field, { target: { value: 'credential-never-rendered' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Connect Provider' }).closest('form')!)

    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain('The credential could not be stored.')
    expect(field.parentElement?.contains(error)).toBe(true)
  })

  it('completes an exact OAuth callback without forwarding provider error prose', async () => {
    const connected = { kind: 'connected', connection: { connectionRef: 'connection:mcp' } }
    mocks.readAttempt.mockResolvedValue({
      kind: 'available',
      attempt: { attemptRef: 'pca_oauth', environment: 'production', draftRef: 'sds_exact_source' },
    })
    mocks.completeMcp.mockResolvedValue(connected)
    const loader = CallbackRoute.options.loader as (input: { deps: {
      attempt?: string
      state?: string
      code?: string
      iss?: string
      error?: string
      provider_parameter?: string
    }; location: { searchStr: string } }) => Promise<unknown>

    await expect(loader({
      deps: {
        attempt: 'pca_oauth',
        state: 'oauth-state-never-forwarded',
        code: 'oauth-code-never-forwarded',
        iss: 'https://login.provider.example',
        provider_parameter: 'preserved',
      },
      location: {
        searchStr: '?attempt=pca_oauth&state=oauth-state-never-forwarded&code=oauth-code-never-forwarded&iss=https%3A%2F%2Flogin.provider.example&provider_parameter=preserved',
      },
    })).rejects.toMatchObject({
      options: {
        to: '/owner/operations/new',
        search: { connection: 'connection:mcp', environment: 'production', draft: 'sds_exact_source' },
        replace: true,
      },
    })
    expect(mocks.completeMcp).toHaveBeenCalledWith({ data: {
      attemptRef: 'pca_oauth',
      callbackParameters: [
        ['attempt', 'pca_oauth'],
        ['state', 'oauth-state-never-forwarded'],
        ['code', 'oauth-code-never-forwarded'],
        ['iss', 'https://login.provider.example'],
        ['provider_parameter', 'preserved'],
      ],
    } })

    mocks.completeMcp.mockClear()
    mocks.completeMcp.mockResolvedValue({ kind: 'refused', code: 'connection_conflict' })
    await expect(loader({
      deps: { attempt: 'pca_oauth', state: 'oauth-state-never-forwarded', error: 'access_denied' },
      location: { searchStr: '?attempt=pca_oauth&state=oauth-state-never-forwarded&error=access_denied&error_description=never-forward-this' },
    })).resolves.toEqual({
      kind: 'refused',
      code: 'connection_conflict',
      continuationDraftRef: 'sds_exact_source',
      environment: 'production',
    })
    expect(mocks.completeMcp).toHaveBeenCalledWith({ data: {
      attemptRef: 'pca_oauth',
      callbackParameters: [
        ['attempt', 'pca_oauth'],
        ['state', 'oauth-state-never-forwarded'],
        ['error', 'access_denied'],
        ['error_description', 'never-forward-this'],
      ],
    } })
  })

  it('classifies a callback without an attempt as a missing connection link', async () => {
    const loader = CallbackRoute.options.loader as (input: {
      deps: { attempt?: string }
      location: { searchStr: string }
    }) => Promise<unknown>

    await expect(loader({ deps: {}, location: { searchStr: '' } })).resolves.toEqual({
      kind: 'refused',
      code: 'not_found',
    })
    expect(mocks.completeMcp).not.toHaveBeenCalled()
  })

  it.each([
    ['not_found', 'Connection link missing'],
    ['attempt_expired', 'Connection link expired'],
    ['not_supported', 'Provider connection unsupported'],
    ['reauthentication_required', 'Confirmation expired'],
    ['secret_unavailable', 'Connection not saved'],
    ['connection_conflict', 'Connection changed'],
    ['source_unavailable', 'Provider connection unavailable'],
  ] as const)('names the %s OAuth callback outcome without exposing callback parameters', (code, title) => {
    vi.spyOn(CallbackRoute, 'useLoaderData').mockReturnValue({
      kind: 'refused',
      code,
      continuationDraftRef: 'sds_exact_source',
      environment: 'sandbox',
    } as never)
    const Component = CallbackRoute.options.component
    if (Component === undefined) throw new Error('callback_component_missing')
    const rootRoute = createRootRoute()
    const routeTree = rootRoute.addChildren([createRoute({ getParentRoute: () => rootRoute, path: '/' })])
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
    const RouterProvider = RouterContextProvider as ComponentType<{ router: typeof router }>

    render(createElement(RouterProvider, { router }, createElement(Component)))

    expect(screen.getByRole('heading', { level: 1, name: 'Provider connection' })).toBeTruthy()
    expect(screen.getByText(title)).toBeTruthy()
    expect(screen.getByText('Sandbox')).toBeTruthy()
    expect(document.body.textContent).not.toContain('oauth-code-never-forwarded')
    expect(document.body.textContent).not.toContain('oauth-state-never-forwarded')
    expect(screen.getByRole('link', { name: 'Return to Add Tool' }).getAttribute('href'))
      .toBe('/owner/operations/new?draft=sds_exact_source')
  })
})
