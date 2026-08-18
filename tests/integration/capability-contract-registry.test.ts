import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { encodeCapabilityContractDocument } from '@/modules/capability-contract-registry/public'
import { capabilityContractV2 } from '../fixtures/capability-contract-v2'
import { convexModules as modules, ownerAdmin } from '../helpers/convex-fixtures'
import { canonicalDigest } from '@/modules/common/canonical-digest'

describe('durable V2 capability contract registry', () => {
  it('persists, audits, replays and resolves one exact immutable contract', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_admin')
    const documentJson = JSON.stringify(capabilityContractV2())
    const args = registrationArgs(documentJson)

    const first = await admin.mutation(api.capabilityContractDocuments.register, args)
    const replay = await admin.mutation(api.capabilityContractDocuments.register, args)

    expect(first).toMatchObject({
      kind: 'registered',
      ref: { capabilityId: 'reference.lookup', version: 1, contractDigest: expect.stringMatching(/^sha256:/) },
    })
    expect(replay).toEqual(first)
    if (first.kind !== 'registered') throw new Error('capability contract registration failed')

    await expect(backend.query(internal.capabilityContractDocuments.getActiveExactInternal, first.ref))
      .resolves.toMatchObject({ kind: 'found', ref: first.ref, registeredAt: expect.any(Number) })

    const persisted = await backend.run(async (ctx) => ({
      contracts: await ctx.db.query('capabilityContractDocuments').collect(),
      audits: []
    }))
    expect(persisted.contracts).toHaveLength(1)
    expect(JSON.parse(persisted.contracts[0]?.documentJson ?? '{}')).not.toHaveProperty('ref')
    expect(persisted.audits).toMatchObject([{
      eventType: 'capability_contract.registered',
      actorKind: 'admin',
      actorRef: 'user_capability_admin',
      targetType: 'capability_contract',
      idempotencyKey: 'op:capability-contract:register',
      correlationId: 'corr:capability-contract:register',
    }])
  })

  it('refuses a semantic change in the same slot and fails closed on stored corruption', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_admin')
    const first = await admin.mutation(
      api.capabilityContractDocuments.register,
      registrationArgs(JSON.stringify(capabilityContractV2())),
    )
    if (first.kind !== 'registered') throw new Error('capability contract registration failed')

    const changedArgs = {
      ...registrationArgs(JSON.stringify(capabilityContractV2({ description: 'Changed after registration.' }))),
      operationKey: 'op:capability-contract:register:changed',
    }
    await expect(admin.mutation(api.capabilityContractDocuments.register, changedArgs))
      .resolves.toEqual({ kind: 'refused', reason: 'contract_identity_conflict' })
    await expect(admin.mutation(api.capabilityContractDocuments.register, changedArgs))
      .resolves.toEqual({ kind: 'refused', reason: 'contract_identity_conflict' })

    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityContractDocuments')
        .withIndex('by_capabilityId_and_version', (query) => (
          query.eq('capabilityId', first.ref.capabilityId).eq('version', first.ref.version)
        ))
        .unique()
      if (row === null) throw new Error('capability contract row missing')
      await ctx.db.patch(row._id, { documentJson: '{' })
    })

    await expect(backend.query(internal.capabilityContractDocuments.getActiveExactInternal, first.ref))
      .resolves.toEqual({ kind: 'unavailable', reason: 'integrity_failure' })
  })

  it('rolls back registration when the deterministic audit slot is forged', async () => {
    const backend = convexTest(schema, modules)
    const admin = await ownerAdmin(backend, 'user_capability_admin')
    const encoded = encodeCapabilityContractDocument(capabilityContractV2())
    await backend.run(async (ctx) => {
      undefined
    })

    await expect(admin.mutation(
      api.capabilityContractDocuments.register,
      registrationArgs(JSON.stringify(capabilityContractV2())),
    )).rejects.toThrowError('capability_contract_audit_integrity_failure')

    const persisted = await backend.run(async (ctx) => ({
      contracts: await ctx.db.query('capabilityContractDocuments').collect(),
      operations: await ctx.db.query('operationKeys').collect(),
    }))
    expect(persisted).toEqual({ contracts: [], operations: [] })
  })
})

function registrationArgs(documentJson: string) {
  return {
    documentJson,
    operationKey: 'op:capability-contract:register',
    correlationId: 'corr:capability-contract:register',
    reasonCode: 'source_test_registration',
    evidenceRefs: ['test:capability-contract-registry'],
  }
}

