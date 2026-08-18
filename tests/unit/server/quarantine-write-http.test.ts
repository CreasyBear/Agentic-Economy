import { describe, expect, it } from 'vitest'

import { handleCustomerRequestPost } from '@/lib/server/customer-request-api'
import { handleCustomerRequestEvidenceGet } from '@/lib/server/customer-request-recovery-api'
import { handleWorkTreeAgentAction } from '@/lib/server/work-tree-agent-api'
import { handleBusinessToolInvoke } from '@/lib/server/business-tool-api'
import { BUSINESS_TOOL_AGENT_SCOPE } from '@/modules/business-tools/public'
import { buildProblem } from '@/lib/errors'
import { quarantineWriteProblemInput } from '@/modules/product-frontier/quarantine-write-admission'
import { postJsonRequest } from '../../helpers/http'

async function expectFrozenWrite(response: Response, actionId: string) {
  expect(response.status).toBe(403)
  expect(response.status).not.toBe(410)
  expect(response.headers.get('content-type')).toBe('application/problem+json')
  const body: unknown = await response.json()
  expect(body).toEqual(buildProblem(quarantineWriteProblemInput(actionId)))
}

describe('quarantine family HTTP write freeze', () => {
  it('refuses Customer Request POSTs as RFC 9457 problems', async () => {
    const response = await handleCustomerRequestPost(postJsonRequest('/api/requests', {
      idempotencyKey: 'command:1', requestRef: 'request:1', agentRef: 'agent:claude', request: 'Find a suitable option',
    }), { submit: async () => { throw new Error('submit_must_not_run') } })
    await expectFrozenWrite(response, 'customerRequest.run')
  })

  it('keeps Customer Request evidence GET off the freeze path', async () => {
    const response = await handleCustomerRequestEvidenceGet(
      new Request('https://ae.example/api/requests/request:1/evidence'),
      'request:1',
      { inspect: async () => ({ kind: 'refused', reason: 'request_not_found' }) },
    )
    expect(response.status).toBe(404)
    expect(response.status).not.toBe(403)
    expect(response.status).not.toBe(410)
  })

  it('refuses WorkTree mutating POSTs and leaves inspect off the freeze', async () => {
    const create = await handleWorkTreeAgentAction(
      postJsonRequest('https://ae.example/api/v1/work-tree/create', {}),
      'create',
    )
    await expectFrozenWrite(create, 'workTree.create')
    const inspect = await handleWorkTreeAgentAction(
      postJsonRequest('https://ae.example/api/v1/work-tree/inspect', { projectId: 'project:1' }),
      'inspect',
    )
    expect(inspect.status).not.toBe(403)
  })

  it('refuses inquiry submit invoke as RFC 9457', async () => {
    const response = await handleBusinessToolInvoke(
      postJsonRequest('https://ae.example/tools/inquiry.submit/invoke', {
        body: 'Need a quote',
        expectedDigest: 'sha256:test',
      }),
      'acme',
      'inquiry.submit',
      {
        authenticate: async () => ({
          isAuthenticated: true,
          tokenType: 'api_key' as const,
          id: 'ak_test',
          subject: 'user_test',
          userId: 'user_test',
          orgId: null,
          scopes: [BUSINESS_TOOL_AGENT_SCOPE],
        }),
      },
    )
    await expectFrozenWrite(response, 'inquiry.submit')
  })
})
