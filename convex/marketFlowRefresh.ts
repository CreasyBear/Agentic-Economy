"use node"

import { generateJwt } from '@coinbase/cdp-sdk/auth'
import { v } from 'convex/values'

import { BASE_FACILITATOR_SET_DIGEST } from '@/modules/market/base-facilitator-set'
import { buildFlowDaySql, buildFlowPayeeWindowSql, chunkRows, daysToIngest, flowPayeeWindow, parseFlowPayeeWindow, parseFlowSqlResult, shiftUtcDay, windowNeedsExpiry } from '@/modules/market/flow-tape'

import { internal } from './_generated/api'
import { action, internalAction, type ActionCtx } from './_generated/server'
import { parseWorkloadCronSnapshot, workloadCronSnapshotValue } from './workloadCron'

const HOST = 'api.cdp.coinbase.com'
const PATH = '/platform/v2/data/query/run'

function failureMessage(cause: unknown): string {
  if (cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')) return 'cdp_timeout'
  if (cause instanceof Error && cause.message.length > 0) return cause.message.slice(0, 80)
  return 'cdp_query_failed'
}

async function runSql(sql: string): Promise<unknown> {
  const keyId = process.env.CDP_API_KEY_ID?.trim()
  const secret = process.env.CDP_API_KEY_SECRET?.trim()
  if (keyId === undefined || keyId.length === 0 || secret === undefined || secret.length === 0) throw new Error('cdp_credentials_missing')
  const token = await generateJwt({
    apiKeyId: keyId, apiKeySecret: secret, requestMethod: 'POST', requestHost: HOST, requestPath: PATH,
  })
  const response = await fetch(`https://${HOST}${PATH}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(25_000),
  })
  if (response.status === 403) throw new Error('cdp_http_403')
  if (!response.ok) throw new Error(`cdp_http_${response.status}`)
  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null || !('result' in body)) throw new Error('cdp_result_missing')
  return body.result
}

async function ingest(ctx: ActionCtx) {
  const checkpoint = await ctx.runQuery(internal.marketFlow.checkpoint, {})
  if (checkpoint !== null && checkpoint.facilitatorSetDigest !== BASE_FACILITATOR_SET_DIGEST) {
    await ctx.runMutation(internal.marketFlow.fail, { message: 'facilitator_set_changed' })
    return
  }
  let days: string[]
  try {
    days = daysToIngest(checkpoint?.lastClosedDay, Date.now())
  } catch (cause) {
    await ctx.runMutation(internal.marketFlow.fail, { message: failureMessage(cause) })
    return
  }
  for (const day of days) {
    let windowStart = (await ctx.runQuery(internal.marketFlow.checkpoint, {}))?.windowStart
    while (windowNeedsExpiry(windowStart, day)) {
      let done = false
      while (!done) done = await ctx.runMutation(internal.marketFlow.expireChunk, { day: windowStart ?? day })
      windowStart = shiftUtcDay(windowStart ?? day, 1)
      await ctx.runMutation(internal.marketFlow.noteWindow, { windowStart })
    }
    try {
      const parsed = parseFlowSqlResult(await runSql(buildFlowDaySql(day)), day)
      if (!parsed.ok) {
        await ctx.runMutation(internal.marketFlow.fail, { message: parsed.reason })
        return
      }
      for (const rows of chunkRows(parsed.rows)) await ctx.runMutation(internal.marketFlow.addChunk, { rows })
      await ctx.runMutation(internal.marketFlow.advance, { day })
    } catch (cause) {
      await ctx.runMutation(internal.marketFlow.fail, { message: failureMessage(cause) })
      return
    }
  }
}

function positiveVolumes(rows: readonly Readonly<{ recipient: string; amountAtomic: string }>[]) {
  return rows.flatMap(row => row.amountAtomic === '0' ? [] : [{ payTo: row.recipient, amountAtomic: row.amountAtomic }])
}

/** Amounts for the payees on the tools being shown. A miss stays a dash; it does not advance the daily checkpoint. */
export const lookupVolumes = action({
  args: { payTos: v.array(v.string()) },
  returns: v.array(v.object({ payTo: v.string(), amountAtomic: v.string() })),
  handler: async (ctx, args) => {
    const payTos = [...new Set(args.payTos.map(payTo => payTo.toLowerCase()))].filter(payTo => /^0x[a-f0-9]{40}$/u.test(payTo)).slice(0, 48)
    if (payTos.length === 0) return []
    const windowEnd = shiftUtcDay(flowPayeeWindow(Date.now()).end, -1)
    const cached = await ctx.runQuery(internal.marketFlow.payeeVolumes, { recipients: payTos, windowEnd })
    const hit = new Set(cached.map(row => row.recipient))
    const missing = payTos.filter(payTo => !hit.has(payTo))
    if (missing.length === 0) return positiveVolumes(cached)
    try {
      const parsed = parseFlowPayeeWindow(await runSql(buildFlowPayeeWindowSql(missing, Date.now())), new Set(missing))
      if (!parsed.ok) {
        console.error('[market] payee volume lookup rejected', { reason: parsed.reason })
        return positiveVolumes(cached)
      }
      const returned = new Set(parsed.rows.map(row => row.recipient))
      const stored = [
        ...parsed.rows,
        ...missing.filter(payTo => !returned.has(payTo)).map(recipient => ({ recipient, amountAtomic: '0' })),
      ]
      await ctx.runMutation(internal.marketFlow.savePayeeVolumes, { rows: stored, windowEnd })
      return positiveVolumes([...cached, ...parsed.rows])
    } catch (cause) {
      console.error('[market] payee volume lookup failed', { reason: failureMessage(cause) })
      return positiveVolumes(cached)
    }
  },
})

export const run = internalAction({
  args: { workload: workloadCronSnapshotValue },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.workloadCron.reconcile, {
      name: 'refresh market flow',
      snapshot: parseWorkloadCronSnapshot(args.workload),
    })
    await ingest(ctx)
    return null
  },
})
