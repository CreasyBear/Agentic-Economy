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

  it('tombstones evidence GET as RFC 9457 410 on both human and agent HTTP entrypoints', async () => {
    const inspect = vi.fn()
    const callAction = vi.fn()
    const human = await handleCustomerRequestEvidenceGet(new Request('https://ae.test/evidence'), requestRef, {
      inspect,
    })
    const agent = await handleAgentCustomerRequestEvidenceGet(
      new Request('https://ae.test/api/v1/evidence', { headers: { Authorization: 'Bearer ak_secret' } }),
      requestRef,
      agentOptions(callAction),
    )

    const humanBody = await expectQuarantineWriteFrozen(human, 'customerRequest.inspectEvidence')
    const agentBody = await expectQuarantineWriteFrozen(agent, 'customerRequest.inspectEvidence')
    expect(agentBody).toEqual(humanBody)
    expect(inspect).not.toHaveBeenCalled()
    expect(callAction).not.toHaveBeenCalled()
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
