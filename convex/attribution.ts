import { mutation } from './_generated/server'
import { v } from 'convex/values'
import { attributionTouchValue } from '../src/modules/principal-account/account/convex-schema'
import { resolveBusinessActor } from './authz'

const UTM_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.~-]{0,99}$/
const HOST = /^[A-Za-z0-9.-]{1,253}$/
const CLICK_ID = /^[A-Za-z0-9_.~-]{1,200}$/
const PATH = /^\/[^?#\s]{0,199}$/

type Touch = typeof attributionTouchValue.type

/** Client-callable, so every field is re-validated here: an invalid field is dropped, never stored. */
function cleanTouch(touch: Touch | undefined, at: number): Touch | undefined {
  if (touch === undefined) return undefined
  const pick = (value: string | undefined, pattern: RegExp) => value !== undefined && pattern.test(value) ? value : undefined
  const fields = {
    source: pick(touch.source, UTM_TOKEN), medium: pick(touch.medium, UTM_TOKEN), campaign: pick(touch.campaign, UTM_TOKEN),
    content: pick(touch.content, UTM_TOKEN), term: pick(touch.term, UTM_TOKEN), referrer: pick(touch.referrer, HOST),
    landingPath: pick(touch.landingPath, PATH), clickId: pick(touch.clickId, CLICK_ID),
  }
  const present = Object.entries(fields).filter(([, value]) => value !== undefined)
  return present.length === 0 ? undefined : { ...Object.fromEntries(present), at }
}

/** Records acquisition touches on the viewer's account: first touch is write-once (stamped with the account's creation time), last touch always follows the latest. */
export const recordAttribution = mutation({
  args: { firstTouch: v.optional(attributionTouchValue), lastTouch: v.optional(attributionTouchValue) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return null
    const account = await ctx.db.query('accounts')
      .withIndex('by_accountRef', (q) => q.eq('accountRef', actor.canonicalAccountRef))
      .unique()
    if (account === null) return null
    const firstTouch = account.firstTouch === undefined ? cleanTouch(args.firstTouch, account.createdAt) : undefined
    const lastTouch = cleanTouch(args.lastTouch, args.lastTouch?.at ?? Date.now())
    if (firstTouch === undefined && lastTouch === undefined) return null
    await ctx.db.patch(account._id, { ...(firstTouch && { firstTouch }), ...(lastTouch && { lastTouch }) })
    if (firstTouch !== undefined) {
      // signed_up is emitted at provisioning, before the client can report a touch: backfill its first_* props.
      const signedUp = await ctx.db.query('journeyEvents')
        .withIndex('by_accountRef_and_name', (q) => q.eq('accountRef', account.accountRef).eq('name', 'signed_up'))
        .first()
      if (signedUp !== null) {
        const props = { ...signedUp.props }
        if (firstTouch.source !== undefined) props.first_source = firstTouch.source
        if (firstTouch.medium !== undefined) props.first_medium = firstTouch.medium
        if (firstTouch.campaign !== undefined) props.first_campaign = firstTouch.campaign
        await ctx.db.patch(signedUp._id, { props })
      }
    }
    return null
  },
})
