import { vOnCompleteArgs } from '@convex-dev/workpool'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation, internalQuery, type ActionCtx } from './_generated/server'
import { degradeBackend } from '../src/lib/observability/degrade-backend'
import { singleLineText } from './lib/journey/events'
import {
  STALLED_STEP_NAMES,
  readStalledPage,
  stalledStepValue,
  type StalledAccount,
  type StalledPage,
  type StalledStep,
} from './lib/journey/stalled'
import { notificationWorkpool } from './notificationWorkpool'

const LIST_CAP = 25
const INTENT_CHARS = 140
const HOUR_MS = 3_600_000
const PAGE_SIZE = 200

const SECTIONS: ReadonlyArray<readonly [StalledStep, string]> = [
  ['notFunded', 'Signed up, not funded'],
  ['noAgent', 'Funded, no agent connected'],
  ['neverCalled', 'Connected, never called'],
]

const stalledPageValue = v.object({
  page: v.array(v.object({ accountRef: v.string(), since: v.number() })),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

export const stalledPage = internalQuery({
  args: { step: stalledStepValue, now: v.number(), paginationOpts: paginationOptsValidator },
  returns: stalledPageValue,
  handler: async (ctx, { step, now, paginationOpts }) => await readStalledPage(ctx, step, now, paginationOpts),
})

export const intents = internalQuery({
  args: { accountRefs: v.array(v.string()) },
  returns: v.array(v.object({ accountRef: v.string(), text: v.string() })),
  handler: async (ctx, { accountRefs }) => {
    const rows = await Promise.all(accountRefs.map(accountRef => ctx.db.query('accountIntents')
      .withIndex('by_accountRef', q => q.eq('accountRef', accountRef))
      .unique()))
    return rows.flatMap(row => row === null ? [] : [{ accountRef: row.accountRef, text: row.text }])
  },
})

type Stalled = Record<StalledStep, StalledAccount[]>

/** Follows every page of every step, so each count is the full stalled population. */
async function collectStalled(ctx: Pick<ActionCtx, 'runQuery'>, now: number): Promise<Stalled> {
  const stalled: Stalled = { notFunded: [], noAgent: [], neverCalled: [] }
  for (const step of STALLED_STEP_NAMES) {
    let cursor: string | null = null
    for (;;) {
      const page: StalledPage = await ctx.runQuery(internal.operatorDigest.stalledPage, {
        step, now, paginationOpts: { numItems: PAGE_SIZE, cursor },
      })
      stalled[step].push(...page.page)
      if (page.isDone) break
      cursor = page.continueCursor
    }
  }
  return stalled
}

export const OPERATOR_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Hours under two days, whole days after, so rows compare at a glance. */
function age(ms: number): string {
  const hours = Math.floor(ms / HOUR_MS)
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}

/** One row per account: identity, then age with its Sydney start date, then the quoted intent on its own line. */
export function formatDigest(stalled: Stalled, intentText: ReadonlyMap<string, string>, now: number): string {
  const lines: string[] = []
  for (const [step, title] of SECTIONS) {
    const accounts = stalled[step]
    lines.push(`${title}: ${accounts.length} total`)
    for (const { accountRef, since } of accounts.slice(0, LIST_CAP)) {
      lines.push(`- ${accountRef}, ${age(now - since)} (since ${OPERATOR_DATE.format(since)})`)
      const intent = singleLineText(intentText.get(accountRef) ?? '')
      if (intent.length > 0) {
        lines.push(`  intent: "${intent.length > INTENT_CHARS ? `${intent.slice(0, INTENT_CHARS)}...` : intent}"`)
      }
    }
    if (accounts.length > LIST_CAP) lines.push(`...and ${accounts.length - LIST_CAP} more`)
    lines.push('')
  }
  lines.push('Counts cover accounts that signed up after journey tracking started. Ages are time stalled at that step.')
  return lines.join('\n')
}

export async function buildDigest(ctx: Pick<ActionCtx, 'runQuery'>, now: number) {
  const stalled = await collectStalled(ctx, now)
  const listed = [...new Set(SECTIONS.flatMap(([step]) => stalled[step].slice(0, LIST_CAP).map(row => row.accountRef)))]
  const rows: Array<{ accountRef: string; text: string }> = listed.length === 0
    ? []
    : await ctx.runQuery(internal.operatorDigest.intents, { accountRefs: listed })
  return {
    text: formatDigest(stalled, new Map(rows.map(row => [row.accountRef, row.text])), now),
    counts: { notFunded: stalled.notFunded.length, noAgent: stalled.noAgent.length, neverCalled: stalled.neverCalled.length },
  }
}

/** Runs the send on the notification workpool so a Resend 429 or 5xx is retried; the date key dedupes. */
export const enqueue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await notificationWorkpool.enqueueAction(ctx, internal.notificationDelivery.sendOperatorDigest, {}, {
      retry: true,
      onComplete: internal.operatorDigest.completeDigest,
      context: null,
    })
    return null
  },
})

/** Reports a digest the workpool gave up on, so a sustained Resend outage still leaves a trace. */
export const completeDigest = internalMutation({
  args: vOnCompleteArgs(v.null(), v.null()),
  returns: v.null(),
  handler: async (_ctx, { result }) => {
    if (result.kind !== 'success') {
      degradeBackend(new Error(result.kind === 'failed' ? result.error : 'canceled'), undefined, {
        site: 'sendOperatorDigest',
        reason: 'source_unavailable',
      })
    }
    return null
  },
})
