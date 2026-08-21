import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'
import { encodeCapabilityContractDocument } from '@/modules/capability-contract-registry/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { capabilityContractV2 } from '../../fixtures/capability-contract-v2'
import { convexModules as modules, ownerAdmin } from '../../helpers/convex-fixtures'

describe('V2 capability contract Convex registry', () => {
  it('registers one immutable identity slot and replays exact material', async () => {
    const backend = convexTest(schema, modules)
    const owner = await ownerAdmin(backend, 'user_capability_admin')
    const documentJson = JSON.stringify(capabilityContractV2())
    const args = publicArgs(documentJson)
    const first = await owner.mutation(api.capabilityContractDocuments.register, args)
    const replay = await owner.mutation(api.capabilityContractDocuments.register, args)

    expect(first).toMatchObject({
      kind: 'registered',
      ref: { capabilityId: 'reference.lookup', version: 1, contractDigest: expect.stringMatching(/^sha256:/) },
    })
    expect(replay).toEqual(first)
    if (first.kind !== 'registered') throw new Error('capability contract registration failed')

    const persisted = await backend.run(async (ctx) => {
      const contract = await ctx.db.query('capabilityContractDocuments')
        .withIndex('by_capabilityId_and_version', (query) => (
          query.eq('capabilityId', first.ref.capabilityId).eq('version', first.ref.version)
        ))
        .unique()
      const operation = await ctx.db.query('operationKeys')
        .withIndex('by_actor_operation_key', (query) => (
          query.eq('actorRef', 'user_capability_admin')
            .eq('operationName', 'registerCapabilityContract')
            .eq('key', args.operationKey)
        ))
        .unique()
      if (operation === null) throw new Error('capability contract operation missing')
      const auditEventId = operation.effectRefs[0]
      if (auditEventId === undefined) throw new Error('capability contract audit effect missing')
      const audit = await ctx.db.query('auditEvents')
        .withIndex('by_eventId', (query) => query.eq('eventId', auditEventId))
        .unique()
      if (contract === null || audit === null) throw new Error('capability contract audit rows missing')
      return { contract, audit, operation }
    })
    const redactedPayload = {
      capabilityId: first.ref.capabilityId,
      version: first.ref.version,
      contractDigest: first.ref.contractDigest,
    }
    const targetRef = `reference.lookup@1#${first.ref.contractDigest}`
    expect(persisted.audit).toMatchObject({
      eventId: `audit:capability_contract:${canonicalDigest({
        targetType: 'capability_contract',
        targetRef,
        actorKind: 'admin',
        actorRef: 'user_capability_admin',
        operationKey: args.operationKey,
      })}`,
      eventType: 'capability_contract.registered',
      actorKind: 'admin',
      actorRef: 'user_capability_admin',
      targetType: 'capability_contract',
      targetRef,
      beforeState: 'unregistered',
      afterState: 'active',
      idempotencyKey: args.operationKey,
      correlationId: args.correlationId,
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
      redactedPayloadJson: JSON.stringify(redactedPayload),
      payloadHash: canonicalDigest(redactedPayload),
      createdAt: persisted.contract.registeredAt,
    })
    expect(JSON.parse(persisted.audit.redactedPayloadJson)).toEqual(redactedPayload)
    expect(persisted.operation).toMatchObject({
      actorKind: 'admin',
      actorRef: 'user_capability_admin',
      operationName: 'registerCapabilityContract',
      key: args.operationKey,
      status: 'succeeded',
      effectRefs: [persisted.audit.eventId],
    })
    expect(persisted.operation.effectRefs).toEqual([persisted.audit.eventId])

    const rowCounts = await backend.run(async (ctx) => ({
      contracts: await ctx.db.query('capabilityContractDocuments').take(2),
      audits: await ctx.db.query('auditEvents').take(2),
      operations: await ctx.db.query('operationKeys').take(2),
    }))
    expect(rowCounts.contracts).toHaveLength(1)
    expect(rowCounts.audits).toHaveLength(1)
    expect(rowCounts.operations).toHaveLength(1)
  })

  it('refuses changed semantics in the same ID and version slot', async () => {
    const backend = convexTest(schema, modules)
    const owner = await ownerAdmin(backend, 'user_capability_admin')
    await owner.mutation(
      api.capabilityContractDocuments.register,
      publicArgs(JSON.stringify(capabilityContractV2())),
    )

    await expect(owner.mutation(api.capabilityContractDocuments.register, {
      ...publicArgs(JSON.stringify(capabilityContractV2({ name: 'Changed semantics' }))),
      operationKey: 'op:capability-contract:register:changed',
    })).resolves.toEqual({ kind: 'refused', reason: 'contract_identity_conflict' })
    const contracts = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityContractDocuments').take(2)
    ))
    expect(contracts).toHaveLength(1)
  })

  it('resolves only an active, intact exact reference', async () => {
    const backend = convexTest(schema, modules)
    const owner = await ownerAdmin(backend, 'user_capability_admin')
    const registered = await owner.mutation(
      api.capabilityContractDocuments.register,
      publicArgs(JSON.stringify(capabilityContractV2())),
    )
    if (registered.kind !== 'registered') throw new Error('capability contract registration failed')

    await expect(backend.query(internal.capabilityContractDocuments.getActiveExactInternal, registered.ref))
      .resolves.toMatchObject({
        kind: 'found', ref: registered.ref, registeredAt: expect.any(Number),
      })
    await expect(backend.query(internal.capabilityContractDocuments.getActiveExactInternal, {
      ...registered.ref, version: 2,
    })).resolves.toEqual({
      kind: 'unavailable', reason: 'not_found',
    })
    await expect(backend.query(internal.capabilityContractDocuments.getActiveExactInternal, {
      ...registered.ref, contractDigest: `sha256:${'0'.repeat(64)}`,
    })).resolves.toEqual({ kind: 'unavailable', reason: 'not_found' })

    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityContractDocuments')
        .withIndex('by_capabilityId_and_version', (query) => (
          query.eq('capabilityId', registered.ref.capabilityId).eq('version', registered.ref.version)
        ))
        .unique()
      if (row === null) throw new Error('capability contract row missing')
      await ctx.db.patch(row._id, { documentJson: '{' })
    })
    await expect(backend.query(internal.capabilityContractDocuments.getActiveExactInternal, registered.ref))
      .resolves.toEqual({
        kind: 'unavailable', reason: 'integrity_failure',
      })
  })

  it('stores the canonical document, not caller formatting or a derived ref', async () => {
    const backend = convexTest(schema, modules)
    const owner = await ownerAdmin(backend, 'user_capability_admin')
    const input = capabilityContractV2()
    const expected = encodeCapabilityContractDocument(input)
    await owner.mutation(
      api.capabilityContractDocuments.register,
      publicArgs(JSON.stringify(input, null, 2)),
    )

    const contracts = await backend.run(async (ctx) => (
      await ctx.db.query('capabilityContractDocuments').take(2)
    ))
    expect(contracts[0]).toMatchObject({
      capabilityId: expected.contract.ref.capabilityId,
      version: expected.contract.ref.version,
      contractDigest: expected.contract.ref.contractDigest,
      documentJson: expected.documentJson,
      status: 'active',
    })
    expect(JSON.parse(String(contracts[0]?.documentJson))).not.toHaveProperty('ref')
  })

  it('requires the dedicated owner-admin authority on the public writer', async () => {
    const anonymousBackend = convexTest(schema, modules)
    await expect(anonymousBackend.mutation(
      api.capabilityContractDocuments.register,
      publicArgs(JSON.stringify(capabilityContractV2())),
    )).resolves.toEqual({
      kind: 'refused', reason: 'authorization_denied',
    })
    const anonymousRows = await anonymousBackend.run(async (ctx) => ({
      contracts: await ctx.db.query('capabilityContractDocuments').take(2),
    }))
    expect(anonymousRows.contracts).toHaveLength(0)

    const ownerBackend = convexTest(schema, modules)
    const owner = await ownerAdmin(ownerBackend, 'user_owner')
    await expect(owner.mutation(
      api.capabilityContractDocuments.register,
      publicArgs(JSON.stringify(capabilityContractV2())),
    )).resolves.toMatchObject({
      kind: 'registered', ref: { capabilityId: 'reference.lookup', version: 1 },
    })
    const ownerRows = await ownerBackend.run(async (ctx) => ({
      contracts: await ctx.db.query('capabilityContractDocuments').take(2),
      audits: await ctx.db.query('auditEvents').take(2),
      operations: await ctx.db.query('operationKeys').take(2),
    }))
    expect(ownerRows.contracts).toHaveLength(1)
    expect(ownerRows.audits[0]).toMatchObject({
      eventType: 'capability_contract.registered', actorKind: 'admin', actorRef: 'user_owner',
    })
    expect(ownerRows.operations[0]).toMatchObject({
      actorRef: 'user_owner', operationName: 'registerCapabilityContract', status: 'succeeded',
    })

    await expect(owner.mutation(
      api.capabilityContractDocuments.register,
      publicArgs(JSON.stringify(capabilityContractV2())),
    )).resolves.toMatchObject({ kind: 'registered' })
    const replayRows = await ownerBackend.run(async (ctx) => ({
      contracts: await ctx.db.query('capabilityContractDocuments').take(2),
      audits: await ctx.db.query('auditEvents').take(2),
      operations: await ctx.db.query('operationKeys').take(2),
    }))
    expect(replayRows.contracts).toHaveLength(1)
    expect(replayRows.audits).toHaveLength(1)
    expect(replayRows.operations).toHaveLength(1)
    expect(replayRows.operations[0]?.effectRefs).toHaveLength(1)

    await expect(owner.mutation(api.capabilityContractDocuments.register, {
      ...publicArgs(JSON.stringify(capabilityContractV2())),
      reasonCode: 'changed_reason_under_same_key',
    })).resolves.toEqual({ kind: 'refused', reason: 'operation_key_conflict' })

    await expect(owner.mutation(
      api.capabilityContractDocuments.register,
      publicArgs(JSON.stringify(capabilityContractV2({ capabilityId: 'reference.other' }))),
    )).resolves.toEqual({ kind: 'refused', reason: 'operation_key_conflict' })
    const finalContracts = await ownerBackend.run(async (ctx) => (
      await ctx.db.query('capabilityContractDocuments').take(2)
    ))
    expect(finalContracts).toHaveLength(1)
  })

  it('rejects oversized raw registration material before parsing it', async () => {
    const backend = convexTest(schema, modules)
    const owner = await ownerAdmin(backend, 'user_capability_admin')
    await expect(owner.mutation(
      api.capabilityContractDocuments.register,
      publicArgs(`${' '.repeat(300_001)}{}`),
    )).resolves.toEqual({ kind: 'refused', reason: 'contract_too_large' })
    const rows = await backend.run(async (ctx) => ({
      contracts: await ctx.db.query('capabilityContractDocuments').take(2),
      operations: await ctx.db.query('operationKeys').take(2),
    }))
    expect(rows.contracts).toHaveLength(0)
    expect(rows.operations).toHaveLength(0)
  })

  it('refuses incomplete audit and idempotency context before any write', async () => {
    const backend = convexTest(schema, modules)
    const owner = await ownerAdmin(backend, 'user_capability_admin')
    await expect(owner.mutation(api.capabilityContractDocuments.register, {
      ...publicArgs(JSON.stringify(capabilityContractV2())), evidenceRefs: [],
    })).resolves.toEqual({
      kind: 'refused', reason: 'registration_context_invalid',
    })
    const rows = await backend.run(async (ctx) => ({
      contracts: await ctx.db.query('capabilityContractDocuments').take(2),
      operations: await ctx.db.query('operationKeys').take(2),
      audits: await ctx.db.query('auditEvents').take(2),
    }))
    expect(rows.contracts).toHaveLength(0)
    expect(rows.operations).toHaveLength(0)
    expect(rows.audits).toHaveLength(0)
  })
})

type PublicRegistrationArgs = Readonly<{
  documentJson: string
  operationKey: string
  correlationId: string
  reasonCode: string
  evidenceRefs: string[]
}>

function publicArgs(documentJson: string): PublicRegistrationArgs {
  return {
    documentJson,
    operationKey: 'op:capability-contract:register',
    correlationId: 'corr:capability-contract:register',
    reasonCode: 'source_test_registration',
    evidenceRefs: ['test:capability-contract-registry'],
  }
}
