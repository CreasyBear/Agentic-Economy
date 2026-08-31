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

const serverMocks = vi.hoisted(() => ({
  readConsent: vi.fn(),
}))

vi.mock('@/lib/server/agent-access-consent.functions', () => ({
  readAgentAccessConsentServer: serverMocks.readConsent,
}))

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
const PendingComponent = AgentAccessAuthorizeRoute.options.pendingComponent as ComponentType
const ErrorComponent = AgentAccessAuthorizeRoute.options.errorComponent as ComponentType

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('/agent-access/authorize consent loading', () => {
  it('loads and validates initial consent through the route loader', async () => {
    serverMocks.readConsent.mockResolvedValue({
      status: 200,
      html: '<main data-ae-consent data-grant-ref="grant-loader" data-client-name="Loader agent" data-authority-mode="inspect_only"></main>',
    })
    const loader = AgentAccessAuthorizeRoute.options.loader
    if (typeof loader !== 'function') throw new Error('authorize_loader_missing')

    const loaded = await (loader as unknown as (
      input: Readonly<{ deps: Readonly<{ userCode?: string }> }>,
    ) => Promise<unknown>)({ deps: { userCode: 'LOAD-CODE' } })

    expect(loaded).toMatchObject({
      kind: 'ready',
      userCode: 'LOAD-CODE',
      details: { grantRef: 'grant-loader', clientName: 'Loader agent', mode: 'inspect_only' },
    })
    expect(serverMocks.readConsent).toHaveBeenCalledWith({ data: { userCode: 'LOAD-CODE' } })
  })

  it('shows terminal recovery copy when the consent request is unavailable', async () => {
    renderComponent(PendingComponent)

    expect(screen.getAllByText('Loading workspace').length).toBeGreaterThan(0)
    cleanup()
    renderComponent(ErrorComponent)

    expect(screen.queryByText('Loading workspace')).toBeNull()
    expect(screen.getAllByText('Couldn’t load this page').length).toBeGreaterThan(0)
    expect(screen.getByText(/Try loading it again/)).toBeTruthy()
  })

  it('reaches approval controls after a valid consent response', async () => {
    mockConsent({ userCode: 'GOOD-CODE', grantRef: 'grant-1', clientName: 'Test assistant', mode: 'inspect_only' })

    renderComponent()

    expect(await screen.findByRole('button', { name: 'Approve access' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy()
    expect(screen.queryByText('Loading access request')).toBeNull()
  })

  it('asks one authority question, defaults to the requested ceiling, and submits the owner choice', async () => {
    mockConsent({ userCode: 'GOOD-CODE', grantRef: 'grant-1', clientName: 'Test assistant', mode: 'bounded_mandate' })
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('Approved', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    renderComponent()

    expect(await screen.findByText('How much may this agent do without asking you?')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Work within limits/ }).getAttribute('data-state')).toBe('checked')
    fireEvent.click(screen.getByRole('button', { name: 'Approve access' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const request = fetchMock.mock.calls[0]?.[1]
    expect(String(request?.body)).toContain('decision=approve')
    expect(String(request?.body)).toContain('authority_mode=bounded_mandate')
    expect(String(request?.body)).toContain('connection_target=new_agent')
    expect(await screen.findByText('Access approved — return to your agent')).toBeTruthy()
  })

  it('shows a fixed, separate supplier permission instead of buyer authority choices', async () => {
    mockConsent({ userCode: 'SUPP-LIER', grantRef: 'grant-supplier', clientName: 'Supplier CLI', mode: 'bounded_mandate', accessProfile: 'supplier' })
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('Approved', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    renderComponent()

    expect(await screen.findByText('Supplier management')).toBeTruthy()
    expect(screen.getByText(/cannot spend buyer credit/)).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /Browse only/ })).toBeNull()
    expect(screen.getByRole('radio', { name: /New agent/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve access' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const request = fetchMock.mock.calls[0]?.[1]
    expect(String(request?.body)).toContain('authority_mode=bounded_mandate')
    expect(await screen.findByText(/separate supplier key/)).toBeTruthy()
  })

  it('requires an explicit existing agent before credential replacement can be approved', async () => {
    const targets = [
      { principalRef: 'prn_agent_a', displayName: 'Research agent' },
      { principalRef: 'prn_agent_b', displayName: 'Shipping agent' },
    ]
    mockConsent({ userCode: 'REPL-ACE', grantRef: 'grant-replace', clientName: 'Agent CLI', mode: 'approve_each', agentTargets: targets })
    const fetchMock = vi.fn<typeof fetch>()
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const request = fetchMock.mock.calls[0]?.[1]
    expect(String(request?.body)).toContain('connection_target=replace_credential')
    expect(String(request?.body)).toContain('principal_ref=prn_agent_a')
  })

  it('retains loaded choices when the next replacement-target page fails and retries it', async () => {
    const firstTargets = [
      { principalRef: 'prn_agent_a', displayName: 'Research agent' },
    ]
    const secondTargets = encodeURIComponent(JSON.stringify([
      { principalRef: 'prn_agent_b', displayName: 'Shipping agent' },
    ]))
    const cursor = 'opaque+/cursor=='
    mockConsent({
      userCode: 'PAGE-CODE', grantRef: 'grant-paged', clientName: 'Agent CLI', mode: 'approve_each',
      agentTargets: firstTargets, agentTargetsNextCursor: cursor,
    })
    const fetchMock = vi.fn<typeof fetch>()
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/oauth/authorize?user_code=PAGE-CODE&agent_cursor=opaque%2B%2Fcursor%3D%3D')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/oauth/authorize?user_code=PAGE-CODE&agent_cursor=opaque%2B%2Fcursor%3D%3D')
    fireEvent.click(screen.getByRole('radio', { name: /Replace credential/ }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Agent' }))
    expect(await screen.findByRole('option', { name: 'Research agent' })).toBeTruthy()
    expect(await screen.findByRole('option', { name: 'Shipping agent' })).toBeTruthy()
    expect(screen.queryByText('Agent list needs refreshing')).toBeNull()
  })
})

function mockConsent(input: Readonly<{
  userCode: string
  grantRef: string
  clientName: string
  mode: string
  accessProfile?: 'market' | 'supplier'
  agentTargets?: readonly Readonly<{ principalRef: string; displayName: string }>[]
  agentTargetsNextCursor?: string
}>) {
  vi.spyOn(AgentAccessAuthorizeRoute, 'useLoaderData').mockReturnValue({
    kind: 'ready',
    userCode: input.userCode,
    details: {
      grantRef: input.grantRef,
      clientName: input.clientName,
      mode: input.mode,
      ...(input.accessProfile === undefined ? {} : { accessProfile: input.accessProfile }),
      agentTargets: input.agentTargets ?? [],
      ...(input.agentTargetsNextCursor === undefined ? {} : { agentTargetsNextCursor: input.agentTargetsNextCursor }),
      agentTargetsUnavailable: false,
    },
  })
}

function renderComponent(component: ComponentType = Component) {
  const Target = component
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
      <Target />
    </RouterContextProvider>,
  )
}
