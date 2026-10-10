import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction, internalMutation, internalQuery } from './_generated/server'
import { isProductAnalyticsDisabled, readObservabilityServerConfig } from '../src/lib/observability/config'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { eraseAccountJourney } from './lib/journey/events'

const RETRY_AFTER_MS = 10 * 60_000
const RETRY_WINDOW_MS = 7 * 24 * 3_600_000
const RETRY_BATCH = 50
/** A 4xx payload rejection stays rejected, so it leaves the retry set instead of holding its head.
 * Auth (401, 403), timeout (408) and rate limit (429) are fixable and stay retryable. */
const isTerminalRejection = (status: number) => status >= 400 && status < 500 && ![401, 403, 408, 429].includes(status)

const analyticsEnv = () => process.env as Record<string, string | undefined>
const forwardingConfigured = () => !isProductAnalyticsDisabled(analyticsEnv())
  && readObservabilityServerConfig(analyticsEnv()).posthogKey !== undefined

/** PostHog sees a one-way digest of the account, never the raw ref (same scheme as refusal events). */
const journeyDistinctId = (accountRef: string) => canonicalDigest({ format: 'ae.journey:v1', value: accountRef })

/** PostHog rejects non-UUID `uuid`s; derive a stable v5-shaped UUID from the row id so a re-send dedupes. */
async function eventUuid(eventId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ae.journey:${eventId}`))).slice(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const journeyPropsValue = v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean())))

export const readEvent = internalQuery({
  args: { eventId: v.id('journeyEvents') },
  returns: v.union(v.null(), v.object({
    accountRef: v.string(),
    name: v.string(),
    createdAt: v.number(),
    props: journeyPropsValue,
    forwarded: v.boolean(),
  })),
  handler: async (ctx, { eventId }) => {
    const row = await ctx.db.get(eventId)
    if (row === null) return null
    return {
      accountRef: row.accountRef,
      name: row.name,
      createdAt: row.createdAt,
      ...(row.props === undefined ? {} : { props: row.props }),
      forwarded: row.forwardedAt !== undefined,
    }
  },
})

/** Continues an account-close erasure that filled a batch. */
export const eraseAccount = internalMutation({
  args: { accountRef: v.string() },
  returns: v.null(),
  handler: async (ctx, { accountRef }) => {
    await eraseAccountJourney(ctx, accountRef)
    return null
  },
})

/** forwardedAt marks the row settled: PostHog took it, or rejected it with a 4xx a re-send cannot fix. */
export const markForwarded = internalMutation({
  args: { eventId: v.id('journeyEvents') },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const row = await ctx.db.get(eventId)
    if (row !== null && row.forwardedAt === undefined) await ctx.db.patch(eventId, { forwardedAt: Date.now() })
    return null
  },
})

/** Re-sends rows a failed or timed-out forward left unmarked. The uuid is stable, so PostHog dedupes a
 * row that did arrive. Rows older than the window stop being retried. */
export const retryUnforwarded = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!forwardingConfigured()) return null
    const now = Date.now()
    const rows = await ctx.db.query('journeyEvents')
      .withIndex('by_forwardedAt_and_createdAt', q => q.eq('forwardedAt', undefined)
        .gt('createdAt', now - RETRY_WINDOW_MS).lt('createdAt', now - RETRY_AFTER_MS))
      .take(RETRY_BATCH)
    for (const row of rows) await ctx.scheduler.runAfter(0, internal.journeyEvents.forward, { eventId: row._id })
    return null
  },
})

/** First PostHog forward attempt; retryUnforwarded re-sends any row a network error, 5xx or fixable 4xx leaves unmarked. */
export const forward = internalAction({
  args: { eventId: v.id('journeyEvents') },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const row = await ctx.runQuery(internal.journeyEvents.readEvent, { eventId })
    if (row === null || row.forwarded) return null
    if (!forwardingConfigured()) return null
    const config = readObservabilityServerConfig(analyticsEnv())
    if (config.posthogKey === undefined) return null
    let destination: URL
    try {
      destination = new URL(`${config.posthogHost.replace(/\/+$/u, '')}/batch/`)
    } catch {
      return null
    }
    if (destination.protocol !== 'https:' || destination.username !== '' || destination.password !== ''
      || destination.search !== '' || destination.hash !== '') return null
    const body = JSON.stringify({
      api_key: config.posthogKey,
      batch: [{
        uuid: await eventUuid(eventId),
        event: row.name,
        distinct_id: journeyDistinctId(row.accountRef),
        timestamp: new Date(row.createdAt).toISOString(),
        properties: { ...row.props, $process_person_profile: false, $geoip_disable: true },
      }],
    })
    try {
      const response = await fetch(destination, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      })
      void response.body?.cancel().catch(() => {})
      if (!response.ok) console.warn('[ae.journey.forward]', response.status)
      if (response.ok || isTerminalRejection(response.status)) await ctx.runMutation(internal.journeyEvents.markForwarded, { eventId })
    } catch {
      // Network errors can carry request data, so nothing is logged; the row stays unmarked for retryUnforwarded.
    }
    return null
  },
})
