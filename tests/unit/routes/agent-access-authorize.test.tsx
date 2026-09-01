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
  reverifyMode: 'pass' as 'pass' | 'cancel',
  useReverification: vi.fn((fetcher: (...args: unknown[]) => Promise<unknown>) => async (...args: unknown[]) => {
    if (serverMocks.reverifyMode === 'cancel') {
      throw Object.assign(new Error('reverification_cancelled'), { code: 'reverification_cancelled' })
    }
    const result = await fetcher(...args)
    return result instanceof Response ? await result.json() : result
  }),
  localE2E: false,
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
  useReverification: serverMocks.useReverification,
}))

vi.mock('@/lib/client/local-e2e-auth', () => ({
  isLocalE2EAuthBypassEnabled: () => serverMocks.localE2E,
}))

vi.mock('@clerk/tanstack-react-start/errors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start/errors')>()),
  isReverificationCancelledError: (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'reverification_cancelled',
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
  serverMocks.reverifyMode = 'pass'
  serverMocks.localE2E = false
})

describe('/agent-access/authorize consent loading', () => {
  it('loads and validates initial consent through the route loader', async () => {
    serverMocks.readConsent.mockResolvedValue({
      status: 200,
      html: '<main data-ae-consent data-grant-ref="grant-loader" data-grant-revision="1" data-flow="device_code" data-client-name="Loader agent" data-authority-mode="inspect_only" data-environment="production" data-operation-access="all_admitted" data-operation-refs="%5B%5D" data-expires-in-seconds="7200" data-access-summary="Maximum daily spend: USD 5.00."></main>',
    })
    const loader = AgentAccessAuthorizeRoute.options.loader
    if (typeof loader !== 'function') throw new Error('authorize_loader_missing')

    const loaded = await (loader as unknown as (
      input: Readonly<{ deps: Readonly<{ userCode?: string }> }>,
    ) => Promise<unknown>)({ deps: { userCode: 'LOAD-CODE' } })

    expect(loaded).toMatchObject({
      kind: 'ready',
      locator: { kind: 'user_code', value: 'LOAD-CODE' },
      details: {
        grantRef: 'grant-loader', clientName: 'Loader agent', mode: 'inspect_only',
        environment: 'production', expiresInSeconds: 7_200,
        operationAccess: 'all_admitted', operationRefs: [],
        accessSummary: 'Maximum daily spend: USD 5.00.',
      },
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

  it('renders an issuing request as read-only recovery without approval or generic retry', async () => {
    serverMocks.readConsent.mockResolvedValue({
      status: 200,
      html: '<main data-ae-consent data-ae-consent-state="outcome_unknown" data-grant-ref="device:grant-issuing"></main>',
    })
    const loader = AgentAccessAuthorizeRoute.options.loader
    if (typeof loader !== 'function') throw new Error('authorize_loader_missing')
    const loaded = await (loader as unknown as (
      input: Readonly<{ deps: Readonly<{ userCode?: string }> }>,
    ) => Promise<unknown>)({ deps: { userCode: 'ISSU-ING1' } })
    expect(loaded).toEqual({ kind: 'outcome_unknown', grantRef: 'device:grant-issuing' })

    vi.spyOn(AgentAccessAuthorizeRoute, 'useLoaderData').mockReturnValue(loaded as never)
    renderComponent()

    expect(screen.getByText('Check the current access status')).toBeTruthy()
    expect(screen.getByText('The approval may have completed. Do not submit it again.')).toBeTruthy()
    expect(screen.getByText('Request reference: device:grant-issuing')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Agents' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve access' })).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  it('renders a completed request as read-only success after refresh', async () => {
    serverMocks.readConsent.mockResolvedValue({
      status: 200,
      html: '<main data-ae-consent data-ae-consent-state="succeeded" data-grant-ref="device:grant-complete"></main>',
    })
    const loader = AgentAccessAuthorizeRoute.options.loader
    if (typeof loader !== 'function') throw new Error('authorize_loader_missing')
    const loaded = await (loader as unknown as (
      input: Readonly<{ deps: Readonly<{ userCode?: string }> }>,
    ) => Promise<unknown>)({ deps: { userCode: 'COMP-LETE' } })
    expect(loaded).toEqual({ kind: 'succeeded', grantRef: 'device:grant-complete' })

    vi.spyOn(AgentAccessAuthorizeRoute, 'useLoaderData').mockReturnValue(loaded as never)
    renderComponent()

    expect(screen.getByText('Access approved')).toBeTruthy()
    expect(screen.getByText('This approval has completed. Open Agents for the current credential status.')).toBeTruthy()
    expect(screen.queryByText(/ready for one-time delivery/i)).toBeNull()
    expect(screen.getByText('Request reference: device:grant-complete')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Agents' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve access' })).toBeNull()
    expect(screen.queryByText('Try again')).toBeNull()
  })

  it('reaches approval controls after a valid consent response', async () => {
    mockConsent({ userCode: 'GOOD-CODE', grantRef: 'grant-1', clientName: 'Test assistant', mode: 'inspect_only' })

    renderComponent()

    expect(await screen.findByRole('button', { name: 'Approve access' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy()
    expect(screen.queryByText('Loading access request')).toBeNull()
  })

  it('uses the existing local-E2E bypass without mounting Clerk reverification', async () => {
    serverMocks.localE2E = true
    mockConsent({ userCode: 'LOCAL-E2E', grantRef: 'grant-local', clientName: 'Local CLI', mode: 'inspect_only' })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({
      kind: 'approved',
      grantRef: 'grant-local',
    }))
    vi.stubGlobal('fetch', fetchMock)

    renderComponent()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve access' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and approve' }))

    expect(await screen.findByText('Access approved — return to your agent')).toBeTruthy()
    expect(screen.getByText('Approval is complete. Return to your agent so it can finish the token exchange. Supplier authority is not included.')).toBeTruthy()
    expect(screen.queryByText(/delivers the caller key/i)).toBeNull()
    expect(serverMocks.useReverification).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('keeps the security-control correlation reference when approval fails closed', async () => {
    mockConsent({ userCode: 'RATE-DOWN', grantRef: 'grant-rate-down', clientName: 'Rate-safe CLI', mode: 'inspect_only' })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({
      kind: 'unavailable',
      code: 'security_control_unavailable',
      correlationRef: 'oauth:grant:grant-rate-down:reserve:1',
    }, { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    renderComponent()
    fireEvent.click(await screen.findByRole('button', { name: 'Approve access' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and approve' }))

    expect(await screen.findByText('Access request unavailable')).toBeTruthy()
    expect(screen.getByText(/no access was created/u)).toBeTruthy()
    expect(screen.getByText(/oauth:grant:grant-rate-down:reserve:1/u)).toBeTruthy()
  })

  it('asks one authority question, defaults to the requested ceiling, and submits the owner choice', async () => {
    mockConsent({
      userCode: 'GOOD-CODE', grantRef: 'grant-1', clientName: 'Test assistant', mode: 'bounded_mandate',
      environment: 'production', expiresInSeconds: 7_200,
      accessSummary: 'Maximum daily spend: USD 5.00. Maximum calls per hour: 42.',
    })
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ kind: 'approved', grantRef: 'grant-1' }))
    vi.stubGlobal('fetch', fetchMock)

    renderComponent()

    expect(await screen.findByText('How much may this agent do without asking you?')).toBeTruthy()
    expect(screen.getByText('Test assistant · Production')).toBeTruthy()
    expect(screen.getByText('Maximum daily spend: USD 5.00. Maximum calls per hour: 42.')).toBeTruthy()
    expect(screen.getAllByText(/Access expires in 2 hours after issue/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/\$1 each/)).toBeNull()
    expect(screen.getByRole('radio', { name: /Work within limits/ }).getAttribute('data-state')).toBe('checked')
    fireEvent.click(screen.getByRole('button', { name: 'Approve access' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and approve' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const request = fetchMock.mock.calls[0]?.[1]
    expect(String(request?.body)).toContain('decision=approve')
    expect(String(request?.body)).toContain('expected_grant_revision=1')
    expect(String(request?.body)).toContain('expected_target_revision=1')
    expect(String(request?.body)).toContain('authority_mode=bounded_mandate')
    expect(String(request?.body)).toContain('connection_target=new_agent')
    expect(String(request?.body)).toContain('approved_operation_access=all_admitted')
    expect(String(request?.body)).not.toContain('approved_operation_ref=')
    expect(await screen.findByText('Access approved — return to your agent')).toBeTruthy()
  })

  it('lets the owner narrow caller-requested Operations and posts the exact approved subset', async () => {
    const refs = [`operation:v1:${'a'.repeat(64)}`, `operation:v1:${'b'.repeat(64)}`]
    mockConsent({
      userCode: 'SELE-CTED', grantRef: 'grant-selected', clientName: 'Selected CLI', mode: 'inspect_only',
      operationAccess: 'selected_operations', operationRefs: refs,
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ kind: 'approved', grantRef: 'grant-selected' }))
    vi.stubGlobal('fetch', fetchMock)

    renderComponent()
    for (const operationRef of refs) {
      expect(screen.getByRole('link', { name: operationRef }).getAttribute('href')).toContain(encodeURIComponent(operationRef))
    }
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' })
    fireEvent.click(removeButtons[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Approve access' }))
    expect((await screen.findAllByText(new RegExp(refs[1]!))).length).toBeGreaterThan(1)
    expect(screen.queryByText(new RegExp(refs[0]!))).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and approve' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const body = String(fetchMock.mock.calls[0]?.[1]?.body)
    expect(body).toContain('approved_operation_access=selected_operations')
    expect(body).toContain(`approved_operation_ref=${encodeURIComponent(refs[1]!)}`)
    expect(body).not.toContain(encodeURIComponent(refs[0]!))
  })

  it('shows a fixed, separate supplier permission instead of buyer authority choices', async () => {
    mockConsent({ userCode: 'SUPP-LIER', grantRef: 'grant-supplier', clientName: 'Supplier CLI', mode: 'bounded_mandate', accessProfile: 'supplier' })
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ kind: 'approved', grantRef: 'grant-supplier' }))
    vi.stubGlobal('fetch', fetchMock)

    renderComponent()

    expect(await screen.findByText('Supplier management')).toBeTruthy()
    expect(screen.getByText(/cannot spend buyer credit/)).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /Browse only/ })).toBeNull()
    expect(screen.getByRole('radio', { name: /New agent/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve access' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and approve' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const request = fetchMock.mock.calls[0]?.[1]
    expect(String(request?.body)).toContain('authority_mode=bounded_mandate')
    expect(await screen.findByText(/finish the token exchange for its separate supplier access/)).toBeTruthy()
  })

  it('requires an explicit existing agent before credential replacement can be approved', async () => {
    const targets = [
      { principalRef: 'prn_agent_a', principalRevision: 3, displayName: 'Research agent' },
      { principalRef: 'prn_agent_b', principalRevision: 5, displayName: 'Shipping agent' },
    ]
    mockConsent({ userCode: 'REPL-ACE', grantRef: 'grant-replace', clientName: 'Agent CLI', mode: 'approve_each', agentTargets: targets })
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ kind: 'approved', grantRef: 'grant-replace' }))
    vi.stubGlobal('fetch', fetchMock)

    renderComponent()

    const replace = await screen.findByRole('radio', { name: /Replace credential/ })
    fireEvent.click(replace)
    expect(screen.getByRole('button', { name: 'Approve access' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('combobox', { name: 'Agent' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Research agent' }))
    expect(screen.getByRole('button', { name: 'Approve access' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Approve access' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and approve' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const request = fetchMock.mock.calls[0]?.[1]
    expect(String(request?.body)).toContain('connection_target=replace_credential')
    expect(String(request?.body)).toContain('principal_ref=prn_agent_a')
    expect(String(request?.body)).toContain('expected_target_revision=3')
    expect(String(request?.body)).toContain('replacement_mode=planned')
  })

  it('makes compromise replacement explicit and binds it into the approval request', async () => {
    const targets = [
      { principalRef: 'prn_agent_a', principalRevision: 3, displayName: 'Research agent' },
    ]
    mockConsent({ userCode: 'COMP-ROMI', grantRef: 'grant-compromise', clientName: 'Agent CLI', mode: 'approve_each', agentTargets: targets })
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ kind: 'approved', grantRef: 'grant-compromise' }))
    vi.stubGlobal('fetch', fetchMock)

    renderComponent()
    fireEvent.click(await screen.findByRole('radio', { name: /Replace credential/ }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Agent' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Research agent' }))
    fireEvent.click(screen.getByRole('radio', { name: /Suspected compromise/ }))
    expect(screen.getByText(/current authority is revoked first and is never reactivated/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve access' }))
    expect(await screen.findByText(/revoked before successor issuance and cannot be reactivated/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and approve' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('replacement_mode=compromise')
  })

  it('retains the exact choice and restores focus when Clerk reverification is cancelled', async () => {
    mockConsent({ userCode: 'CANCEL-1', grantRef: 'grant-cancel', clientName: 'Test assistant', mode: 'bounded_mandate' })
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    serverMocks.reverifyMode = 'cancel'
    renderComponent()

    const approveButton = await screen.findByRole('button', { name: 'Approve access' })
    approveButton.focus()
    fireEvent.click(approveButton)
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and approve' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirm and approve' })).toBeNull())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: /Work within limits/ }).getAttribute('data-state')).toBe('checked')
    await waitFor(() => expect(document.activeElement).toBe(approveButton))
  })

  it('dispatches one immutable approval when confirm is activated twice before rerender', async () => {
    mockConsent({ userCode: 'DOUBLE-1', grantRef: 'grant-double', clientName: 'Test assistant', mode: 'inspect_only' })
    let resolveResponse: ((response: Response) => void) | undefined
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => await new Promise<Response>((resolve) => {
      resolveResponse = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)
    renderComponent()

    fireEvent.click(await screen.findByRole('button', { name: 'Approve access' }))
    const confirm = await screen.findByRole('button', { name: 'Confirm and approve' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(fetchMock).toHaveBeenCalledOnce()
    resolveResponse?.(Response.json({ kind: 'approved', grantRef: 'grant-double' }))
    expect(await screen.findByText('Access approved — return to your agent')).toBeTruthy()
  })

  it('retains loaded choices when the next replacement-target page fails and retries it', async () => {
    const firstTargets = [
      { principalRef: 'prn_agent_a', principalRevision: 3, displayName: 'Research agent' },
    ]
    const secondTargets = encodeURIComponent(JSON.stringify([
      { principalRef: 'prn_agent_b', principalRevision: 5, displayName: 'Shipping agent' },
    ]))
    const cursor = 'opaque+/cursor=='
    mockConsent({
      userCode: 'PAGE-CODE', grantRef: 'grant-paged', clientName: 'Agent CLI', mode: 'approve_each',
      agentTargets: firstTargets, agentTargetsNextCursor: cursor,
    })
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(
        '<main data-ae-consent data-grant-ref="grant-paged" data-grant-revision="1" data-flow="device_code" data-client-name="Agent CLI" data-authority-mode="approve_each" data-agent-targets="%5B%5D" data-agent-targets-unavailable="true"></main>',
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response(
        `<main data-ae-consent data-grant-ref="grant-paged" data-grant-revision="1" data-flow="device_code" data-client-name="Agent CLI" data-authority-mode="approve_each" data-agent-targets="${secondTargets}" data-agent-targets-unavailable="false"></main>`,
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
  agentTargets?: readonly Readonly<{ principalRef: string; principalRevision: number; displayName: string }>[]
  agentTargetsNextCursor?: string
  environment?: 'sandbox' | 'production'
  expiresInSeconds?: number
  accessSummary?: string
  operationAccess?: 'all_admitted' | 'selected_operations'
  operationRefs?: readonly string[]
}>) {
  vi.spyOn(AgentAccessAuthorizeRoute, 'useLoaderData').mockReturnValue({
    kind: 'ready',
    locator: { kind: 'user_code', value: input.userCode },
    details: {
      state: 'ready',
      grantRef: input.grantRef,
      grantRevision: 1,
      flow: 'device_code',
      clientName: input.clientName,
      mode: input.mode,
      environment: input.environment ?? 'sandbox',
      operationAccess: input.operationAccess ?? 'all_admitted',
      operationRefs: input.operationRefs ?? [],
      expiresInSeconds: input.expiresInSeconds ?? 604_800,
      accessSummary: input.accessSummary ?? 'No additional spend or rate controls were supplied.',
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
