import { describe, expect, it } from 'vitest'

import {
  authenticateHostedPaidOperationAgent,
  PAID_OPERATION_AGENT_SCOPE,
} from '@/lib/server/hosted-paid-operation-agent-auth'

describe('hosted paid-operation agent authentication', () => {
  it('derives a least-privilege actor from the current key and rejects revocation and scope overreach', async () => {
    const authenticate = async () => ({
      isAuthenticated: true,
      tokenType: 'api_key' as const,
      id: 'key:paid',
      subject: 'principal:paid',
      scopes: [PAID_OPERATION_AGENT_SCOPE],
      userId: 'owner:paid',
    })
    const admitted = await authenticateHostedPaidOperationAgent({
      authenticate,
      verifyKeyState: async () => ({
        id: 'key:paid',
        subject: 'principal:paid',
        revoked: false,
        expired: false,
        scopes: [PAID_OPERATION_AGENT_SCOPE],
      }),
    })
    expect(admitted).toEqual({
      kind: 'authenticated',
      principal: {
        actor: {
          callerRef: 'clerk_api_key:key:paid',
          principalRef: 'owner:paid',
        },
        credentialId: 'key:paid',
        scopes: [PAID_OPERATION_AGENT_SCOPE],
      },
    })
    expect(admitted).not.toHaveProperty('authority')

    await expect(authenticateHostedPaidOperationAgent({
      authenticate,
      verifyKeyState: async () => ({
        id: 'key:paid',
        subject: 'principal:paid',
        revoked: true,
        expired: false,
        scopes: [PAID_OPERATION_AGENT_SCOPE],
      }),
    })).resolves.toEqual({
      kind: 'refused',
      status: 401,
      reason: 'authentication_required',
    })

    await expect(authenticateHostedPaidOperationAgent({
      authenticate: async () => ({
        ...(await authenticate()),
        scopes: ['customer_request:write'],
      }),
    })).resolves.toEqual({
      kind: 'refused',
      status: 403,
      reason: 'scope_required',
    })
  })
})
