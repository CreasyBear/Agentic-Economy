/**
 * @vitest-environment jsdom
 */
import { createElement, type ComponentType } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { isRedirect, type AnyRedirect } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  handleHostedPaidOperationHumanCreate,
  type HostedPaidOperationCreationGateway,
} from '@/lib/server/hosted-paid-operation-human-api'
import { handleHostedPaidOperationAgentCreate } from '@/lib/server/hosted-paid-operation-agent-api'
import { Route as SetupRoute } from '@/routes/actions.paid.new'

const clerk = vi.hoisted(() => ({
  auth: vi.fn(),
  client: vi.fn(),
}))
const runtime = vi.hoisted(() => ({
  get: vi.fn(),
}))
const serverFunctions = vi.hoisted(() => ({
  calls: [] as Array<Readonly<{ method: string; data: unknown }>>,
}))

vi.mock('@clerk/tanstack-react-start/server', () => ({
  auth: clerk.auth,
  clerkClient: clerk.client,
}))

vi.mock('@/lib/server/hosted-paid-operation-runtime', () => ({
  getHostedPaidOperationRuntime: runtime.get,
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: (options?: Readonly<{ method?: string }>) => {
    const build = (validator: (data: unknown) => unknown = (data) => data) => ({
      validator: (next: (data: unknown) => unknown) => build(next),
      handler: (
        handler: (input: Readonly<{ data: unknown }>) => unknown | Promise<unknown>,
      ) => Object.assign(
        async (input: Readonly<{ data?: unknown }> = {}) => {
          const data = validator(input.data)
          serverFunctions.calls.push({ method: options?.method ?? 'GET', data })
          return await handler({ data })
        },
        { method: options?.method ?? 'GET', serverBoundary: true },
      ),
    })
    return build()
  },
}))

afterEach(() => {
  cleanup()
  clerk.auth.mockReset()
  clerk.client.mockReset()
  runtime.get.mockReset()
  serverFunctions.calls.length = 0
})

describe('hosted paid-operation evaluator creation adapters', () => {
  it('protects Sandbox setup before rendering and preserves the exact return path', async () => {
    clerk.auth.mockResolvedValue({
      isAuthenticated: false,
      userId: null,
      sessionId: null,
    })
    const beforeLoad = SetupRoute.options.beforeLoad
    if (beforeLoad === undefined) throw new Error('paid_operation_setup_guard_missing')

    let thrown: unknown
    try {
      await beforeLoad({
        location: { href: '/actions/paid/new' },
      } as never)
    } catch (error) {
      thrown = error
    }

    expect(isRedirect(thrown)).toBe(true)
    const redirect = thrown as AnyRedirect
    expect(redirect.options).toMatchObject({
      to: '/sign-in/$',
      params: { _splat: '' },
      search: { redirect: '/actions/paid/new' },
    })
    expect(JSON.stringify(redirect.options)).not.toMatch(
      /BTC|USD|provider|maximum charge|amount/u,
    )
    expect(runtime.get).not.toHaveBeenCalled()
  })

  it('renders the frozen evaluator setup contract with no default selection', () => {
    const Component = SetupRoute.options.component as ComponentType
    render(createElement(Component))

    expect(screen.getByRole('heading', { level: 1, name: 'Sandbox setup' })).toBeTruthy()
    expect(screen.getByRole('heading', {
      level: 2,
      name: 'Get the latest BTC price in USD',
    })).toBeTruthy()
    expect(screen.getByText(
      'Hosted sandbox · Uses labelled mock providers · No real payment',
    )).toBeTruthy()
    expect(screen.getByText(
      'Choose one labelled mock fixture for this evaluator trial. No real payment.',
    )).toBeTruthy()

    const group = screen.getByRole('group', { name: 'Choose a labelled mock fixture' })
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[]
    expect(radios).toHaveLength(2)
    expect(radios.every((radio) => radio.checked === false)).toBe(true)
    expect(within(group).getAllByText('Mock provider')).toHaveLength(2)
    expect(within(group).getAllByText('Operation revision 1')).toHaveLength(2)
    expect(within(group).getAllByText('$0.01 USD')).toHaveLength(2)

    const submit = screen.getByRole('button', {
      name: 'Create sandbox operation',
    }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    const providerB = radios[1]
    if (providerB === undefined) throw new Error('provider_b_radio_missing')
    fireEvent.click(providerB)
    expect(submit.disabled).toBe(false)
  })

  it('navigates one native form creation to the server-generated Action Detail relation', async () => {
    const calls: unknown[] = []
    const creation: HostedPaidOperationCreationGateway = {
      create: async (input) => {
        calls.push(input)
        return {
          kind: 'created',
          invocationRef: 'invocation:native-form',
          expectedInvocationVersion: 1,
        }
      },
    }
    runtime.get.mockResolvedValue({ creation })
    clerk.auth.mockResolvedValue({
      isAuthenticated: true,
      userId: 'owner:paid',
      sessionId: 'session:human',
    })
    const handlers = SetupRoute.options.server?.handlers as
      | Readonly<{ POST?: (input: Readonly<{ request: Request }>) => Promise<Response> }>
      | undefined
    const post = handlers?.POST
    if (post === undefined) throw new Error('paid_operation_setup_post_missing')

    const response = await post({
      request: new Request('https://ae.test/actions/paid/new', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ providerKey: 'B' }),
      }),
    } as never)

    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(
      '/actions/paid/invocation%3Anative-form?expectedInvocationVersion=1',
    )
    expect(await response.text()).toBe('')
    expect(calls).toEqual([{
      actor: { principalRef: 'owner:paid', callerRef: 'session:human' },
      setup: { providerKey: 'B' },
    }])
  })

  it('does not create when the native setup form has no selected provider', async () => {
    let creations = 0
    const creation: HostedPaidOperationCreationGateway = {
      create: async () => {
        creations += 1
        return {
          kind: 'created',
          invocationRef: 'invocation:unexpected',
          expectedInvocationVersion: 1,
        }
      },
    }
    runtime.get.mockResolvedValue({ creation })
    clerk.auth.mockResolvedValue({
      isAuthenticated: true,
      userId: 'owner:paid',
      sessionId: 'session:human',
    })
    const handlers = SetupRoute.options.server?.handlers as
      | Readonly<{ POST?: (input: Readonly<{ request: Request }>) => Promise<Response> }>
      | undefined
    const post = handlers?.POST
    if (post === undefined) throw new Error('paid_operation_setup_post_missing')

    const response = await post({
      request: new Request('https://ae.test/actions/paid/new', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(),
      }),
    } as never)

    expect(response.status).toBe(422)
    expect(creations).toBe(0)
  })

  it('accepts the native human setup form as closed provider intent', async () => {
    const calls: unknown[] = []
    const creation: HostedPaidOperationCreationGateway = {
      create: async (input) => {
        calls.push(input)
        return {
          kind: 'created',
          invocationRef: 'invocation:form',
          expectedInvocationVersion: 1,
        }
      },
    }
    const response = await handleHostedPaidOperationHumanCreate(
      new Request('https://ae.test/actions/paid/new', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ providerKey: 'B' }),
      }),
      {
        authenticate: async () => ({ userId: 'owner:paid', sessionId: 'session:human' }),
        creation,
      },
    )

    expect(response.status).toBe(201)
    expect(calls).toEqual([{
      actor: { principalRef: 'owner:paid', callerRef: 'session:human' },
      setup: { providerKey: 'B' },
    }])
  })

  it('accepts only providerKey and lets the source derive actor and consequence identities', async () => {
    const calls: unknown[] = []
    const creation: HostedPaidOperationCreationGateway = {
      create: async (input) => {
        calls.push(input)
        return {
          kind: 'created',
          invocationRef: 'invocation:server-generated',
          expectedInvocationVersion: 1,
        }
      },
    }
    const request = () => new Request('https://ae.test/api/v1/paid-operations', {
      method: 'POST',
      body: JSON.stringify({ providerKey: 'A' }),
    })
    const human = await handleHostedPaidOperationHumanCreate(request(), {
      authenticate: async () => ({ userId: 'owner:paid', sessionId: 'session:human' }),
      creation,
    })
    const agent = await handleHostedPaidOperationAgentCreate(request(), {
      authenticate: async () => ({
        kind: 'authenticated',
        principal: {
          actor: { principalRef: 'owner:paid', callerRef: 'agent:key' },
          credentialId: 'key:paid',
          scopes: ['paid_operation:invoke'],
        },
      }),
      creation,
    })
    expect(human.status).toBe(201)
    expect(agent.status).toBe(201)
    expect(await human.json()).toEqual({
      kind: 'created',
      invocationRef: 'invocation:server-generated',
      expectedInvocationVersion: 1,
      relation: {
        inspect: '/actions/paid/invocation%3Aserver-generated?expectedInvocationVersion=1',
      },
    })
    expect(await agent.json()).toEqual({
      kind: 'created',
      invocationRef: 'invocation:server-generated',
      expectedInvocationVersion: 1,
      relation: {
        inspect: '/api/v1/paid-operations/invocation%3Aserver-generated?expectedInvocationVersion=1',
      },
    })
    expect(calls).toEqual([
      {
        actor: { principalRef: 'owner:paid', callerRef: 'session:human' },
        setup: { providerKey: 'A' },
      },
      {
        actor: { principalRef: 'owner:paid', callerRef: 'agent:key' },
        setup: { providerKey: 'A' },
      },
    ])
    expect(JSON.stringify(calls)).not.toMatch(/authority|payment|effect|amount|recipient/u)
  })

  it('rejects evaluator setup bypass before creation', async () => {
    let creations = 0
    const creation: HostedPaidOperationCreationGateway = {
      create: async () => {
        creations += 1
        return {
          kind: 'created',
          invocationRef: 'invocation:unexpected',
          expectedInvocationVersion: 1,
        }
      },
    }
    const response = await handleHostedPaidOperationAgentCreate(
      new Request('https://ae.test/api/v1/paid-operations', {
        method: 'POST',
        body: JSON.stringify({
          providerKey: 'A',
          ownerId: 'owner:forged',
          authorityRef: 'authority:forged',
        }),
      }),
      {
        authenticate: async () => ({
          kind: 'authenticated',
          principal: {
            actor: { principalRef: 'owner:paid', callerRef: 'agent:key' },
            credentialId: 'key:paid',
            scopes: ['paid_operation:invoke'],
          },
        }),
        creation,
      },
    )
    expect(response.status).toBe(422)
    expect(creations).toBe(0)
  })
})
