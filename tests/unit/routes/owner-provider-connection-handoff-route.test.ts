/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type ComponentType } from 'react'
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
  filterOwnerSupplyAuthorityOptions: vi.fn(),
  previewOwnerSupplySourceServer: vi.fn(),
  publishOwnerSupplySourceServer: vi.fn(),
  saveOwnerSupplySourceDraftServer: vi.fn(),
  startOwnerSupplySourceConnectionServer: vi.fn(),
}))
vi.mock('@/components/ae/offerings/provider-workspace.functions', () => ({ readProviderWorkspaceIdentityDetailServer: mocks.readIdentity }))
vi.mock('@/components/ae/layout/AeOperatorPage', () => ({ AeOperatorPage: ({ children }: { children: unknown }) => children }))
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
import { Route as DestinationRoute } from '@/routes/_operator/owner.offerings.new'

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
    render(createElement(Component))
    const href = screen.getByRole('link', { name: 'Return to Add service' }).getAttribute('href')
    expect(href).toBe('/owner/offerings/new?connection=connection%3Amcp&environment=production&draft=sds_exact_source')

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
    fireEvent.submit(screen.getByRole('button', { name: 'Connect service' }).closest('form')!)
    expect(await screen.findByText(/still completing/u)).toBeTruthy()
    expect(mocks.complete).toHaveBeenCalledWith({ data: {
      attemptRef: 'pca_uncertain',
      credential: 'credential-never-rendered',
      idempotencyKey: 'provider-http:pca_uncertain',
    } })
    expect(mocks.readAttempt).toHaveBeenCalledWith({ data: { attemptRef: 'pca_uncertain' } })
    expect(screen.queryByText(/try again with the same credential/u)).toBeNull()
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
        to: '/owner/offerings/new',
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
    })).resolves.toEqual({ kind: 'refused', code: 'connection_conflict', continuationDraftRef: 'sds_exact_source' })
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

  it('does not report a failed OAuth connection when authoritative status is unavailable', () => {
    vi.spyOn(CallbackRoute, 'useLoaderData').mockReturnValue({ kind: 'refused', code: 'source_unavailable', continuationDraftRef: 'sds_exact_source' } as never)
    const Component = CallbackRoute.options.component
    if (Component === undefined) throw new Error('callback_component_missing')
    const rootRoute = createRootRoute()
    const routeTree = rootRoute.addChildren([createRoute({ getParentRoute: () => rootRoute, path: '/' })])
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
    const RouterProvider = RouterContextProvider as ComponentType<{ router: typeof router }>
    render(createElement(RouterProvider, { router }, createElement(Component)))
    expect(screen.getByText('Connection status unavailable')).toBeTruthy()
    expect(screen.queryByText('Service not connected')).toBeNull()
  })
})
