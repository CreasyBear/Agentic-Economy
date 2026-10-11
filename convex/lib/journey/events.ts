import { JourneyEventNameValues } from '@/modules/observability/schema'
import { internal } from '../../_generated/api'
import type { MutationCtx } from '../../_generated/server'

export type JourneyEventName = (typeof JourneyEventNameValues)[number]
type JourneyCtx = Pick<MutationCtx, 'db' | 'scheduler'>

/** Owner free text collapsed to one control-free line, so it cannot add lines to a plain-text email. */
export function singleLineText(text: string): string {
  return text.replace(/[\s\p{Cc}]+/gu, ' ').trim()
}

async function accountEvent(ctx: JourneyCtx, accountRef: string, name: JourneyEventName) {
  return await ctx.db.query('journeyEvents')
    .withIndex('by_accountRef_and_name', q => q.eq('accountRef', accountRef).eq('name', name))
    .first()
}

const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000

/** Writes one journey milestone. Returns false when the event already exists. */
export async function emitJourneyEvent(
  ctx: JourneyCtx,
  accountRef: string,
  name: JourneyEventName,
  opts: { key?: string; props?: Record<string, number | string> } = {},
): Promise<boolean> {
  const eventKey = opts.key === undefined ? `${accountRef}:${name}` : `${accountRef}:${name}:${opts.key}`
  const existing = await ctx.db.query('journeyEvents')
    .withIndex('by_eventKey', q => q.eq('eventKey', eventKey))
    .unique()
  if (existing !== null) return false
  const createdAt = Date.now()
  const props: Record<string, number | string> = { ...opts.props }
  const account = await ctx.db.query('accounts').withIndex('by_accountRef', q => q.eq('accountRef', accountRef)).unique()
  const touch = account?.firstTouch
  if (touch !== undefined) {
    if (touch.source !== undefined) props.first_source = touch.source
    if (touch.medium !== undefined) props.first_medium = touch.medium
    if (touch.campaign !== undefined) props.first_campaign = touch.campaign
  }
  const signedUp = await accountEvent(ctx, accountRef, 'signed_up')
  props.isNewAccount = name === 'signed_up' || (signedUp !== null && createdAt - signedUp.createdAt < NEW_ACCOUNT_MS) ? 'true' : 'false'
  if (name === 'activated' && signedUp !== null) props.msSinceSignup = createdAt - signedUp.createdAt
  if (name === 'retained_w1') {
    const activated = await accountEvent(ctx, accountRef, 'activated')
    if (activated !== null) props.msSinceActivated = createdAt - activated.createdAt
  }
  const eventId = await ctx.db.insert('journeyEvents', {
    accountRef,
    name,
    eventKey,
    createdAt,
    ...(Object.keys(props).length === 0 ? {} : { props }),
  })
  await ctx.scheduler.runAfter(0, internal.journeyEvents.forward, { eventId })
  return true
}

/** The first credited funding is `funded`; every later one is `topped_up`, keyed by its funding ref. */
export async function emitFundingJourneyEvent(ctx: JourneyCtx, accountRef: string, fundingRef: string, fundingSource?: string): Promise<void> {
  const props = fundingSource === undefined ? {} : { props: { funding_source: fundingSource } }
  if (await emitJourneyEvent(ctx, accountRef, 'funded', props)) return
  await emitJourneyEvent(ctx, accountRef, 'topped_up', { key: fundingRef, ...props })
}

const ERASE_BATCH = 500

/** Account close deletes the account's milestones and intent answer (APP 11.2). One batch per
 * transaction; a full batch schedules the next, so a heavy account is erased to the last row. */
export async function eraseAccountJourney(ctx: JourneyCtx, accountRef: string): Promise<void> {
  const intent = await ctx.db.query('accountIntents')
    .withIndex('by_accountRef', q => q.eq('accountRef', accountRef))
    .unique()
  if (intent !== null) await ctx.db.delete('accountIntents', intent._id)
  const rows = await ctx.db.query('journeyEvents')
    .withIndex('by_accountRef_and_name', q => q.eq('accountRef', accountRef))
    .take(ERASE_BATCH)
  for (const row of rows) await ctx.db.delete('journeyEvents', row._id)
  if (rows.length === ERASE_BATCH) await ctx.scheduler.runAfter(0, internal.journeyEvents.eraseAccount, { accountRef })
}
