import { describe, expect, it, vi } from 'vitest'

import {
  handleAgentCustomerOptionsPost,
  handleAgentCustomerRequestConfirmationPost,
  handleAgentCustomerRequestFactsPost,
  handleAgentCustomerRequestGet,
  handleAgentCustomerRequestMessagePost,
  handleAgentCustomerRequestPost,
  handleAgentCustomerRequestRunPost,
  handleAgentCustomerRequestCancelPost,
} from '@/lib/server/customer-request-agent-api'
import { handleCustomerOptionsPost } from '@/lib/server/customer-options-api'
import { handleCustomerRequestFactsPost } from '@/lib/server/customer-request-facts-api'
import { handleCustomerRequestGet } from '@/lib/server/customer-request-inspect-api'
import { handleCustomerRequestMessagePost } from '@/lib/server/customer-request-messages-api'
import { handleCustomerRequestPost } from '@/lib/server/customer-request-api'
import { handleCustomerRequestConfirmationPost } from '@/lib/server/customer-request-confirmation-api'
import {
  handleCustomerRequestCancelPost,
  handleCustomerRequestRunPost,
} from '@/lib/server/customer-request-route-action-api'
import { verifyCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'

const key = 'entrypoint-parity-key-with-at-least-32-bytes'
const requestRef = 'request:parity:1'
const projection = {
  kind: 'request' as const,
  requestRef,
  revision: 2,
  routeGenerationRef: 'generation:parity',
  state: 'routes_ready' as const,
  summary: 'One way forward is available.',
  nextAction: 'inspect_routes' as const,
  missingFields: [],
  options: [],
  decision: {
    generationRef: 'generation:parity', requestRevision: 2,
    outcome: { kind: 'routes_available' as const, routeCount: 1, summary: 'One way forward is available.' },
    routes: [{
      routeRef: 'route:opaque',
      quoteDigest: 'quote:opaque',
      result: {
        resultRef: 'route:opaque', summary: 'Prepare a governed result.', deliverables: ['Result reference'],
      },
      availability: 'current' as const, stepCount: 1,
      businesses: [{ businessRef: 'business:opaque', name: 'North Star Services' }],
      maximumTotalCost: { kind: 'known' as const, currency: 'AUD', amountMinor: 1_200 },
      dataUse: {
        recipientCount: 1,
        recipients: [{
          recipientRef: 'recipient:opaque', name: 'North Star Services', purposes: ['Prepare result'],
          fields: [{ fieldRef: 'field:request', label: 'Request', classification: 'public' as const }],
        }],
        purposes: ['Prepare result'],
      },
      effects: [{ kind: 'information_shared' as const, reversibility: 'irreversible' as const }],
      evidence: [{ label: 'Result reference', purpose: 'completion' as const }],
      recovery: [{ step: 1, businessName: 'North Star Services', posture: 'retry_safe' as const }],
      cancellation: { kind: 'unavailable' as const, summary: 'This option does not publish a cancellation path.' },
      validUntil: 50_000, fallback: { available: false, alternatives: [] }, uncertainty: [],
      comparison: {
        outcomeRef: 'outcome:opaque', outcomeFit: 'same_promised_result' as const,
        completeness: 'complete' as const, hardConstraints: 'satisfied' as const,
        maximumCost: { kind: 'known' as const, currency: 'AUD', amountMinor: 1_200 },
        dataExposureCount: 1, irreversibleEffectCount: 1, uncertaintyCount: 0,
        duration: 'not_declared' as const, recovery: 'retry_safe' as const,
        trust: 'registered_current_option' as const, evidenceCount: 1,
        freshness: { state: 'current' as const, validUntil: 50_000 },
        commercialInfluence: { status: 'none' as const, evidenceRefs: ['commercial:none'] },
      },
    }],
    comparison: {
      kind: 'single' as const,
      summary: 'One current way forward is available. This is not a comparison or recommendation.',
    },
    actions: {
      review: { kind: 'inspect_current_option' as const, createsAuthority: false as const, startsWork: false as const, summary: 'Reviewing shows every important limit. It does not confirm or start anything.' },
      confirm: { kind: 'confirm_current_option' as const, createsAuthority: true as const, startsWork: false as const, summary: 'Confirming creates permission for this exact choice. It does not contact a business or start work.' },
      start: { kind: 'start_confirmed_option' as const, availableAfter: 'confirmation' as const, startsWork: true as const, summary: 'Starting uses that confirmation to contact the listed businesses and begin the work.' },
      change: { kind: 'revise_request' as const, createsAuthority: false as const, startsWork: false as const, preservesRequest: true as const, summary: 'Changing preserves the Request and returns to its details. The current choice remains unconfirmed.' },
      decline: { kind: 'leave_unconfirmed' as const, createsAuthority: false as const, startsWork: false as const, preservesRequest: true as const, summary: 'Declining leaves this choice unconfirmed and starts nothing.' },
    },
    changes: { kind: 'initial' as const },
    nextBoundary: { kind: 'confirmation' as const, authorityCreated: false as const },
  },
}
const authenticate = async () => ({
  isAuthenticated: true as const,
  tokenType: 'api_key' as const,
  id: 'ak_parity',
  subject: 'user_parity',
  userId: 'user_parity',
  orgId: null,
  scopes: ['customer_requests:create'],
})

type Capture = (args: Record<string, unknown>) => Promise<typeof projection>
type AgentCall = (name: string, args: Record<string, unknown>) => Promise<typeof projection>
type ParityCase = Readonly<{
  operation: 'submit' | 'facts' | 'refine' | 'compare' | 'confirm' | 'run' | 'cancel' | 'resume'
  actionName: string
  human: (capture: Capture) => Promise<Response>
  agent: (callAction: AgentCall) => Promise<Response>
}>

const cases: readonly ParityCase[] = [
  {
    operation: 'submit',
    actionName: 'customerRequestApplication:submit',
    human: async (submit) => await handleCustomerRequestPost(post('/api/requests', {
      idempotencyKey: 'submit:parity', requestRef, agentRef: 'human-delegated-agent', request: 'Find an option',
    }), { submit }),
    agent: async (callAction) => await handleAgentCustomerRequestPost(post('/api/v1/requests', {
      idempotencyKey: 'submit:parity', requestRef, agentRef: 'caller-cannot-set-principal', request: 'Find an option',
    }), agentOptions(callAction)),
  },
  {
    operation: 'refine',
    actionName: 'customerRequestApplication:refine',
    human: async (refine) => await handleCustomerRequestMessagePost(post('/messages', {
      idempotencyKey: 'message:parity', expectedRevision: 1, message: 'Make it relaxed.', mode: 'replace',
    }), requestRef, { refine }),
    agent: async (callAction) => await handleAgentCustomerRequestMessagePost(post('/api/v1/messages', {
      idempotencyKey: 'message:parity', expectedRevision: 1, message: 'Make it relaxed.', mode: 'replace',
    }), requestRef, agentOptions(callAction)),
  },
  {
    operation: 'facts',
    actionName: 'customerRequestApplication:provideFacts',
    human: async (provideFacts) => await handleCustomerRequestFactsPost(post('/facts', {
      idempotencyKey: 'facts:parity', expectedRevision: 1,
      requirementKey: 'requirement:opaque', value: { destination: '6000' },
    }), requestRef, { provideFacts }),
    agent: async (callAction) => await handleAgentCustomerRequestFactsPost(post('/api/v1/facts', {
      idempotencyKey: 'facts:parity', expectedRevision: 1,
      requirementKey: 'requirement:opaque', value: { destination: '6000' },
    }), requestRef, agentOptions(callAction)),
  },
  {
    operation: 'compare',
    actionName: 'customerRequestApplication:compare',
    human: async (compare) => await handleCustomerOptionsPost(post('/options', {
      revision: 2, idempotencyKey: 'compare:parity',
    }), requestRef, { compare }),
    agent: async (callAction) => await handleAgentCustomerOptionsPost(post('/api/v1/options', {
      revision: 2, idempotencyKey: 'compare:parity',
    }), requestRef, agentOptions(callAction)),
  },
  {
    operation: 'confirm',
    actionName: 'customerRequestApplication:confirmRoute',
    human: async (confirm) => await handleCustomerRequestConfirmationPost(post('/confirmation', {
      revision: 2, routeRef: 'route:opaque', idempotencyKey: 'confirm:parity',
    }), requestRef, { confirm }),
    agent: async (callAction) => await handleAgentCustomerRequestConfirmationPost(post('/api/v1/confirmation', {
      revision: 2, routeRef: 'route:opaque', idempotencyKey: 'confirm:parity',
    }), requestRef, agentOptions(callAction)),
  },
  {
    operation: 'run',
    actionName: 'customerRequestApplication:runRoute',
    human: async (run) => await handleCustomerRequestRunPost(post('/run', {
      idempotencyKey: 'run:parity',
    }), requestRef, { run }),
    agent: async (callAction) => await handleAgentCustomerRequestRunPost(post('/api/v1/run', {
      idempotencyKey: 'run:parity',
    }), requestRef, agentOptions(callAction)),
  },
  {
    operation: 'cancel',
    actionName: 'customerRequestApplication:cancelRoute',
    human: async (cancel) => await handleCustomerRequestCancelPost(post('/cancellation', {
      idempotencyKey: 'cancel:parity', mode: 'after_current_step',
    }), requestRef, { cancel }),
    agent: async (callAction) => await handleAgentCustomerRequestCancelPost(post('/api/v1/cancellation', {
      idempotencyKey: 'cancel:parity', mode: 'after_current_step',
    }), requestRef, agentOptions(callAction)),
  },
  {
    operation: 'resume',
    actionName: 'customerRequestApplication:resume',
    human: async (inspect) => await handleCustomerRequestGet(requestRef, { inspect }),
    agent: async (callAction) => await handleAgentCustomerRequestGet(requestRef, agentOptions(callAction)),
  },
]

describe('human and external-agent Request entrypoint parity', () => {
  it('refuses the same sensitive submission before either entrypoint reaches the application', async () => {
    const body = {
      idempotencyKey: 'submit:sensitive', requestRef: 'request:parity:sensitive', agentRef: 'agent:test',
      request: 'Find an option. Card: 4242 4242 4242 4242; password is synthetic-password.',
    }
    const humanSubmit = vi.fn()
    const agentCall = vi.fn()
    const humanResponse = await handleCustomerRequestPost(post('/api/requests', body), { submit: humanSubmit })
    const agentResponse = await handleAgentCustomerRequestPost(
      post('/api/v1/requests', body), agentOptions(agentCall),
    )

    expect(humanResponse.status).toBe(422)
    expect(agentResponse.status).toBe(humanResponse.status)
    expect(await agentResponse.json()).toEqual(await humanResponse.json())
    expect(humanSubmit).not.toHaveBeenCalled()
    expect(agentCall).not.toHaveBeenCalled()
  })

  it('refuses the same sensitive refinement before either entrypoint reaches the application', async () => {
    const body = {
      idempotencyKey: 'message:sensitive', expectedRevision: 1,
      message: 'Use this password: synthetic-password.',
    }
    const humanRefine = vi.fn()
    const agentCall = vi.fn()
    const humanResponse = await handleCustomerRequestMessagePost(
      post('/api/requests/request/messages', body), requestRef, { refine: humanRefine },
    )
    const agentResponse = await handleAgentCustomerRequestMessagePost(
      post('/api/v1/requests/request/messages', body), requestRef, agentOptions(agentCall),
    )

    expect(humanResponse.status).toBe(422)
    expect(agentResponse.status).toBe(humanResponse.status)
    expect(await agentResponse.json()).toEqual(await humanResponse.json())
    expect(humanRefine).not.toHaveBeenCalled()
    expect(agentCall).not.toHaveBeenCalled()
  })

  it.each(cases)('$operation uses the same application command and customer response', async (entrypoint) => {
    let humanCommand: Record<string, unknown> | undefined
    let agentCommand: Record<string, unknown> | undefined
    let calledAction: string | undefined
    const humanResponse = await entrypoint.human(async (args) => {
      humanCommand = args
      return projection
    })
    const agentResponse = await entrypoint.agent(async (name, args) => {
      calledAction = name
      agentCommand = args
      return projection
    })

    expect(calledAction).toBe(entrypoint.actionName)
    expect(agentResponse.status).toBe(humanResponse.status)
    const agentBody = await agentResponse.json() as Record<string, unknown>
    const { navigation, ...agentProjection } = agentBody
    expect(agentProjection).toEqual(await humanResponse.json())
    expect(navigation).toMatchObject({
      current: `/api/v1/requests/${encodeURIComponent(requestRef)}`,
      actions: [
        { relation: 'change_request', href: `/api/v1/requests/${encodeURIComponent(requestRef)}/messages` },
        { relation: 'confirm_option', href: `/api/v1/requests/${encodeURIComponent(requestRef)}/confirmation` },
      ],
    })
    if (humanCommand === undefined || agentCommand === undefined) throw new Error('entrypoint command missing')
    const { serviceAuth, ...unsignedAgentCommand } = agentCommand
    expect(withoutDelegatedPrincipal(unsignedAgentCommand)).toEqual(withoutDelegatedPrincipal(humanCommand))
    await expect(verifyCustomerRequestServiceAssertion({
      key,
      operation: entrypoint.operation,
      command: unsignedAgentCommand as never,
      assertion: serviceAuth as never,
      now: 1_001,
    })).resolves.toBe(true)
  })
})

function agentOptions(callAction: AgentCall) {
  return { authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000 }
}

function withoutDelegatedPrincipal(command: Record<string, unknown>): Record<string, unknown> {
  const { delegatedAgentId: _delegatedAgentId, ...semanticCommand } = command
  return semanticCommand
}

function post(path: string, body: unknown): Request {
  return new Request(`https://ae.test${path}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ak_test_secret', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
