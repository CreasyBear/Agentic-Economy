// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { internal } from './_generated/api'
import schema from './schema'
import { preparationAuthorityDigest } from '@/modules/customer-request/preparation-authority'

const modules = import.meta.glob('./**/*.ts')

describe('durable preparation disclosure authority', () => {
  it('admits exactly one concrete recipient at the final cumulative capacity', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.customerRequestPreparationAuthority.recordAuthority, {
      authority: authority(), recordedAt: 1_000,
    })

    const [courierA, courierB] = await Promise.all([
      t.mutation(internal.customerRequestPreparationAuthority.allocate, allocation('a')),
      t.mutation(internal.customerRequestPreparationAuthority.allocate, allocation('b')),
    ])

    expect([courierA, courierB].filter((result) => result.kind === 'allocated')).toHaveLength(1)
    expect([courierA, courierB].filter((result) => result.kind === 'refused')).toEqual([
      { kind: 'refused', reason: 'authority_recipient_capacity_exceeded' },
    ])
  })

  it('replays one allocation across generations without storing protected values', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.customerRequestPreparationAuthority.recordAuthority, {
      authority: authority(), recordedAt: 1_000,
    })
    const input = allocation('a')

    const first = await t.mutation(internal.customerRequestPreparationAuthority.allocate, input)
    const replay = await t.mutation(internal.customerRequestPreparationAuthority.allocate, input)
    const ledger = await t.run(async (ctx) => ({
      authorities: await ctx.db.query('customerRequestPreparationAuthorities').collect(),
      allocations: await ctx.db.query('customerRequestPreparationDisclosureAllocations').collect(),
      recipients: await ctx.db.query('customerRequestPreparationDisclosureRecipients').collect(),
      exposures: await ctx.db.query('customerRequestPreparationDisclosureExposures').collect(),
    }))

    expect(replay).toEqual(first)
    expect(ledger.allocations).toHaveLength(1)
    expect(ledger.recipients).toHaveLength(1)
    expect(ledger.exposures).toHaveLength(1)
    expect(JSON.stringify(ledger)).not.toMatch(/3000|protectedValues|resolvedInputDigest|projectionCommitment/)
    expect(ledger.authorities[0]).toMatchObject({
      verification: {
        evidenceRef: 'authority:evidence:convex:1', issuerId: 'issuer:ae',
        signerId: 'signer:trusted', keyId: 'key:trusted:1',
      },
    })
    expect(JSON.stringify(ledger.authorities)).not.toMatch(/signature:/)
  })

  it('blocks allocation after a standing permission is revoked', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.customerRequestPreparationAuthority.recordAuthority, {
      authority: authority(), recordedAt: 1_000,
    })
    await t.mutation(internal.customerRequestPreparationAuthority.recordAuthority, {
      authority: { ...authority(), status: 'revoked' }, recordedAt: 1_010,
    })

    const result = await t.mutation(internal.customerRequestPreparationAuthority.allocate, {
      ...allocation('a'), allocatedAt: 1_020,
    })

    expect(result).toEqual({ kind: 'refused', reason: 'authority_revoked' })
  })

  it('blocks release when permission is revoked after allocation', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.customerRequestPreparationAuthority.recordAuthority, {
      authority: authority(), recordedAt: 1_000,
    })
    const allocated = await t.mutation(internal.customerRequestPreparationAuthority.allocate, allocation('a'))
    if (allocated.kind !== 'allocated') throw new Error(allocated.reason)
    await t.mutation(internal.customerRequestPreparationAuthority.recordAuthority, {
      authority: { ...authority(), status: 'revoked' }, recordedAt: 1_010,
    })

    const release = await t.query(internal.customerRequestPreparationAuthority.authorizeRelease, {
      allocationId: allocated.allocationId, now: 1_020,
    })

    expect(release).toEqual({ kind: 'refused', reason: 'authority_revoked' })
  })

  it('replays a resolved allocation and conflicts on changed retry material', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.customerRequestPreparationAuthority.recordAuthority, {
      authority: authority(), recordedAt: 1_000,
    })
    const input = allocation('a')
    const first = await t.mutation(internal.customerRequestPreparationAuthority.allocate, input)
    if (first.kind !== 'allocated') throw new Error(first.reason)
    await t.mutation(internal.customerRequestPreparationAuthority.resolve, {
      allocationId: first.allocationId, disposition: 'released', resolvedAt: 1_010,
      providerEvidenceRef: 'provider:evidence:quote-1',
    })

    const replay = await t.mutation(internal.customerRequestPreparationAuthority.allocate, input)
    const changed = await t.mutation(internal.customerRequestPreparationAuthority.allocate, {
      ...input, allocationDigest: 'sha256:' + 'c'.repeat(64),
    })
    const stored = await t.query(internal.customerRequestPreparationAuthority.getAllocation, {
      allocationId: first.allocationId,
    })

    expect(replay).toEqual(first)
    expect(changed).toEqual({ kind: 'refused', reason: 'authority_allocation_conflict' })
    expect(stored).toMatchObject({ disposition: 'released', providerEvidenceRef: 'provider:evidence:quote-1' })
  })

  it('projects request disclosure history in customer language without values or schema identifiers', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.customerRequestPreparationAuthority.recordAuthority, {
      authority: authority(), recordedAt: 1_000,
    })
    const allocated = await t.mutation(internal.customerRequestPreparationAuthority.allocate, allocation('a'))
    if (allocated.kind !== 'allocated') throw new Error(allocated.reason)
    await t.mutation(internal.customerRequestPreparationAuthority.resolve, {
      allocationId: allocated.allocationId, disposition: 'released', resolvedAt: 1_010,
      providerEvidenceRef: 'provider:evidence:quote-1',
    })

    const activity = await t.query(internal.customerRequestPreparationAuthority.listRequestDisclosureActivity, {
      requestId: 'request:shipping:1', requestRevision: 1, limit: 20,
    })

    expect(activity).toEqual([{
      recipientName: 'Courier A', dataCategories: ['Destination postcode'],
      purpose: 'Compare shipping prices', status: 'released', recordedAt: 1_010,
      inspectionRef: 'preparation-allocation:a',
    }])
    expect(JSON.stringify(activity)).not.toMatch(/destinationPostcode|shipping_rate_quote|authorityDigest|3000/)
  })
})

function authority() {
  const material = {
    authorityId: 'preparation-authority:convex:1', authorityVersion: 1,
    principalId: 'principal:customer:1',
    delegatedAgentId: 'agent:customer:1', requestId: 'request:shipping:1', requestRevision: 1,
    mode: 'standing' as const,
    permittedFields: ['destinationPostcode'], permittedRecipientKinds: ['candidate_provider' as const],
    permittedRecipientBindingIds: ['binding:courier-a', 'binding:courier-b'], permittedPurposes: ['shipping_rate_quote'],
    maximumRecipients: 1, maximumExposures: 2, maximumOperations: 2, grantedAt: 900, expiresAt: 2_000,
  }
  return {
    ...material, status: 'active' as const, authorityDigest: preparationAuthorityDigest(material),
    verification: {
      evidenceRef: 'authority:evidence:convex:1', issuerId: 'issuer:ae', signerId: 'signer:trusted', keyId: 'key:trusted:1',
    },
  }
}

function allocation(suffix: 'a' | 'b') {
  return {
    authorityId: 'preparation-authority:convex:1', authorityVersion: 1,
    authorityDigest: authority().authorityDigest,
    allocationId: `preparation-allocation:${suffix}`, operationKey: `prepare:generation:${suffix}`, authorityUseKey: 'prepare:comparison:1',
    allocationDigest: 'sha256:' + suffix.repeat(64),
    requestId: 'request:shipping:1', requestRevision: 1, planRevisionId: `plan:shipping:${suffix}`,
    actionId: 'action:quote', capabilityContractId: 'shipping.rate.query:v1',
    recipient: {
      nodeId: `node:courier-${suffix}`, bindingId: `binding:courier-${suffix}`,
      name: `Courier ${suffix.toUpperCase()}`, kind: 'candidate_provider' as const,
    },
    purpose: 'shipping_rate_quote', purposeLabel: 'Compare shipping prices', fields: ['destinationPostcode'],
    fieldCategories: [{ field: 'destinationPostcode', label: 'Destination postcode' }], allocatedAt: 1_000,
  }
}
