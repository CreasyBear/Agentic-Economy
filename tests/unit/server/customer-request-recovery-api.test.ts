import { describe, expect, it, vi } from 'vitest'

import {
  handleAgentCustomerRequestEvidenceGet,
  handleAgentCustomerRequestProblemPost,
  handleAgentCustomerRequestProblemReplyPost,
} from '@/lib/server/customer-request-agent-api'
import {
  handleCustomerRequestEvidenceGet,
  handleCustomerRequestProblemPost,
  handleCustomerRequestProblemReplyPost,
} from '@/lib/server/customer-request-recovery-api'
import { verifyCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'
import type {
  CustomerRequestEvidenceExport,
  CustomerRequestProblemReceipt,
  CustomerRequestProblemStatusChange,
} from '@/modules/customer-request/agent-contract'

const key = 'recovery-parity-key-with-at-least-32-bytes'
const requestRef = 'request:recovery:1'
const authenticate = async () => ({
  isAuthenticated: true as const, tokenType: 'api_key' as const, id: 'ak_recovery', subject: 'user_recovery',
  userId: 'user_recovery', orgId: null, scopes: ['customer_requests:create'],
})

describe('Customer Request recovery surface', () => {
  it('reports a customer-semantic problem through the same signed command', async () => {
    const receipt = {
      kind: 'problem_reported' as const, requestRef, reportRef: 'problem:opaque',
      state: 'received' as const, reportedAt: 1_000,
      problem: {
        category: 'incorrect_result' as const,
        claimSource: 'customer' as const,
        causality: 'unknown' as const,
        resolution: 'not_adjudicated' as const,
        nextAction: 'await_status_update' as const,
        nextActor: 'ae' as const,
        nextUpdateDueAt: 86_400_100,
        decisionAuthority: 'not_assigned' as const,
        visibility: 'customer_and_ae_only' as const,
        evidence: [],
        affected: { step: 1, attemptRef: 'attempt:opaque', business: 'Example business' },
        claims: [],
      },
    }
    let humanCommand: Record<string, unknown> | undefined
    const human = await handleCustomerRequestProblemPost(problemRequest(), requestRef, {
      report: async (command) => { humanCommand = command; return receipt },
    })
    const callAction = vi.fn(async (_name: string, _args: Record<string, unknown>) => receipt)
    const agent = await handleAgentCustomerRequestProblemPost(problemRequest(), requestRef, agentOptions(callAction))

    expect(await agent.json()).toEqual(await human.json())
    const [name, calledArgs] = callAction.mock.calls[0] ?? []
    expect(name).toBe('customerRequestApplication:reportRouteProblem')
    const { serviceAuth, ...command } = calledArgs ?? {}
    expect(command).toEqual(humanCommand)
    await expect(verifyCustomerRequestServiceAssertion({
      key, operation: 'report', command: command as never, assertion: serviceAuth as never, now: 1_001,
    })).resolves.toBe(true)
  })

  it('exports only customer-safe observed evidence through the same signed read', async () => {
    const exported = {
      kind: 'evidence' as const, requestRef, state: 'outcome_unknown' as const, generatedAt: 1_000,
      steps: [{
        step: 1, state: 'outcome_unknown' as const, observedAt: 900,
        evidence: [{ receiptRef: 'evidence:opaque', label: 'Result evidence 1' }],
      }],
      problems: [{
        reportRef: 'problem:opaque', version: 0, state: 'received' as const,
        category: 'incorrect_result' as const, summary: 'The result is wrong.',
        claimSource: 'customer' as const, causality: 'unknown' as const,
        resolution: 'not_adjudicated' as const, nextAction: 'await_status_update' as const,
        nextActor: 'ae' as const, nextUpdateDueAt: 86_400_100,
        decisionAuthority: 'not_assigned' as const,
        visibility: 'customer_and_ae_only' as const, evidence: [],
        reportedAt: 950, affected: { step: 1, attemptRef: 'attempt:opaque', business: 'Example business' },
        claims: [],
        history: [{
          version: 0, state: 'received' as const, source: 'customer' as const,
          message: 'The result is wrong.', recordedAt: 950,
        }],
      }],
    }
    const human = await handleCustomerRequestEvidenceGet(new Request('https://ae.test/evidence'), requestRef, {
      inspect: async () => exported,
    })
    const callAction = vi.fn(async (_name: string, _args: Record<string, unknown>) => exported)
    const agent = await handleAgentCustomerRequestEvidenceGet(
      new Request('https://ae.test/api/v1/evidence', { headers: { Authorization: 'Bearer ak_secret' } }),
      requestRef,
      agentOptions(callAction),
    )

    expect(await agent.json()).toEqual(await human.json())
    expect(JSON.stringify(exported)).not.toMatch(/transport|mandate|capability|binding/i)
    const [name, calledArgs] = callAction.mock.calls[0] ?? []
    expect(name).toBe('customerRequestApplication:exportRouteEvidence')
    const { serviceAuth, ...command } = calledArgs ?? {}
    await expect(verifyCustomerRequestServiceAssertion({
      key, operation: 'evidence', command: command as never, assertion: serviceAuth as never, now: 1_001,
    })).resolves.toBe(true)
  })

  it('records the same exact-version customer reply through human and agent surfaces', async () => {
    const recorded = {
      kind: 'problem_reply_recorded' as const,
      reportRef: 'problem:opaque',
      version: 2,
      state: 'investigating' as const,
      nextAction: 'await_status_update' as const,
      nextActor: 'ae' as const,
      nextUpdateDueAt: 86_401_000,
      decisionAuthority: 'not_assigned' as const,
      recordedAt: 1_000,
    }
    const request = () => new Request('https://ae.test/problems/problem%3Aopaque/replies', {
      method: 'POST',
      headers: { Authorization: 'Bearer ak_secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: 1,
        idempotencyKey: 'reply:one',
        message: 'The result exceeded the confirmed maximum by 25 dollars.',
      }),
    })
    let humanCommand: Record<string, unknown> | undefined
    const human = await handleCustomerRequestProblemReplyPost(request(), requestRef, 'problem:opaque', {
      reply: async (command) => { humanCommand = command; return recorded },
    })
    const callAction = vi.fn(async (_name: string, _args: Record<string, unknown>) => recorded)
    const agent = await handleAgentCustomerRequestProblemReplyPost(
      request(),
      requestRef,
      'problem:opaque',
      agentOptions(callAction),
    )

    expect(await agent.json()).toEqual(await human.json())
    const [name, calledArgs] = callAction.mock.calls[0] ?? []
    expect(name).toBe('customerRequestApplication:replyRouteProblem')
    const { serviceAuth, ...command } = calledArgs ?? {}
    expect(command).toEqual(humanCommand)
    await expect(verifyCustomerRequestServiceAssertion({
      key,
      operation: 'reply',
      command: command as never,
      assertion: serviceAuth as never,
      now: 1_001,
    })).resolves.toBe(true)
  })

  it('rejects unbounded or structurally invalid problem reports before source', async () => {
    const report = vi.fn()
    const response = await handleCustomerRequestProblemPost(new Request('https://ae.test/problems', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: 'one', category: 'kernel_failed', summary: 'x' }),
    }), requestRef, { report })
    expect(response.status).toBe(400)
    expect(report).not.toHaveBeenCalled()
  })

  it('returns invalid evidence selection as a customer-correctable request error', async () => {
    const response = await handleCustomerRequestProblemPost(problemRequest(), requestRef, {
      report: async () => ({ kind: 'refused', reason: 'evidence_not_found' }),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ kind: 'refused', reason: 'evidence_not_found' })
  })
})

function problemRequest(): Request {
  return new Request('https://ae.test/problems', {
    method: 'POST', headers: { Authorization: 'Bearer ak_secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: 'report:one', category: 'incorrect_result', summary: 'The result is wrong.',
      affectedStep: 1, evidenceReceiptRefs: [], visibility: 'customer_and_ae_only',
    }),
  })
}

function agentOptions(callAction: (
  name: string,
  args: Record<string, unknown>,
) => Promise<CustomerRequestProblemReceipt | CustomerRequestProblemStatusChange | CustomerRequestEvidenceExport>) {
  return { authenticate, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000 }
}
