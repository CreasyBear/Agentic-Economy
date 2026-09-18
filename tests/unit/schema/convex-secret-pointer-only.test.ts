import { defineSchema, defineTable } from 'convex/server'
import { describe, expect, it } from 'vitest'
import { v } from 'convex/values'

import schema from '../../../convex/schema'
import {
  DELIVERY_CLAIM_TOKEN_ALLOWLIST_PATH,
  assertSecretPointerOnlySchema,
  findSecretPointerOnlyViolations,
} from '../../helpers/convex-secret-pointer-only-invariant'

describe('Convex schema secret plane pointer-only invariant', () => {
  it('allows only opaque references, hashes, digests, and generations across durable tables', () => {
    assertSecretPointerOnlySchema(schema.tables)
    expect(findSecretPointerOnlyViolations(schema.tables)).toEqual([])
  })

  it('allowlists the AE-issued OAuth delivery claim token path', () => {
    const violations = findSecretPointerOnlyViolations(schema.tables)
    expect(violations.some((violation) => violation.fieldPath === 'deliveryClaimToken')).toBe(false)
    expect(DELIVERY_CLAIM_TOKEN_ALLOWLIST_PATH).toBe('agentAccessOAuthGrants.deliveryClaimToken')
  })

  it('rejects in-memory schema definitions that persist forbidden secret field names', () => {
    const forbidden = defineSchema({
      secretLeak: defineTable({
        apiKey: v.string(),
      }),
    })
    expect(() => assertSecretPointerOnlySchema(forbidden.tables)).toThrow(
      /forbidden secret material fields.*apiKey/i,
    )
    expect(findSecretPointerOnlyViolations(forbidden.tables)).toEqual([
      {
        tableName: 'secretLeak',
        fieldPath: 'apiKey',
        fieldName: 'apiKey',
      },
    ])
  })
})
