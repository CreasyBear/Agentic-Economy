import { describe, expect, it, vi } from 'vitest'

import {
  handleAgentCustomerRequestEvidenceGet,
  handleAgentCustomerRequestProblemPost,
  handleAgentCustomerRequestProblemReplyPost,
} from '@/lib/server/customer-request-agent-api'
import type { AgentAccessPrincipal } from '@/lib/server/agent-access-auth'
import {
  handleCustomerRequestEvidenceGet,
  handleCustomerRequestProblemPost,
  handleCustomerRequestProblemReplyPost,
} from '@/lib/server/customer-request-recovery-api'
import { verifyCustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import { expectQuarantineWriteFrozen } from '../../helpers/http'
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
const resolvePrincipal = async (principal: AgentAccessPrincipal): Promise<AgentAccessPrincipal> => principal

describe('Customer Request recovery surface', () => {
  it('freezes problem reports as RFC 9457 on both human and agent HTTP entrypoints', async () => {
    const report = vi.fn()
    const callAction = vi.fn()
    const human = await handleCustomerRequestProblemPost(problemRequest(), requestRef, { report })
    const agent = await handleAgentCustomerRequestProblemPost(problemRequest(), requestRef, agentOptions(callAction))
    const humanBody = await expectQuarantineWriteFrozen(human, 'customerRequest.run')
    const agentBody = await expectQuarantineWriteFrozen(agent, 'customerRequest.run')
    expect(agentBody).toEqual(humanBody)
    expect(report).not.toHaveBeenCalled()
    expect(callAction).not.toHaveBeenCalled()
  })

  it('freezes suspected duplicate-effect reports as RFC 9457', async () => {
    const report = vi.fn()
    const callAction = vi.fn()
    const request = () => new Request('https://ae.test/problems', {
      method: 'POST',
      headers: { Authorization: 'Bearer ak_secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'report:duplicate-effect',
        category: 'duplicate_charge_or_effect',
        summary: 'I may have been charged or affected twice.',
        affectedStep: 1,
        evidenceReceiptRefs: [],
        visibility: 'share_with_affected_business',
      }),
    })
    const human = await handleCustomerRequestProblemPost(request(), requestRef, { report })
    const agent = await handleAgentCustomerRequestProblemPost(request(), requestRef, agentOptions(callAction))
    const humanBody = await expectQuarantineWriteFrozen(human, 'customerRequest.run')
    const agentBody = await expectQuarantineWriteFrozen(agent, 'customerRequest.run')
    expect(agentBody).toEqual(humanBody)
    expect(report).not.toHaveBeenCalled()
    expect(callAction).not.toHaveBeenCalled()
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

  it('freezes problem replies as RFC 9457 on both human and agent HTTP entrypoints', async () => {
    const reply = vi.fn()
    const callAction = vi.fn()
    const request = () => new Request('https://ae.test/problems/problem%3Aopaque/replies', {
      method: 'POST',
      headers: { Authorization: 'Bearer ak_secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: 1,
        idempotencyKey: 'reply:one',
        message: 'The result exceeded the confirmed maximum by 25 dollars.',
      }),
    })
    const human = await handleCustomerRequestProblemReplyPost(request(), requestRef, 'problem:opaque', { reply })
    const agent = await handleAgentCustomerRequestProblemReplyPost(
      request(),
      requestRef,
      'problem:opaque',
      agentOptions(callAction),
    )
    const humanBody = await expectQuarantineWriteFrozen(human, 'customerRequest.run')
    const agentBody = await expectQuarantineWriteFrozen(agent, 'customerRequest.run')
    expect(agentBody).toEqual(humanBody)
    expect(reply).not.toHaveBeenCalled()
    expect(callAction).not.toHaveBeenCalled()
  })

  it('freezes invalid problem reports before source', async () => {
    const report = vi.fn()
    const response = await handleCustomerRequestProblemPost(new Request('https://ae.test/problems', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: 'one', category: 'kernel_failed', summary: 'x' }),
    }), requestRef, { report })
    await expectQuarantineWriteFrozen(response, 'customerRequest.run')
    expect(report).not.toHaveBeenCalled()
  })

  it('freezes problem reports even when the source would refuse evidence selection', async () => {
    const response = await handleCustomerRequestProblemPost(problemRequest(), requestRef, {
      report: async () => ({ kind: 'refused', reason: 'evidence_not_found' }),
    })
    await expectQuarantineWriteFrozen(response, 'customerRequest.run')
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
  return { authenticate, resolvePrincipal, callAction, env: { AE_CONVEX_SERVER_FUNCTION_TOKEN: key }, now: () => 1_000 }
}
