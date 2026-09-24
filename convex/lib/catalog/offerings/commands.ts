import type { MutationCtx } from '../../../_generated/server'
import type { Id } from '../../../_generated/dataModel'
import { brandNonEmpty } from '../../../../src/modules/common/ids'
import {
  createOfferingInState,
  reviseOfferingInState,
  upsertAccessPathInState,
  withdrawAccessPathInState,
  type OfferingAccessPathDescriptor,
  type OfferingFactsInput,
} from '../../../../src/modules/catalog/public'
import { runOfferingSourceMutation, runSystemOfferingSourceCommand, type OfferingSourceMutationArgs } from './sourceCommand'

type CreateBusinessOfferingArgs = OfferingSourceMutationArgs & { offeringRef: string; facts: OfferingFactsInput }

export async function reviseBusinessOfferingCommand(
  ctx: MutationCtx,
  command: Readonly<{
    businessId: Id<'businesses'>
    offeringRef: string
    expectedRevision: number
    operationKey: string
    facts: OfferingFactsInput
  }>,
  now: number,
) {
  return runSystemOfferingSourceCommand(ctx, { ...command, operationName: 'reviseOffering' }, { offeringRef: command.offeringRef }, (state, authority) => reviseOfferingInState(state, {
    authority,
    operationKey: command.operationKey,
    offeringRef: brandNonEmpty(command.offeringRef, 'OfferingRef'),
    expectedRevision: command.expectedRevision,
    facts: command.facts,
    now,
  }), now)
}
export async function upsertOfferingAccessPathCommand(
  ctx: MutationCtx,
  command: Readonly<{
    businessId: Id<'businesses'>
    offeringRef: string
    accessPathRef: string
    expectedRevision: number
    operationKey: string
    descriptor: OfferingAccessPathDescriptor
  }>,
  now: number,
) {
  return runSystemOfferingSourceCommand(ctx, { ...command, operationName: 'upsertAccessPath' }, { offeringRef: command.offeringRef }, (state, authority) => upsertAccessPathInState(state, {
    authority,
    operationKey: command.operationKey,
    offeringRef: brandNonEmpty(command.offeringRef, 'OfferingRef'),
    accessPathRef: brandNonEmpty(command.accessPathRef, 'AccessPathRef'),
    expectedRevision: command.expectedRevision,
    status: 'published',
    descriptor: command.descriptor,
    now,
  }), now)
}
export async function withdrawOfferingAccessPathCommand(
  ctx: MutationCtx,
  command: Readonly<{
    businessId: Id<'businesses'>
    accessPathRef: string
    expectedRevision: number
    operationKey: string
  }>,
  now: number,
) {
  return runSystemOfferingSourceCommand(ctx, { ...command, operationName: 'withdrawAccessPath' }, { accessPathRef: command.accessPathRef }, (state, authority) => (
    withdrawAccessPathInState(state, {
      authority,
      operationKey: command.operationKey,
      accessPathRef: brandNonEmpty(command.accessPathRef, 'AccessPathRef'),
      expectedRevision: command.expectedRevision,
      now,
    })
  ), now)
}

export async function createBusinessOfferingHandler(ctx: MutationCtx, args: CreateBusinessOfferingArgs) {
  return runOfferingSourceMutation(ctx, args, 'createOffering', { offeringRef: args.offeringRef }, (state, authority, now) => createOfferingInState(state, {
    authority,
    operationKey: args.operationKey,
    businessId: brandNonEmpty(args.businessId, 'BusinessId'),
    offeringRef: brandNonEmpty(args.offeringRef, 'OfferingRef'),
    facts: args.facts,
    now,
  }))
}

