import type { MutationCtx } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import { delegationSnapshotRef, type DelegationSnapshotRef } from '../../src/modules/authority/delegation/public'
import { accountRef, principalRef, type AccountRef, type PrincipalRef } from '../../src/modules/principal-account/public'
import {
  SecretPlaneError,
  secretGeneration,
  secretRef,
  type SecretGeneration,
  type SecretPointer,
  type SecretPointerStore,
  type SecretRef,
} from '../../src/modules/secrets/public'

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u

export type SecretPointerOperation = 'provision' | 'rotate' | 'reconcile'

export type SecretPointerAuthority = Readonly<{
  operation: SecretPointerOperation
  snapshotRef: DelegationSnapshotRef
  accountRef: AccountRef
  actorPrincipalRef: PrincipalRef
  grantRef: string
  grantGeneration: number
  correlationRef: string
  idempotencyRef: string
  occurredAt: number
}>

export function createConvexSecretPointerStore(
  ctx: MutationCtx,
  authorityInput: SecretPointerAuthority,
): SecretPointerStore {
  const authority = canonicalAuthority(authorityInput)
  if (authority.operation === 'provision') throw new SecretPlaneError('secret_pointer_advance_failed')
  return {
    getActive: async (ref) => await getPointer(ctx, ref, authority.accountRef),
    advanceActive: async (request) => {
      const canonicalRequest = {
        secretRef: secretRef(request.secretRef),
        expectedActiveGeneration: secretGeneration(request.expectedActiveGeneration),
        expectedRevision: positiveInteger(request.expectedRevision),
        newGeneration: secretGeneration(request.newGeneration),
      }
      const replay = await commandByIdempotency(ctx, authority.accountRef, authority.idempotencyRef)
      if (replay !== null) {
        if (!commandMatches(replay, authority, {
          secretRef: canonicalRequest.secretRef,
          previousGeneration: canonicalRequest.expectedActiveGeneration,
          newGeneration: canonicalRequest.newGeneration,
          previousRevision: canonicalRequest.expectedRevision,
          newRevision: canonicalRequest.expectedRevision + 1,
        })) throw new SecretPlaneError('secret_pointer_advance_failed')
        await requireCanonicalReplayPostState(ctx, replay, authority.accountRef)
        return
      }
      const document = await pointerDocument(ctx, canonicalRequest.secretRef)
      if (document === null
        || document.owningAccountRef !== authority.accountRef
        || document.activeGeneration !== canonicalRequest.expectedActiveGeneration
        || document.revision !== canonicalRequest.expectedRevision
        || authority.occurredAt < document.updatedAt
        || canonicalRequest.newGeneration === canonicalRequest.expectedActiveGeneration) {
        throw new SecretPlaneError('secret_pointer_advance_failed')
      }
      const newRevision = canonicalRequest.expectedRevision + 1
      if (await commandAtRevision(ctx, canonicalRequest.secretRef, newRevision) !== null) {
        throw new SecretPlaneError('secret_pointer_advance_failed')
      }
      const nextPointer = {
        secretRef: canonicalRequest.secretRef,
        owningAccountRef: authority.accountRef,
        activeGeneration: canonicalRequest.newGeneration,
        revision: newRevision,
        createdAt: document.createdAt,
        updatedAt: authority.occurredAt,
        lastAction: authority,
      }
      const command = {
        secretRef: canonicalRequest.secretRef,
        operation: authority.operation,
        previousGeneration: canonicalRequest.expectedActiveGeneration,
        newGeneration: canonicalRequest.newGeneration,
        previousRevision: canonicalRequest.expectedRevision,
        newRevision,
        action: authority,
      }
      // All domain validation and conflict checks complete before the CAS. The
      // following immutable command is already canonical and cannot raise a
      // later domain error that a same-mutation caller could catch.
      await ctx.db.replace(document._id, nextPointer)
      await ctx.db.insert('secretPointerCommands', command)
    },
  }
}

export async function initializeConvexSecretPointer(
  ctx: MutationCtx,
  authorityInput: SecretPointerAuthority,
  input: Readonly<{ secretRef: SecretRef; activeGeneration: SecretGeneration }>,
): Promise<SecretPointer> {
  const authority = canonicalAuthority(authorityInput)
  if (authority.operation !== 'provision') throw new SecretPlaneError('secret_pointer_advance_failed')
  const canonicalSecretRef = secretRef(input.secretRef)
  const generation = secretGeneration(input.activeGeneration)
  const replay = await commandByIdempotency(ctx, authority.accountRef, authority.idempotencyRef)
  if (replay !== null) {
    if (!commandMatches(replay, authority, {
      secretRef: canonicalSecretRef,
      newGeneration: generation,
      previousRevision: 0,
      newRevision: 1,
    })) throw new SecretPlaneError('secret_pointer_advance_failed')
    await requireCanonicalReplayPostState(ctx, replay, authority.accountRef)
    return Object.freeze({ secretRef: canonicalSecretRef, activeGeneration: generation, revision: 1 })
  }
  if (await pointerDocument(ctx, canonicalSecretRef) !== null) {
    throw new SecretPlaneError('secret_pointer_advance_failed')
  }
  if (await commandAtRevision(ctx, canonicalSecretRef, 1) !== null) {
    throw new SecretPlaneError('secret_pointer_advance_failed')
  }
  const pointer = {
    secretRef: canonicalSecretRef,
    owningAccountRef: authority.accountRef,
    activeGeneration: generation,
    revision: 1,
    createdAt: authority.occurredAt,
    updatedAt: authority.occurredAt,
    lastAction: authority,
  }
  const command = {
    secretRef: canonicalSecretRef,
    operation: 'provision' as const,
    newGeneration: generation,
    previousRevision: 0,
    newRevision: 1,
    action: authority,
  }
  await ctx.db.insert('secretPointers', pointer)
  await ctx.db.insert('secretPointerCommands', command)
  return Object.freeze({ secretRef: canonicalSecretRef, activeGeneration: generation, revision: 1 })
}

async function getPointer(
  ctx: MutationCtx,
  refInput: SecretRef,
  owningAccountRef: AccountRef,
): Promise<SecretPointer | undefined> {
  const document = await pointerDocument(ctx, secretRef(refInput))
  if (document === null) return undefined
  const latest = await commandAtRevision(ctx, secretRef(document.secretRef), document.revision)
  if (latest === null || !pointerMatchesCommand(document, latest, owningAccountRef)) {
    throw new SecretPlaneError('secret_pointer_advance_failed')
  }
  return Object.freeze({
    secretRef: secretRef(document.secretRef),
    activeGeneration: secretGeneration(document.activeGeneration),
    revision: positiveInteger(document.revision),
  })
}

async function pointerDocument(ctx: MutationCtx, ref: SecretRef) {
  return await ctx.db.query('secretPointers')
    .withIndex('by_secretRef', (query) => query.eq('secretRef', ref))
    .unique()
}

async function commandByIdempotency(ctx: MutationCtx, account: AccountRef, idempotencyRef: string) {
  return await ctx.db.query('secretPointerCommands')
    .withIndex('by_accountRef_and_idempotencyRef', (query) => query
      .eq('action.accountRef', account)
      .eq('action.idempotencyRef', idempotencyRef))
    .unique()
}

async function commandAtRevision(ctx: MutationCtx, ref: SecretRef, revision: number) {
  return await ctx.db.query('secretPointerCommands')
    .withIndex('by_secretRef_and_newRevision', (query) => query
      .eq('secretRef', ref)
      .eq('newRevision', revision))
    .unique()
}

async function requireCanonicalReplayPostState(
  ctx: MutationCtx,
  replay: Doc<'secretPointerCommands'>,
  owningAccountRef: AccountRef,
): Promise<void> {
  const pointer = await pointerDocument(ctx, secretRef(replay.secretRef))
  if (pointer === null
    || pointer.owningAccountRef !== owningAccountRef
    || pointer.revision < replay.newRevision
    || pointer.createdAt > replay.action.occurredAt
    || pointer.updatedAt < replay.action.occurredAt) {
    throw new SecretPlaneError('secret_pointer_advance_failed')
  }
  if (pointer.revision === replay.newRevision) {
    if (!pointerMatchesCommand(pointer, replay, owningAccountRef)) {
      throw new SecretPlaneError('secret_pointer_advance_failed')
    }
    return
  }
  let previousGeneration = secretGeneration(replay.newGeneration)
  let previousOccurredAt = nonnegativeInteger(replay.action.occurredAt)
  let latest: Doc<'secretPointerCommands'> = replay
  for (let revision = replay.newRevision + 1; revision <= pointer.revision; revision += 1) {
    const next = await commandAtRevision(ctx, secretRef(pointer.secretRef), revision)
    if (next === null || !commandContinuesChain(
      next,
      owningAccountRef,
      secretRef(pointer.secretRef),
      revision,
      previousGeneration,
      previousOccurredAt,
    )) {
      throw new SecretPlaneError('secret_pointer_advance_failed')
    }
    previousGeneration = secretGeneration(next.newGeneration)
    previousOccurredAt = nonnegativeInteger(next.action.occurredAt)
    latest = next
  }
  if (!pointerMatchesCommand(pointer, latest, owningAccountRef)) {
    throw new SecretPlaneError('secret_pointer_advance_failed')
  }
}

function commandContinuesChain(
  command: Doc<'secretPointerCommands'>,
  owningAccountRef: AccountRef,
  ref: SecretRef,
  revision: number,
  previousGeneration: SecretGeneration,
  previousOccurredAt: number,
): boolean {
  try {
    const nextGeneration = secretGeneration(command.newGeneration)
    return command.secretRef === ref
      && command.operation !== 'provision'
      && command.operation === command.action.operation
      && command.action.accountRef === owningAccountRef
      && command.previousRevision === revision - 1
      && command.newRevision === revision
      && command.previousGeneration !== undefined
      && secretGeneration(command.previousGeneration) === previousGeneration
      && nextGeneration !== previousGeneration
      && nonnegativeInteger(command.action.occurredAt) >= previousOccurredAt
      && authorityEqual(command.action, command.action)
  } catch {
    return false
  }
}

function pointerMatchesCommand(
  pointer: Doc<'secretPointers'>,
  command: Doc<'secretPointerCommands'>,
  owningAccountRef: AccountRef,
): boolean {
  try {
    const ref = secretRef(pointer.secretRef)
    const generation = secretGeneration(pointer.activeGeneration)
    const revision = positiveInteger(pointer.revision)
    const createdAt = nonnegativeInteger(pointer.createdAt)
    const updatedAt = nonnegativeInteger(pointer.updatedAt)
    const newRevision = positiveInteger(command.newRevision)
    const previousRevision = nonnegativeInteger(command.previousRevision)
    const newGeneration = secretGeneration(command.newGeneration)
    const isProvision = command.operation === 'provision'
    const previousGenerationValid = isProvision
      ? command.previousGeneration === undefined
      : command.previousGeneration !== undefined
        && secretGeneration(command.previousGeneration) !== newGeneration
    return pointer.owningAccountRef === owningAccountRef
      && command.action.accountRef === owningAccountRef
      && command.secretRef === ref
      && generation === newGeneration
      && revision === newRevision
      && previousRevision === newRevision - 1
      && previousGenerationValid
      && (isProvision ? newRevision === 1 && createdAt === updatedAt : newRevision > 1)
      && createdAt <= updatedAt
      && updatedAt === command.action.occurredAt
      && command.operation === command.action.operation
      && authorityEqual(pointer.lastAction, command.action)
  } catch {
    return false
  }
}

function canonicalAuthority(input: SecretPointerAuthority): SecretPointerAuthority {
  if (!['provision', 'rotate', 'reconcile'].includes(input.operation)
    || !OPAQUE_REF_PATTERN.test(input.grantRef)
    || !OPAQUE_REF_PATTERN.test(input.correlationRef)
    || !OPAQUE_REF_PATTERN.test(input.idempotencyRef)) {
    throw new SecretPlaneError('secret_pointer_advance_failed')
  }
  return Object.freeze({
    operation: input.operation,
    snapshotRef: delegationSnapshotRef(input.snapshotRef),
    accountRef: accountRef(input.accountRef),
    actorPrincipalRef: principalRef(input.actorPrincipalRef),
    grantRef: input.grantRef,
    grantGeneration: positiveInteger(input.grantGeneration),
    correlationRef: input.correlationRef,
    idempotencyRef: input.idempotencyRef,
    occurredAt: nonnegativeInteger(input.occurredAt),
  })
}

function commandMatches(
  document: Awaited<ReturnType<typeof commandByIdempotency>>,
  authority: SecretPointerAuthority,
  expected: Readonly<{
    secretRef: SecretRef
    previousGeneration?: SecretGeneration
    newGeneration: SecretGeneration
    previousRevision: number
    newRevision: number
  }>,
): boolean {
  return document !== null
    && document.secretRef === expected.secretRef
    && document.operation === authority.operation
    && document.previousGeneration === expected.previousGeneration
    && document.newGeneration === expected.newGeneration
    && document.previousRevision === expected.previousRevision
    && document.newRevision === expected.newRevision
    && authorityEqual(document.action, authority)
}

function authorityEqual(
  left: Doc<'secretPointerCommands'>['action'],
  right: Doc<'secretPointerCommands'>['action'] | SecretPointerAuthority,
): boolean {
  try {
    const canonicalLeft = canonicalAuthority({
      ...left,
      snapshotRef: delegationSnapshotRef(left.snapshotRef),
      accountRef: accountRef(left.accountRef),
      actorPrincipalRef: principalRef(left.actorPrincipalRef),
    })
    const canonicalRight = canonicalAuthority({
      ...right,
      snapshotRef: delegationSnapshotRef(right.snapshotRef),
      accountRef: accountRef(right.accountRef),
      actorPrincipalRef: principalRef(right.actorPrincipalRef),
    })
    return canonicalLeft.operation === canonicalRight.operation
      && canonicalLeft.snapshotRef === canonicalRight.snapshotRef
      && canonicalLeft.accountRef === canonicalRight.accountRef
      && canonicalLeft.actorPrincipalRef === canonicalRight.actorPrincipalRef
      && canonicalLeft.grantRef === canonicalRight.grantRef
      && canonicalLeft.grantGeneration === canonicalRight.grantGeneration
      && canonicalLeft.correlationRef === canonicalRight.correlationRef
      && canonicalLeft.idempotencyRef === canonicalRight.idempotencyRef
      && canonicalLeft.occurredAt === canonicalRight.occurredAt
  } catch {
    return false
  }
}

function positiveInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new SecretPlaneError('secret_pointer_advance_failed')
  return value
}

function nonnegativeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new SecretPlaneError('secret_pointer_advance_failed')
  return value
}
