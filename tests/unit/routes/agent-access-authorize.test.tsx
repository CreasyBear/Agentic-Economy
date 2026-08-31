/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start')>()),
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      id: 'user_private_ada',
      fullName: 'Ada Lovelace',
      primaryEmailAddress: { emailAddress: 'ada@supply.example' },
    },
    sessionId: 'session_private_ada',
  }),
  UserButton: () => <button type="button" aria-label="Account menu" />,
}))

import { Route as AgentAccessAuthorizeRoute } from '@/routes/_operator/agent-access.authorize'

const Component = AgentAccessAuthorizeRoute.options.component as ComponentType

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('/agent-access/authorize consent loading', () => {
  it('shows terminal recovery copy when the consent request is unavailable', async () => {
    vi.spyOn(AgentAccessAuthorizeRoute, 'useSearch').mockReturnValue({ user_code: 'BAD-CODE' })
    let resolveResponse: (response: Response) => void = () => undefined
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      () => new Promise<Response>((resolve) => {
        resolveResponse = resolve
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderComponent()

    expect(screen.getByText('Loading access request')).toBeTruthy()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    resolveResponse(new Response(null, { status: 404 }))
    await waitFor(() => expect(screen.getByText('Access request unavailable')).toBeTruthy())

    expect(screen.queryByText('Loading access request')).toBeNull()
    expect(screen.getByText('It may have expired. Start a new request from your agent.')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(
      '/oauth/authorize?user_code=BAD-CODE',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
  })

  it('reaches approval controls after a valid consent response', async () => {
    vi.spyOn(AgentAccessAuthorizeRoute, 'useSearch').mockReturnValue({ user_code: 'GOOD-CODE' })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      '<main data-ae-consent data-grant-ref="grant-1" data-client-name="Test assistant" data-authority-mode="inspect_only"></main>',
      { status: 200 },
    ))
    vi.stubGlobal('fetch', fetchMock)

    renderComponent()

    expect(await screen.findByRole('button', { name: 'Approve access' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy()
    expect(screen.queryByText('Loading access request')).toBeNull()
  })

  it('asks one authority question, defaults to the requested ceiling, and submits the owner choice', async () => {
    vi.spyOn(AgentAccessAuthorizeRoute, 'useSearch').mockReturnValue({ user_code: 'GOOD-CODE' })
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(
        '<main data-ae-consent data-grant-ref="grant-1" data-client-name="Test assistant" data-authority-mode="bounded_mandate"></main>',
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response('Approved', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    renderComponent()

    expect(await screen.findByText('How much may this agent do without asking you?')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Work within limits/ }).getAttribute('data-state')).toBe('checked')
    fireEvent.click(screen.getByRole('button', { name: 'Approve access' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const request = fetchMock.mock.calls[1]?.[1]
    expect(String(request?.body)).toContain('decision=approve')
    expect(String(request?.body)).toContain('authority_mode=bounded_mandate')
    expect(String(request?.body)).toContain('connection_target=new_agent')
    expect(await screen.findByText('Access approved — return to your agent')).toBeTruthy()
  })

  it('shows a fixed, separate supplier permission instead of buyer authority choices', async () => {
    vi.spyOn(AgentAccessAuthorizeRoute, 'useSearch').mockReturnValue({ user_code: 'SUPP-LIER' })
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(
        '<main data-ae-consent data-grant-ref="grant-supplier" data-client-name="Supplier CLI" data-authority-mode="bounded_mandate" data-access-profile="supplier"></main>',
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response('Approved', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    renderComponent()

    expect(await screen.findByText('Supplier management')).toBeTruthy()
    expect(screen.getByText(/cannot spend buyer credit/)).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /Browse only/ })).toBeNull()
    expect(screen.getByRole('radio', { name: /New agent/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve access' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const request = fetchMock.mock.calls[1]?.[1]
    expect(String(request?.body)).toContain('authority_mode=bounded_mandate')
    expect(await screen.findByText(/separate supplier key/)).toBeTruthy()
  })

  it('requires an explicit existing agent before credential replacement can be approved', async () => {
    vi.spyOn(AgentAccessAuthorizeRoute, 'useSearch').mockReturnValue({ user_code: 'REPL-ACE' })
    const targets = encodeURIComponent(JSON.stringify([
      { principalRef: 'prn_agent_a', displayName: 'Research agent' },
      { principalRef: 'prn_agent_b', displayName: 'Shipping agent' },
    ]))
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(
        `<main data-ae-consent data-grant-ref="grant-replace" data-client-name="Agent CLI" data-authority-mode="approve_each" data-agent-targets="${targets}"></main>`,
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response('Approved', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    renderComponent()

    const replace = await screen.findByRole('radio', { name: /Replace credential/ })
    fireEvent.click(replace)
    expect(screen.getByRole('button', { name: 'Approve access' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('combobox', { name: 'Agent' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Research agent' }))
    expect(screen.getByRole('button', { name: 'Approve access' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Approve access' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const request = fetchMock.mock.calls[1]?.[1]
    expect(String(request?.body)).toContain('connection_target=replace_credential')
    expect(String(request?.body)).toContain('principal_ref=prn_agent_a')
  })

  it('retains loaded choices when the next replacement-target page fails and retries it', async () => {
    vi.spyOn(AgentAccessAuthorizeRoute, 'useSearch').mockReturnValue({ user_code: 'PAGE-CODE' })
    const firstTargets = encodeURIComponent(JSON.stringify([
      { principalRef: 'prn_agent_a', displayName: 'Research agent' },
    ]))
    const secondTargets = encodeURIComponent(JSON.stringify([
      { principalRef: 'prn_agent_b', displayName: 'Shipping agent' },
    ]))
    const cursor = encodeURIComponent('opaque+/cursor==')
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(
        `<main data-ae-consent data-grant-ref="grant-paged" data-client-name="Agent CLI" data-authority-mode="approve_each" data-agent-targets="${firstTargets}" data-agent-targets-next-cursor="${cursor}" data-agent-targets-unavailable="false"></main>`,
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response(
        '<main data-ae-consent data-grant-ref="grant-paged" data-client-name="Agent CLI" data-authority-mode="approve_each" data-agent-targets="%5B%5D" data-agent-targets-unavailable="true"></main>',
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response(
        `<main data-ae-consent data-grant-ref="grant-paged" data-client-name="Agent CLI" data-authority-mode="approve_each" data-agent-targets="${secondTargets}" data-agent-targets-unavailable="false"></main>`,
        { status: 200 },
      ))
    vi.stubGlobal('fetch', fetchMock)

    renderComponent()

    fireEvent.click(await screen.findByRole('button', { name: 'Load more agents' }))
    expect(await screen.findByText('More agents could not be loaded. The choices already shown are still available.')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Replace credential/ }).hasAttribute('disabled')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Retry agent list' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/oauth/authorize?user_code=PAGE-CODE&agent_cursor=opaque%2B%2Fcursor%3D%3D')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/oauth/authorize?user_code=PAGE-CODE&agent_cursor=opaque%2B%2Fcursor%3D%3D')
    fireEvent.click(screen.getByRole('radio', { name: /Replace credential/ }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Agent' }))
    expect(await screen.findByRole('option', { name: 'Research agent' })).toBeTruthy()
    expect(await screen.findByRole('option', { name: 'Shipping agent' })).toBeTruthy()
    expect(screen.queryByText('Agent list needs refreshing')).toBeNull()
  })
})

function renderComponent() {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/agent-access/authorize' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/agent-access/authorize'] }),
  })

  return render(
    <RouterContextProvider router={router}>
      <Component />
    </RouterContextProvider>,
  )
}
