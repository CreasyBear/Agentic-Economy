/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { convexTest, type TestConvex } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const repeatApi = anyApi.workTreeRepeatLedger
if (repeatApi === undefined) throw new Error('work_tree_repeat_ledger_api_missing')

function requireBinding<T>(binding: T | undefined, message: string): T {
  if (binding === undefined) throw new Error(message)
  return binding
}

const reserveRepeatUse = requireBinding(repeatApi.reserveRepeatUse, 'work_tree_repeat_reserve_missing')
const finalizeRepeatUse = requireBinding(repeatApi.finalizeRepeatUse, 'work_tree_repeat_finalize_missing')
const reconcileRepeatUse = requireBinding(repeatApi.reconcileRepeatUse, 'work_tree_repeat_reconcile_missing')
const inspectRepeatUse = requireBinding(repeatApi.inspectRepeatUse, 'work_tree_repeat_inspect_missing')

const ownerIdentity = {
  subject: 'owner:repeat-ledger',
  issuer: 'https://identity.example',
  tokenIdentifier: 'credential:repeat-agent',
}
const delegatedIdentity = {
  subject: ownerIdentity.subject,
  issuer: ownerIdentity.issuer,
  tokenIdentifier: 'credential:delegated-agent',
}

const baseTree = {
  projectId: 'project:repeat-ledger',
  treeId: 'tree:repeat-ledger',
  principalId: ownerIdentity.tokenIdentifier,
  ownerId: ownerIdentity.subject,
  lineageJson: JSON.stringify({ kind: 'standalone' }),
  lineageDigest: 'digest:lineage',
  createIdempotencyKey: 'create:repeat-ledger',
  createPayloadDigest: 'digest:create',
  creationOperationKey: 'work-tree:create:repeat-ledger',
  generation: 1,
  revision: 1,
  snapshotJson: JSON.stringify({
    format: 'ae.work-tree:v1',
    treeId: 'tree:repeat-ledger',
    projectId: 'project:repeat-ledger',
    generation: 1,
    revision: 1,
    charterText: 'Repeat ledger fixture',
    nodes: [],
  }),
  snapshotDigest: 'digest:snapshot',
  createdAt: 1_000,
  updatedAt: 1_000,
}

const permission = {
  permissionRef: 'repeat-permission:fixture',
  permissionDigest: 'digest:repeat-permission',
  projectId: baseTree.projectId,
  treeId: baseTree.treeId,
  ownerId: baseTree.ownerId,
  principalId: baseTree.principalId,
  nodeId: 'decision:repeat',
  generation: 1,
  revision: 1,
  proposalDigest: 'digest:proposal',
  delegatedCredentialId: ownerIdentity.tokenIdentifier,
  validFrom: 0,
  validUntil: 9_999_999_999_999,
  perUseSpendCurrency: 'AUD',
  perUseSpendMinor: 500,
  cumulativeSpendCurrency: 'AUD',
  cumulativeSpendMinor: 500,
  occurrenceLimit: 1,
  perUseDataAllocations: 2,
  cumulativeDataAllocations: 2,
  reservedDataAllocations: 0,
  settledDataAllocations: 0,
  reservedOccurrences: 0,
  settledOccurrences: 0,
  reservedSpendMinor: 0,
  settledSpendMinor: 0,
  status: 'active' as const,
  issuedAt: 1_000,
  sourceReceiptId: 'decision:fixture',
}

async function seededBackend(): Promise<TestConvex<typeof schema>> {
  const backend = convexTest(schema, modules)
  await backend.run(async (ctx) => {
    await ctx.db.insert('workTrees', baseTree)
    await ctx.db.insert('workTreeRepeatPermissions', permission)
  })
  return backend
}

const reserveArgs = (operationKey: string, amountMinor = 0) => ({
  projectId: baseTree.projectId,
  permissionRef: permission.permissionRef,
  operationKey,
  requestedOccurrences: 1,
  requestedSpend: { currency: 'AUD', amountMinor },
  requestedDataAllocations: 1,
})

describe('WorkTree repeat-use reservation ledger', () => {
  it('linearizes exact reservations, replays, conflicts, and persists one logical use', async () => {
    const backend = await seededBackend()
    const owner = backend.withIdentity(ownerIdentity)

    const results = await Promise.all([
      owner.mutation(reserveRepeatUse, reserveArgs('reserve:race:a')),
      owner.mutation(reserveRepeatUse, reserveArgs('reserve:race:b')),
    ])

    expect(results.filter((result) => result.kind === 'accepted')).toHaveLength(1)
    expect(results.filter((result) => result.kind === 'refused')).toEqual([
      expect.objectContaining({ kind: 'refused', reason: 'limit_exceeded' }),
    ])

    const accepted = results.find((result) => result.kind === 'accepted')
    if (accepted === undefined || !('useRef' in accepted)) throw new Error('repeat reservation was not accepted')

    await expect(owner.mutation(reserveRepeatUse, reserveArgs('reserve:race:a'))).resolves.toMatchObject({
      kind: 'replayed',
      useRef: accepted.useRef,
    })
    await expect(owner.mutation(reserveRepeatUse, reserveArgs('reserve:race:a', 300))).resolves.toMatchObject({
      kind: 'conflict',
    })

    const inspected = await owner.query(inspectRepeatUse, { useRef: accepted.useRef })
    expect(inspected).toMatchObject({
      kind: 'accepted',
      use: {
        state: 'reserved',
        reservedSpend: { currency: 'AUD', amountMinor: 0 },
      },
      permission: {
        reservedOccurrences: 1,
        reservedSpend: { currency: 'AUD', amountMinor: 0 },
      },
    })
  })
  it('enforces the cumulative data cap independently of the occurrence cap', async () => {
    const backend = await seededBackend()
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('workTreeRepeatPermissions')
        .withIndex('by_permissionRef', (query) => query.eq('permissionRef', permission.permissionRef))
        .unique()
      if (row === null) throw new Error('permission fixture missing')
      await ctx.db.patch(row._id, {
        occurrenceLimit: 2,
        perUseDataAllocations: 1,
        cumulativeDataAllocations: 1,
      })
    })
    const owner = backend.withIdentity(ownerIdentity)
    await expect(owner.mutation(reserveRepeatUse, reserveArgs('reserve:data:first'))).resolves.toMatchObject({
      kind: 'accepted',
      reservedDataAllocations: 1,
    })
    await expect(owner.mutation(reserveRepeatUse, reserveArgs('reserve:data:second'))).resolves.toMatchObject({
      kind: 'refused',
      reason: 'limit_exceeded',
    })
    const permissionState = await owner.query(inspectRepeatUse, { useRef: 'use:missing' })
    expect(permissionState).toMatchObject({ kind: 'refused', reason: 'not_found' })
  })
  it('authorizes the delegated credential by owner and attributes the agent principal', async () => {
    const backend = await seededBackend()
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('workTreeRepeatPermissions')
        .withIndex('by_permissionRef', (query) => query.eq('permissionRef', permission.permissionRef))
        .unique()
      if (row === null) throw new Error('permission fixture missing')
      await ctx.db.patch(row._id, { delegatedCredentialId: delegatedIdentity.tokenIdentifier })
    })
    const agent = backend.withIdentity(delegatedIdentity)
    const reserved = await agent.mutation(reserveRepeatUse, reserveArgs('reserve:delegated'))
    expect(reserved).toMatchObject({ kind: 'accepted', reservedDataAllocations: 1 })
    if (reserved.kind !== 'accepted') throw new Error('delegated reservation refused')
    await expect(agent.query(inspectRepeatUse, { useRef: reserved.useRef })).resolves.toMatchObject({
      kind: 'accepted',
      use: {
        principalId: delegatedIdentity.tokenIdentifier,
        delegatedCredentialId: delegatedIdentity.tokenIdentifier,
      },
    })
  })

  it('settles and releases unused spend, holds unknown outcomes, and reconciles explicitly', async () => {
    const backend = await seededBackend()
    const owner = backend.withIdentity(ownerIdentity)
    const reserved = await owner.mutation(reserveRepeatUse, reserveArgs('reserve:settle'))
    if (reserved.kind !== 'accepted') throw new Error('settlement reservation refused')

    const finalized = await owner.mutation(finalizeRepeatUse, {
      useRef: reserved.useRef,
      operationKey: 'finalize:settle',
      actualOccurrences: 1,
      actualSpend: { currency: 'AUD', amountMinor: 0 },
      actualDataAllocations: 0,
      outcome: 'settled',
    })
    expect(finalized).toMatchObject({
      kind: 'accepted',
      state: 'settled',
      operationKey: 'finalize:settle',
      releasedSpendMinor: 0,
      releasedDataAllocations: 1,
    })
    await expect(owner.mutation(finalizeRepeatUse, {
      useRef: reserved.useRef,
      operationKey: 'finalize:settle',
      actualOccurrences: 1,
      actualSpend: { currency: 'AUD', amountMinor: 0 },
      actualDataAllocations: 0,
      outcome: 'settled',
    })).resolves.toEqual({ ...finalized, kind: 'replayed' })
    await expect(owner.mutation(reserveRepeatUse, reserveArgs('reserve:settle'))).resolves.toEqual({
      ...reserved,
      kind: 'replayed',
    })
    await expect(owner.mutation(finalizeRepeatUse, {
      useRef: reserved.useRef,
      operationKey: 'finalize:changed',
      actualOccurrences: 1,
      actualSpend: { currency: 'AUD', amountMinor: 0 },
      actualDataAllocations: 0,
      outcome: 'settled',
    })).resolves.toMatchObject({ kind: 'conflict', operationKey: 'finalize:changed', useRef: reserved.useRef })

    const settled = await owner.query(inspectRepeatUse, { useRef: reserved.useRef })
    expect(settled).toMatchObject({
      use: {
        state: 'settled',
        actualSpend: { currency: 'AUD', amountMinor: 0 },
        actualDataAllocations: 0,
        reservedSpend: { currency: 'AUD', amountMinor: 0 },
        reservedDataAllocations: 0,
      },
      permission: {
        reservedSpend: { currency: 'AUD', amountMinor: 0 },
        settledSpend: { currency: 'AUD', amountMinor: 0 },
        reservedDataAllocations: 0,
        settledDataAllocations: 0,
      },
    })

    const unknownBackend = await seededBackend()
    const unknownOwner = unknownBackend.withIdentity(ownerIdentity)
    const unknown = await unknownOwner.mutation(reserveRepeatUse, reserveArgs('reserve:unknown'))
    if (unknown.kind !== 'accepted') throw new Error('unknown reservation refused')
    const unknownFinalized = await unknownOwner.mutation(finalizeRepeatUse, {
      useRef: unknown.useRef,
      operationKey: 'finalize:unknown',
      actualOccurrences: 1,
      outcome: 'unknown',
    })
    expect(unknownFinalized).toMatchObject({
      kind: 'unknown',
      operationKey: 'finalize:unknown',
      state: 'unknown',
      heldSpendMinor: 0,
      heldDataAllocations: 1,
    })
    await expect(unknownOwner.mutation(reconcileRepeatUse, {
      useRef: unknown.useRef,
      operationKey: 'reconcile:not-settled-nonzero',
      actualOccurrences: 1,
      actualSpend: { currency: 'AUD', amountMinor: 0 },
      actualDataAllocations: 0,
      outcome: 'not_settled',
    })).resolves.toMatchObject({ kind: 'refused', reason: 'invalid_request', useRef: unknown.useRef })
    await expect(unknownOwner.query(inspectRepeatUse, { useRef: unknown.useRef })).resolves.toMatchObject({
      use: {
        state: 'unknown',
        reservedSpend: { currency: 'AUD', amountMinor: 0 },
        reservedDataAllocations: 1,
      },
      permission: {
        reservedSpend: { currency: 'AUD', amountMinor: 0 },
        reservedDataAllocations: 1,
      },
    })
    const reconciled = await unknownOwner.mutation(reconcileRepeatUse, {
      useRef: unknown.useRef,
      operationKey: 'reconcile:unknown',
      actualOccurrences: 1,
      actualSpend: { currency: 'AUD', amountMinor: 0 },
      actualDataAllocations: 0,
      outcome: 'settled',
    })
    expect(reconciled).toMatchObject({
      kind: 'accepted',
      state: 'settled',
      operationKey: 'reconcile:unknown',
      reconcileOperationKey: 'reconcile:unknown',
      releasedSpendMinor: 0,
      releasedDataAllocations: 1,
    })
    await expect(unknownOwner.mutation(reconcileRepeatUse, {
      useRef: unknown.useRef,
      operationKey: 'reconcile:unknown',
      actualOccurrences: 1,
      actualSpend: { currency: 'AUD', amountMinor: 0 },
      actualDataAllocations: 0,
      outcome: 'settled',
    })).resolves.toEqual({ ...reconciled, kind: 'replayed' })
    await expect(unknownOwner.mutation(finalizeRepeatUse, {
      useRef: unknown.useRef,
      operationKey: 'finalize:unknown',
      actualOccurrences: 1,
      outcome: 'unknown',
    })).resolves.toEqual({ ...unknownFinalized, kind: 'replayed' })
    await expect(unknownOwner.mutation(reserveRepeatUse, reserveArgs('reserve:unknown'))).resolves.toEqual({
      ...unknown,
      kind: 'replayed',
    })
    await expect(unknownOwner.mutation(reconcileRepeatUse, {
      useRef: unknown.useRef,
      operationKey: 'reconcile:changed',
      actualOccurrences: 1,
      actualSpend: { currency: 'AUD', amountMinor: 0 },
      actualDataAllocations: 0,
      outcome: 'settled',
    })).resolves.toMatchObject({ kind: 'conflict', operationKey: 'reconcile:changed', useRef: unknown.useRef })
  })

  it('refuses cap overflow before effect and paid calls while T52 is closed', async () => {
    const backend = await seededBackend()
    const owner = backend.withIdentity(ownerIdentity)

    await expect(owner.mutation(reserveRepeatUse, reserveArgs('reserve:too-much', 600))).resolves.toMatchObject({
      kind: 'refused',
      reason: 'limit_exceeded',
    })
    await expect(owner.mutation(reserveRepeatUse, reserveArgs('reserve:paid', 400))).resolves.toMatchObject({
      kind: 'refused',
      reason: 'live_money_gate_open',
    })
    await expect(owner.query(inspectRepeatUse, { useRef: 'use:missing' })).resolves.toMatchObject({
      kind: 'refused',
      reason: 'not_found',
    })
  })
})
