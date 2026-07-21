/**
 * @vitest-environment jsdom
 */
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { isRedirect, type AnyRedirect } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  handleHostedPaidOperationHumanCommand,
  handleHostedPaidOperationHumanInspect,
  type HostedPaidOperationTransportGateway,
} from '@/lib/server/hosted-paid-operation-human-api'
import {
  handleHostedPaidOperationAgentCommand,
  handleHostedPaidOperationAgentInspect,
} from '@/lib/server/hosted-paid-operation-agent-api'
import type { PaidOperationProjection } from '@/modules/action-invocation/paid-operation-application-service'
import {
  HostedPaidOperationDetailView,
  Route as DetailRoute,
} from '@/routes/actions.paid.$invocationRef'

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

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  const { createElement: createMockElement } = await import('react')
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: Readonly<{
      children: ReactNode
      className?: string
      to: string
    }>) => createMockElement('a', { ...props, href: to }, children),
  }
})

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

describe('hosted paid-operation authenticated adapters', () => {
  it('protects detail before loading and preserves the exact intended return', async () => {
    clerk.auth.mockResolvedValue({
      isAuthenticated: false,
      userId: null,
      sessionId: null,
    })
    const beforeLoad = DetailRoute.options.beforeLoad
    if (beforeLoad === undefined) throw new Error('paid_operation_detail_guard_missing')

    let thrown: unknown
    try {
      await beforeLoad({
        location: {
          href: '/actions/paid/secret-ref?expectedInvocationVersion=3',
        },
      } as never)
    } catch (error) {
      thrown = error
    }

    expect(isRedirect(thrown)).toBe(true)
    const redirect = thrown as AnyRedirect
    expect(redirect.options).toMatchObject({
      to: '/sign-in/$',
      params: { _splat: '' },
      search: {
        redirect: '/actions/paid/secret-ref?expectedInvocationVersion=3',
      },
    })
    expect(JSON.stringify(redirect.options)).not.toMatch(
      /BTC|USD|provider|maximum charge|amount/u,
    )
    expect(runtime.get).not.toHaveBeenCalled()
  })

  it('loads detail through createServerFn and gives missing/cross-owner one ordinary state', async () => {
    clerk.auth.mockResolvedValue({
      isAuthenticated: true,
      userId: 'owner:paid',
      sessionId: 'session:human',
    })
    const refusals = ['invocation_not_found', 'cross_principal_refused'] as const
    let refusalIndex = 0
    const inspect = vi.fn(async () => ({
      kind: 'refused' as const,
      code: refusals[refusalIndex++] ?? 'invocation_not_found',
    }))
    runtime.get.mockResolvedValue({
      gateway: { inspect, command: vi.fn() },
      provenance: 'Labelled mock provider',
      currentVersion: vi.fn(),
    })
    const loader = DetailRoute.options.loader as (input: Readonly<{
      params: Readonly<{ invocationRef: string }>
      deps: Readonly<{ expectedInvocationVersion: number }>
    }>) => Promise<unknown>
    const loaderSource = String(loader)
    expect(loaderSource).toContain('readHostedPaidOperationDetailServer')
    expect(loaderSource).not.toMatch(
      /getHostedPaidOperationRuntime|auth\s*\(|process\.env/u,
    )

    const input = {
      params: { invocationRef: 'secret-ref' },
      deps: { expectedInvocationVersion: 3 },
    }
    const missing = await loader(input)
    const crossOwner = await loader(input)

    expect(missing).toEqual(crossOwner)
    expect(missing).toEqual({
      status: 404,
      body: { kind: 'refused', code: 'invocation_not_found' },
    })
    expect(serverFunctions.calls).toEqual([
      {
        method: 'GET',
        data: {
          invocationRef: 'secret-ref',
          expectedInvocationVersion: 3,
        },
      },
      {
        method: 'GET',
        data: {
          invocationRef: 'secret-ref',
          expectedInvocationVersion: 3,
        },
      },
    ])
    expect(inspect).toHaveBeenCalledTimes(2)

    const missingMarkup = renderToStaticMarkup(createElement(
      HostedPaidOperationDetailView,
      { result: missing as never },
    ))
    const crossOwnerMarkup = renderToStaticMarkup(createElement(
      HostedPaidOperationDetailView,
      { result: crossOwner as never },
    ))
    expect(missingMarkup).toBe(crossOwnerMarkup)
    expect(missingMarkup).toContain('This operation is not available to this account')
    expect(missingMarkup).toContain('href="/actions/paid/new"')
    expect(missingMarkup).toContain('Back to Sandbox setup')
    expect(missingMarkup).not.toMatch(
      /invocation_not_found|cross_principal_refused|secret-ref/u,
    )
  })

  it('projects identical semantics and frozen host inputs without treating identity as authority', async () => {
    const projection = paidProjection()
    const gateway: HostedPaidOperationTransportGateway = {
      inspect: async () => ({ kind: 'accepted', value: projection }),
      command: async () => ({ kind: 'accepted', value: projection }),
    }
    const human = await handleHostedPaidOperationHumanInspect('invocation:paid', 3, {
      authenticate: async () => ({ userId: 'owner:paid', sessionId: 'session:human' }),
      gateway,
      provenance: 'Labelled mock provider',
    })
    const agent = await handleHostedPaidOperationAgentInspect('invocation:paid', 3, {
      authenticate: async () => ({
        kind: 'authenticated',
        principal: {
          actor: { principalRef: 'owner:paid', callerRef: 'session:human' },
          credentialId: 'key:paid',
          scopes: ['paid_operation:invoke'],
        },
      }),
      gateway,
      provenance: 'Labelled mock provider',
    })
    const humanBody = await human.json()
    const agentBody = await agent.json()

    expect(humanBody.projection.semanticDigest).toBe(agentBody.projection.semanticDigest)
    expect(humanBody).toMatchObject({
      schema: 'agentic-paid-operation:v1',
      expectedInvocationVersion: 3,
      environment: {
        name: 'Local labelled sandbox',
        provenance: 'Labelled mock provider',
        evidenceClass: 'local_labelled_sandbox_fixture',
        claimCeiling: 'Local authenticated route fixtures only.',
      },
      card: {
        disclosure: {
          providerDisplayName: 'Mock provider A',
          materialFields: ['BTC', 'USD'],
          maximumCharge: { currency: 'USD', amountMinor: 1 },
        },
        authorize: expect.objectContaining({ command: 'authorize', accept: true }),
        refuse: expect.objectContaining({ command: 'authorize', accept: false }),
        pendingCommand: null,
        transportRescue: null,
        paymentTruth: { state: 'not_submitted' },
        settlementTruth: { state: 'no_evidence' },
        resultTruth: { state: 'not_delivered' },
        safeContinuation: expect.objectContaining({ command: 'authorize' }),
        operationBlocks: expect.any(Array),
        runtimeEvidence: expect.objectContaining({
          evidenceClass: 'local_labelled_sandbox_fixture',
        }),
        technicalDetails: expect.objectContaining({
          invocationRef: 'invocation:paid',
          expectedInvocationVersion: 3,
          semanticDigest: 'sha256:semantic',
        }),
      },
    })
    expect(JSON.stringify(humanBody)).not.toMatch(/authorityRef|reconciliationEvidence|paymentReconciliationEvidence/u)
    expect(JSON.stringify(agentBody)).not.toMatch(/authorityRef|reconciliationEvidence|paymentReconciliationEvidence/u)
  })

  it('does not disclose facts before auth or across owners and fences stale/disallowed commands', async () => {
    let mutations = 0
    const gateway: HostedPaidOperationTransportGateway = {
      inspect: async () => ({ kind: 'refused', code: 'invocation_not_found' }),
      command: async ({ command }) => {
        mutations += 1
        return command.kind === 'execute'
          ? { kind: 'refused', code: 'stale_invocation_version' }
          : { kind: 'refused', code: 'continuation_not_allowed' }
      },
    }
    const unauthenticated = await handleHostedPaidOperationHumanInspect('secret-ref', 3, {
      authenticate: async () => null,
      gateway,
      provenance: 'Labelled mock provider',
    })
    expect(unauthenticated.status).toBe(401)
    expect(await unauthenticated.json()).toEqual({
      kind: 'refused',
      code: 'authentication_required',
      relation: { authenticate: '/sign-in?redirect=%2Factions%2Fpaid%2Fsecret-ref' },
    })

    const unavailable = await handleHostedPaidOperationHumanInspect('secret-ref', 3, {
      authenticate: async () => ({ userId: 'owner:other', sessionId: 'session:other' }),
      gateway,
      provenance: 'Labelled mock provider',
    })
    expect(unavailable.status).toBe(404)
    expect(await unavailable.json()).toEqual({
      kind: 'refused',
      code: 'invocation_not_found',
    })

    const stale = await handleHostedPaidOperationHumanCommand(
      new Request('https://ae.test/actions/paid/secret-ref', {
        method: 'POST',
        body: JSON.stringify({
          command: 'execute',
          commandId: 'command:one',
          expectedInvocationVersion: 3,
        }),
      }),
      'secret-ref',
      {
        authenticate: async () => ({ userId: 'owner:paid', sessionId: 'session:paid' }),
        gateway,
        provenance: 'Labelled mock provider',
        currentVersion: async () => 4,
      },
    )
    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({
      kind: 'refused',
      code: 'stale_invocation_version',
      suppliedVersion: 3,
      currentExpectedInvocationVersion: 4,
      relation: { inspect: '/actions/paid/secret-ref?expectedInvocationVersion=4' },
    })
    expect(mutations).toBe(1)
  })

  it('accepts public reconciliation intent only and converts ambiguous transport into read-only inspect recovery', async () => {
    const seen: unknown[] = []
    const gateway: HostedPaidOperationTransportGateway = {
      inspect: async () => ({ kind: 'accepted', value: paidProjection() }),
      command: async (input) => {
        seen.push(input)
        throw new Error('transport_lost')
      },
    }
    const response = await handleHostedPaidOperationAgentCommand(
      new Request('https://ae.test/api/v1/paid-operations/invocation:paid/commands', {
        method: 'POST',
        body: JSON.stringify({
          command: 'reconcile',
          commandId: 'command:reconcile',
          expectedInvocationVersion: 3,
        }),
      }),
      'invocation:paid',
      {
        authenticate: async () => ({
          kind: 'authenticated',
          principal: {
            actor: { principalRef: 'owner:paid', callerRef: 'agent:key' },
            credentialId: 'key:paid',
            scopes: ['paid_operation:invoke'],
          },
        }),
        gateway,
        provenance: 'Labelled mock provider',
        requestId: () => 'request:ambiguous',
      },
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      kind: 'update_not_confirmed',
      requestId: 'request:ambiguous',
      relation: {
        inspect: '/api/v1/paid-operations/invocation%3Apaid?expectedInvocationVersion=3',
      },
    })
    expect(seen).toEqual([expect.objectContaining({
      command: { kind: 'reconcile' },
      commandId: 'command:reconcile',
    })])

    const fabricated = await handleHostedPaidOperationAgentCommand(
      new Request('https://ae.test/api/v1/paid-operations/invocation:paid/commands', {
        method: 'POST',
        body: JSON.stringify({
          command: 'reconcile',
          commandId: 'command:fake',
          expectedInvocationVersion: 3,
          resolution: 'settled',
        }),
      }),
      'invocation:paid',
      {
        authenticate: async () => ({
          kind: 'authenticated',
          principal: {
            actor: { principalRef: 'owner:paid', callerRef: 'agent:key' },
            credentialId: 'key:paid',
            scopes: ['paid_operation:invoke'],
          },
        }),
        gateway,
        provenance: 'Labelled mock provider',
      },
    )
    expect(fabricated.status).toBe(422)
    expect(seen).toHaveLength(1)
  })

  it('renders one source-issued detail and preserves durable truth while an exact command is pending', async () => {
    const initial = await acceptedHumanReadback(paidProjection())
    const next = await acceptedHumanReadback(preparedProjection())
    let resolveCommand: ((value: Readonly<{ status: number; body: unknown }>) => void) | undefined
    const sendCommand = vi.fn((_body: Readonly<Record<string, unknown>>) =>
      new Promise<Readonly<{
      status: number
      body: unknown
    }>>((resolve) => {
      resolveCommand = resolve
      }))

    const { container } = render(createElement(HostedPaidOperationDetailView, {
      result: { status: 200, body: initial },
      sendCommand,
    }))

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1)
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
    expect(container.querySelector('[aria-live="polite"]')?.getAttribute('aria-atomic')).toBe(
      'true',
    )
    expect(container.querySelector('pre')).toBeNull()
    const embeddedProjection = container.querySelector(
      'script[data-paid-operation-human-projection]',
    )
    expect(
      embeddedProjection,
      '[P3C_RED:protected_human_projection_not_embedded]',
    ).not.toBeNull()
    expect(JSON.parse(embeddedProjection?.textContent ?? '{}')).toEqual(initial.projection)
    expect(screen.getByText('Ready for permission', { exact: true })).toBeTruthy()

    const authorize = screen.getByRole('button', { name: 'Authorize up to $0.01' })
    fireEvent.click(authorize)
    await waitFor(() => expect(sendCommand).toHaveBeenCalledTimes(1))
    const body = sendCommand.mock.calls[0]?.[0]
    expect(body).toEqual({
      command: 'authorize',
      commandId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
      ),
      expectedInvocationVersion: 3,
      accept: true,
    })
    expect(Object.keys(body ?? {}).sort()).toEqual([
      'accept',
      'command',
      'commandId',
      'expectedInvocationVersion',
    ])
    expect(screen.getByText('Ready for permission', { exact: true })).toBeTruthy()
    expect(screen.queryByText('Payment prepared', { exact: true })).toBeNull()
    expect(container.querySelector('[data-paid-operation-state]')?.getAttribute('aria-busy')).toBe(
      'true',
    )
    expect(authorize).toHaveProperty('disabled', true)
    fireEvent.click(authorize)
    expect(sendCommand).toHaveBeenCalledTimes(1)

    resolveCommand?.({ status: 200, body: next })
    await waitFor(() =>
      expect(screen.getByText('Payment prepared', { exact: true })).toBeTruthy())
    expect(screen.getAllByText(
      'Permission recorded. Nothing has been submitted yet.',
      { exact: true },
    )).toHaveLength(2)
    expect(screen.getByRole('status').textContent).toBe(
      'Permission recorded. Nothing has been submitted yet.',
    )
    expect(document.activeElement).toBe(screen.getByRole('status'))
  })

  it('sends public reconciliation intent only and follows stale source relations without replay', async () => {
    const initial = await acceptedHumanReadback(uncertainProjection())
    const inspect = '/actions/paid/invocation%3Apaid?expectedInvocationVersion=4'
    const sendCommand = vi.fn(async (_body: Readonly<Record<string, unknown>>) => ({
      status: 409,
      body: {
        kind: 'refused',
        code: 'stale_invocation_version',
        suppliedVersion: 3,
        currentExpectedInvocationVersion: 4,
        relation: { inspect },
      },
    }))
    const followInspectRelation = vi.fn()

    render(createElement(HostedPaidOperationDetailView, {
      result: { status: 200, body: initial },
      sendCommand,
      followInspectRelation,
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Check existing payment' }))

    await waitFor(() => expect(followInspectRelation).toHaveBeenCalledWith(inspect))
    expect(sendCommand).toHaveBeenCalledTimes(1)
    expect(sendCommand).toHaveBeenCalledWith({
      command: 'reconcile',
      commandId: expect.any(String),
      expectedInvocationVersion: 3,
    })
    expect(JSON.stringify(sendCommand.mock.calls[0]?.[0])).not.toMatch(
      /owner|principal|result|resolution|reconciliationEvidence/u,
    )
  })

  it('turns ambiguous command transport into one read-only reload continuation', async () => {
    const initial = await acceptedHumanReadback(paidProjection())
    const inspect = '/actions/paid/invocation%3Apaid?expectedInvocationVersion=3'
    const sendCommand = vi.fn(async (_body: Readonly<Record<string, unknown>>) => ({
      status: 503,
      body: {
        kind: 'update_not_confirmed',
        requestId: 'request:ambiguous',
        relation: { inspect },
      },
    }))
    const followInspectRelation = vi.fn()

    const { container } = render(createElement(HostedPaidOperationDetailView, {
      result: { status: 200, body: initial },
      sendCommand,
      followInspectRelation,
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Authorize up to $0.01' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/Update not confirmed/))
    expect(container.querySelectorAll('[data-command]')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Authorize|Continue|Check existing/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reload operation' }))
    expect(followInspectRelation).toHaveBeenCalledWith(inspect)
    expect(sendCommand).toHaveBeenCalledTimes(1)
  })

  it('fails closed when a command response is an unrecognized relationless 5xx', async () => {
    const initial = await acceptedHumanReadback(preparedProjection())
    const inspect = '/actions/paid/invocation%3Apaid?expectedInvocationVersion=4'
    const counters = {
      commandAttempts: 0,
      effectGenerations: 0,
      releaseAttempts: 0,
    }
    let commandId = ''
    const sendCommand = vi.fn(async (body: Readonly<Record<string, unknown>>) => {
      counters.commandAttempts += 1
      counters.effectGenerations += 1
      counters.releaseAttempts += 1
      commandId = String(body.commandId)
      return {
        status: 503,
        body: {
          kind: 'refused',
          code: 'aggregate_incomplete',
        },
      }
    })
    const followInspectRelation = vi.fn()

    const { container } = render(createElement(HostedPaidOperationDetailView, {
      result: { status: 200, body: initial },
      sendCommand,
      followInspectRelation,
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue operation' }))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/Update not confirmed/))
    expect(commandId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    )
    expect(screen.getByText('Payment prepared', { exact: true })).toBeTruthy()
    expect(container.querySelectorAll('[data-command]')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Authorize|Continue|Check existing/i })).toBeNull()
    expect(counters).toEqual({
      commandAttempts: 1,
      effectGenerations: 1,
      releaseAttempts: 1,
    })

    const countersBeforeReload = { ...counters }
    fireEvent.click(screen.getByRole('button', { name: 'Reload operation' }))

    expect(followInspectRelation).toHaveBeenCalledWith(inspect)
    expect(counters).toEqual(countersBeforeReload)
  })
})

async function acceptedHumanReadback(projection: PaidOperationProjection) {
  const response = await handleHostedPaidOperationHumanInspect(
    projection.semantics.identity.invocationRef,
    projection.semantics.identity.expectedInvocationVersion,
    {
      authenticate: async () => ({
        userId: 'owner:paid',
        sessionId: 'session:human',
      }),
      gateway: {
        inspect: async () => ({ kind: 'accepted', value: projection }),
        command: async () => ({ kind: 'accepted', value: projection }),
      },
      provenance: 'Labelled mock provider',
    },
  )
  return await response.json()
}

function preparedProjection(): PaidOperationProjection {
  const initial = paidProjection()
  const semantics = {
    ...initial.semantics,
    identity: {
      ...initial.semantics.identity,
      expectedInvocationVersion: 4,
    },
    paymentAuthorization: {
      state: 'created',
      paymentIdentifier: 'payment:prepared',
      custodyReference: {
        kind: 'opaque_digest_reference',
        algorithm: 'sha256',
        digest: `sha256:${'4'.repeat(64)}`,
      },
      evidenceRefs: ['evidence:prepared'],
    },
    continuations: [{
      kind: 'execute',
      command: 'execute_paid_operation',
      requiredInput: [],
      expectedInvocationVersion: 4,
      authorityRequired: true,
    }],
  } as const
  return projectionFromSemantics(semantics)
}

function uncertainProjection(): PaidOperationProjection {
  const initial = paidProjection()
  const semantics = {
    ...initial.semantics,
    queryRelease: {
      state: 'unknown',
      evidenceRefs: ['evidence:release-unknown'],
    },
    paymentAuthorization: {
      state: 'created',
      paymentIdentifier: 'payment:uncertain',
      custodyReference: {
        kind: 'opaque_digest_reference',
        algorithm: 'sha256',
        digest: `sha256:${'5'.repeat(64)}`,
      },
      evidenceRefs: ['evidence:prepared'],
    },
    paymentSubmission: {
      state: 'possibly_submitted',
      evidenceRefs: ['evidence:submission-unknown'],
    },
    settlement: {
      state: 'unknown',
      evidenceRefs: ['evidence:settlement-unknown'],
    },
    error: {
      code: 'reconciliation_required',
      phase: 'reconciliation',
      queryReleaseStatus: 'unknown',
      paymentSubmissionStatus: 'possibly_submitted',
      settlementStatus: 'unknown',
      resultStatus: 'not_delivered',
      retryability: 'reconcile_before_retry',
      safeNextAction: 'reconcile',
      evidenceRefs: ['evidence:submission-unknown'],
    },
    continuations: [{
      kind: 'reconcile',
      command: 'reconcile_paid_operation',
      requiredInput: ['reconciliationEvidence', 'paymentReconciliationEvidence'],
      expectedInvocationVersion: 3,
      authorityRequired: false,
    }],
  } as const
  return projectionFromSemantics(semantics)
}

function projectionFromSemantics(
  semantics: PaidOperationProjection['semantics'],
): PaidOperationProjection {
  return {
    semantics,
    human: {
      kind: 'human_rich_paid_operation',
      title: semantics.presentation.title,
      sections: [],
      semantics,
      semanticDigest: 'sha256:semantic',
      semanticDigestUse: 'projection_equality_only_not_authority',
    },
    agent: {
      kind: 'external_agent_paid_operation',
      semantics,
      semanticDigest: 'sha256:semantic',
      semanticDigestUse: 'projection_equality_only_not_authority',
    },
  }
}

function paidProjection(): PaidOperationProjection {
  const semantics = {
    schema: 'agentic-paid-operation:v1',
    identity: { invocationRef: 'invocation:paid', expectedInvocationVersion: 3 },
    operation: {
      operationKey: 'btc-usd',
      providerId: 'provider:A',
      providerName: 'Mock provider A',
      operationRevision: 'revision:1',
      materialInputs: { symbol: 'BTC', convert: 'USD' },
    },
    presentation: {
      title: 'Get the latest BTC price in USD',
      summary: 'One labelled mock paid operation.',
      blocks: [{ kind: 'text', label: 'Task', value: 'BTC to USD' }],
    },
    maximumAuthorizedCharge: { currency: 'USD', amountMinor: 1 },
    queryRelease: { state: 'not_released' },
    paymentAuthorization: { state: 'not_created' },
    paymentSubmission: { state: 'not_submitted' },
    settlement: { state: 'no_evidence' },
    resultDelivery: { state: 'not_delivered' },
    environment: {
      name: 'Local labelled sandbox',
      evidenceClass: 'local_labelled_sandbox_fixture',
      claimCeiling: 'Local authenticated route fixtures only.',
    },
    error: null,
    continuations: [{
      kind: 'authorize',
      command: 'authorize_paid_operation',
      requiredInput: ['authorityDecision'],
      expectedInvocationVersion: 3,
      authorityRequired: true,
    }],
  } as const
  return {
    semantics,
    human: {
      kind: 'human_rich_paid_operation',
      title: semantics.presentation.title,
      sections: [],
      semantics,
      semanticDigest: 'sha256:semantic',
      semanticDigestUse: 'projection_equality_only_not_authority',
    },
    agent: {
      kind: 'external_agent_paid_operation',
      semantics,
      semanticDigest: 'sha256:semantic',
      semanticDigestUse: 'projection_equality_only_not_authority',
    },
  }
}
