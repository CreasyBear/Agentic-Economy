import type { PaginationOptions } from 'convex/server'
import { v } from 'convex/values'
import type { QueryCtx } from '../../_generated/server'
import type { JourneyEventName } from './events'

const STALLED_MIN_AGE_MS = 24 * 3600_000

export const STALLED_STEPS = {
  notFunded: { from: 'signed_up', to: 'funded' },
  noAgent: { from: 'funded', to: 'agent_connected' },
  neverCalled: { from: 'agent_connected', to: 'first_call' },
} as const satisfies Record<string, { from: JourneyEventName; to: JourneyEventName }>

export type StalledStep = keyof typeof STALLED_STEPS
export const STALLED_STEP_NAMES = Object.keys(STALLED_STEPS) as StalledStep[]
export const stalledStepValue = v.union(v.literal('notFunded'), v.literal('noAgent'), v.literal('neverCalled'))
export type StalledAccount = { accountRef: string; since: number }
export type StalledPage = { page: StalledAccount[]; isDone: boolean; continueCursor: string }

/** One oldest-first page of accounts stalled at `step`. Callers follow the cursor to the end,
 * so every stalled account is reached, not a fixed window. */
export async function readStalledPage(
  ctx: QueryCtx,
  step: StalledStep,
  now: number,
  paginationOpts: PaginationOptions,
): Promise<StalledPage> {
  const { from, to } = STALLED_STEPS[step]
  const result = await ctx.db.query('journeyEvents')
    .withIndex('by_name_and_createdAt', q => q.eq('name', from).lt('createdAt', now - STALLED_MIN_AGE_MS))
    .paginate(paginationOpts)
  const done = await Promise.all(result.page.map(row => ctx.db.query('journeyEvents')
    .withIndex('by_accountRef_and_name', q => q.eq('accountRef', row.accountRef).eq('name', to))
    .first()))
  return {
    page: result.page.filter((_, index) => done[index] === null).map(row => ({ accountRef: row.accountRef, since: row.createdAt })),
    isDone: result.isDone,
    continueCursor: result.continueCursor,
  }
}
