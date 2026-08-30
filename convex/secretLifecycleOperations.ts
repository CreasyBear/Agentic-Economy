import { v } from 'convex/values'

import { accountRef, principalRef } from '../src/modules/principal-account/public'
import { delegationSnapshotRef } from '../src/modules/authority/delegation/public'
import {
  secretGeneration,
  secretRef,
  type SecretLifecycleRecord,
  secretLifecycleRecordValue,
  secretLifecycleStateValue,
  secretPointerAuthorityValue,
} from '../src/modules/secrets/convex'
import { internalMutation, type MutationCtx } from './_generated/server'
import { createConvexSecretLifecyclePersistence } from './lib/secretLifecyclePersistence'
import type { SecretPointerAuthority } from './lib/secretPointerPersistence'

const pointerValue = v.object({
  secretRef: v.string(),
  activeGeneration: v.string(),
  revision: v.number(),
})

const authorityArgs = { authority: secretPointerAuthorityValue } as const

export const readLifecycleJournal = internalMutation({
  args: { ...authorityArgs, idempotencyRef: v.string() },
  returns: v.union(secretLifecycleRecordValue, v.null()),
  handler: async (ctx, args) => {
    const record = await persistence(ctx, args.authority).journal.getByIdempotency(args.idempotencyRef)
    return record ?? null
  },
})

export const insertLifecyclePrepared = internalMutation({
  args: { ...authorityArgs, record: secretLifecycleRecordValue },
  returns: v.null(),
  handler: async (ctx, args) => {
    await persistence(ctx, args.authority).journal.insertPrepared(record(args.record))
    return null
  },
})

export const replaceLifecycleJournal = internalMutation({
  args: {
    ...authorityArgs,
    record: secretLifecycleRecordValue,
    expectedState: secretLifecycleStateValue,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await persistence(ctx, args.authority).journal.replace(record(args.record), args.expectedState)
    return null
  },
})

export const readSecretPointer = internalMutation({
  args: { ...authorityArgs, secretRef: v.string() },
  returns: v.union(pointerValue, v.null()),
  handler: async (ctx, args) =>
    await persistence(ctx, args.authority).pointerControl.getActive(secretRef(args.secretRef)) ?? null,
})

export const initializeSecretPointer = internalMutation({
  args: {
    ...authorityArgs,
    secretRef: v.string(),
    activeGeneration: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await persistence(ctx, args.authority).pointerControl.initializeActive({
      secretRef: secretRef(args.secretRef),
      generation: secretGeneration(args.activeGeneration),
    })
    return null
  },
})

export const advanceSecretPointer = internalMutation({
  args: {
    ...authorityArgs,
    secretRef: v.string(),
    expectedActiveGeneration: v.string(),
    expectedRevision: v.number(),
    newGeneration: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await persistence(ctx, args.authority).pointerControl.advanceActive({
      secretRef: secretRef(args.secretRef),
      expectedActiveGeneration: secretGeneration(args.expectedActiveGeneration),
      expectedRevision: args.expectedRevision,
      newGeneration: secretGeneration(args.newGeneration),
    })
    return null
  },
})

function persistence(ctx: MutationCtx, input: typeof secretPointerAuthorityValue.type) {
  return createConvexSecretLifecyclePersistence(ctx, authority(input))
}

function authority(input: typeof secretPointerAuthorityValue.type): SecretPointerAuthority {
  return Object.freeze({
    ...input,
    snapshotRef: delegationSnapshotRef(input.snapshotRef),
    accountRef: accountRef(input.accountRef),
    actorPrincipalRef: principalRef(input.actorPrincipalRef),
  })
}

function record(input: typeof secretLifecycleRecordValue.type): SecretLifecycleRecord {
  const { previousGeneration, ...required } = input
  return Object.freeze({
    ...required,
    secretRef: secretRef(input.secretRef),
    targetGeneration: secretGeneration(input.targetGeneration),
    ...(previousGeneration === undefined
      ? {}
      : { previousGeneration: secretGeneration(previousGeneration) }),
  })
}
