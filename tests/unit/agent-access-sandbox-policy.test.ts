import { describe, expect, it } from 'vitest'

import {
  createAgentAccessGrant,
  evaluateAgentAccessOperation,
} from '../../src/modules/agent-access/policy'
import { defaultSandboxAgentAccessPolicy } from '../../src/modules/agent-access/sandbox-policy'

const timezonePrice = { currency: 'USD', units: '1', exponent: 3 } as const

describe('sandbox agent access policy', () => {
  it('admits the pinned timezone x402 price under the labelled sandbox ceiling', () => {
    const policy = defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 })
    const created = createAgentAccessGrant({
      grantRef: 'grant-sandbox',
      principalId: 'principal-1',
      ownerId: 'owner-1',
      applicationRef: 'app-1',
      credentialId: 'credential-1',
      environment: 'sandbox',
      operationAccess: 'all_admitted',
      authorityMode: 'bounded_mandate',
      policy,
      lifecycle: 'active',
      generation: 1,
      createdAt: 1,
      updatedAt: 1,
      expiresAt: 10_000,
    })
    if (created.kind !== 'accepted') throw new Error(created.code)
    expect(evaluateAgentAccessOperation({
      grant: created.grant,
      principal: { principalId: 'principal-1', applicationRef: 'app-1', environment: 'sandbox' },
      operation: { operationRef: 'timezone-convert-x402', spend: timezonePrice },
      now: 100,
    })).toEqual({ kind: 'accepted', grantRef: 'grant-sandbox', generation: 1 })
  })
})
