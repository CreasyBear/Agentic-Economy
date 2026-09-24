import type { ObjectType } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import {
  executionRefArgs,
  readExecutionAttemptsArgs,
  readExecutionAttemptArgs,
  readExecutionHistoryArgs,
  readExecutionHistoryCommandArgs,
} from './contracts'

function withoutSystemFields<Row extends { _id: string; _creationTime: number }>(
  row: Row,
): Omit<Row, '_id' | '_creationTime'> {
  const { _id, _creationTime, ...value } = row
  return value
}

function readLimit(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 0), 1_000) : 0
}

export async function readControlHandler(ctx: QueryCtx, args: ObjectType<typeof executionRefArgs>) {
  const row = await ctx.db.query('actionExecutionControls')
    .withIndex('by_executionRef', (q) => q.eq('executionRef', args.executionRef))
    .unique()
  return row === null ? null : withoutSystemFields(row)
}

export async function readAttemptsHandler(ctx: QueryCtx, args: ObjectType<typeof readExecutionAttemptsArgs>) {
  const rows = await ctx.db.query('actionExecutionAttempts')
    .withIndex('by_executionRef_and_attemptNumber', (q) => q.eq('executionRef', args.executionRef))
    .order('asc')
    .take(readLimit(args.limit))
  return rows.map(withoutSystemFields)
}

export async function readAttemptHandler(ctx: QueryCtx, args: ObjectType<typeof readExecutionAttemptArgs>) {
  const row = await ctx.db.query('actionExecutionAttempts')
    .withIndex('by_executionRef_and_attemptRef', (q) =>
      q.eq('executionRef', args.executionRef).eq('attemptRef', args.attemptRef))
    .unique()
  return row === null ? null : withoutSystemFields(row)
}

export async function readHistoryHandler(ctx: QueryCtx, args: ObjectType<typeof readExecutionHistoryArgs>) {
  const rows = await ctx.db.query('actionExecutionHistory')
    .withIndex('by_executionRef_and_executionVersion', (q) =>
      q.eq('executionRef', args.executionRef).gt('executionVersion', args.afterVersion))
    .order('asc')
    .take(readLimit(args.limit))
  return rows.map(withoutSystemFields)
}

export async function readHistoryCommandHandler(ctx: QueryCtx, args: ObjectType<typeof readExecutionHistoryCommandArgs>) {
  const row = await ctx.db.query('actionExecutionHistory')
    .withIndex('by_executionRef_and_commandId', (q) =>
      q.eq('executionRef', args.executionRef).eq('commandId', args.commandId))
    .unique()
  return row === null ? null : withoutSystemFields(row)
}
