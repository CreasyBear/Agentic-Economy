import { v, type Infer } from 'convex/values'
import { callResultValue, exactAmountValue } from '@/modules/capability-execution/convex'
import { callState } from './contracts'
import { agentAccessPrincipalValue } from '../../../agentAccessPrincipals'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import type { QueryCtx } from '../../../_generated/server'

// -----------------------------------------------------------------------
// Provider-facing Calls listing (`ae supply calls`).
//
// A provider's Tools are its current publications' toolRefs, discovered
// through `capabilityProviderToolProjections`. A provider account is
// expected to own a handful of businesses, and each business a handful of
// published Tools, so this fan-out (businesses -> Tools -> per-Tool Call
// pages) stays a small, fixed-size read regardless of catalogue size. The
// bounds below cap that fan-out explicitly rather than leaving it
// unbounded.
const MAX_SUPPLY_CALLS_BUSINESSES = 20
const MAX_SUPPLY_CALLS_TOOLS_PER_BUSINESS = 50
const MAX_SUPPLY_CALLS_TOOLS = 50

const supplyCallsCursorValue = v.object({ createdAt: v.number(), callRef: v.string() })
type SupplyCallsCursor = Readonly<{ createdAt: number; callRef: string }>

export const supplyCallsArgs = {
  agentPrincipal: agentAccessPrincipalValue,
  state: v.optional(callState),
  limit: v.number(),
  cursor: v.optional(supplyCallsCursorValue),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
} as const

const supplyCallOutcomeValue = v.union(
  v.literal('completed'),
  v.literal('pending'),
  v.literal('needs_authority'),
  v.literal('reconciliation_required'),
  v.literal('refused'),
)

const supplyCallSummaryValue = v.object({
  callRef: v.string(),
  toolRef: v.string(),
  state: callState,
  outcome: v.optional(supplyCallOutcomeValue),
  settledAmount: v.optional(exactAmountValue),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const supplyCallsResultValue = v.union(
  v.object({
    kind: v.literal('available'),
    items: v.array(supplyCallSummaryValue),
    limit: v.number(),
    hasMore: v.boolean(),
    nextCursor: v.optional(supplyCallsCursorValue),
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(v.literal('unauthenticated'), v.literal('source_unavailable')),
  }),
)

type SupplyCallRow = Readonly<{
  callRef: string
  toolRef: string
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  result?: Infer<typeof callResultValue>
  createdAt: number
  updatedAt: number
}>

/** Provider-safe projection: never carries buyer principalId, credentialId, ownerId, idempotency keys, or input/tool payloads. */
function projectSupplyCallSummary(row: SupplyCallRow) {
  const result = row.result
  const receipt = result === undefined
    ? undefined
    : result.kind === 'completed' || result.kind === 'reconciliation_required' || result.kind === 'refused'
      ? result.receipt
      : undefined
  const settledAmount = receipt === undefined || receipt.state !== 'settled'
    ? undefined
    : receipt.providerObligation.amount
  return {
    callRef: row.callRef,
    toolRef: row.toolRef,
    state: row.state,
    ...(result === undefined ? {} : { outcome: result.kind }),
    ...(settledAmount === undefined ? {} : { settledAmount }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Lists the authenticated Provider's own Quotes/Calls, newest first, across
 * every Tool its current publications expose. The business is resolved
 * entirely from the credential (`agentPrincipal`) — callers never supply a
 * business id. Pagination is a manual keyset merge across per-Tool pages
 * (see `by_toolRef_and_createdAt`): each page reads at most `limit + 1` Calls
 * per Tool, so an optional `state` filter narrows the returned page rather
 * than the underlying scan window.
 */
/**
 * Pure listing logic behind `listAgentSupplyCalls`, factored out so it can be
 * exercised without fabricating a signed source-write admission (see
 * `listAgentCallSummariesHandler` in `convex/lib/capabilityExecution/callLifecycle/callRecoveryReads.ts`
 * for the same split on the buyer side). `ownerId` must already be verified
 * by the caller (`verifySupplyAgentPrincipal`) — this function never accepts
 * a business id from the caller; it discovers the owner's businesses and
 * their current Tools itself.
 */
export async function listAgentSupplyCallsHandler(
  ctx: Pick<QueryCtx, 'db'>,
  args: Readonly<{
    ownerId: string
    state?: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
    limit: number
    cursor?: SupplyCallsCursor
  }>,
) {
  const businesses = await ctx.db.query('businesses')
    .withIndex('by_owningAccountRef_and_updatedAt', (index) => index.eq('owningAccountRef', args.ownerId))
    .order('desc')
    .take(MAX_SUPPLY_CALLS_BUSINESSES)
  const toolRows = (await Promise.all(businesses.map((business) => (
    ctx.db.query('capabilityProviderToolProjections')
      .withIndex('by_businessId_and_updatedAt', (index) => index.eq('businessId', business._id))
      .order('desc')
      .take(MAX_SUPPLY_CALLS_TOOLS_PER_BUSINESS)
  )))).flat()
  const toolRefs = [...new Set(toolRows.map((row) => row.toolRef))].slice(0, MAX_SUPPLY_CALLS_TOOLS)
  if (toolRefs.length === 0) {
    return { kind: 'available' as const, items: [], limit: args.limit, hasMore: false }
  }

  const cursor = args.cursor
  const takeCount = args.limit + 1
  const perTool = await Promise.all(toolRefs.map((toolRef) => (
    ctx.db.query('capabilityCalls')
      .withIndex('by_toolRef_and_createdAt', (index) => {
        const eq = index.eq('toolRef', toolRef)
        return cursor === undefined ? eq : eq.lte('createdAt', cursor.createdAt)
      })
      .order('desc')
      .take(takeCount)
  )))
  let candidates: SupplyCallRow[] = perTool.flat()
  if (cursor !== undefined) {
    candidates = candidates.filter((row) => (
      row.createdAt < cursor.createdAt || (row.createdAt === cursor.createdAt && row.callRef < cursor.callRef)
    ))
  }
  candidates.sort((a, b) => (
    b.createdAt - a.createdAt || (a.callRef < b.callRef ? 1 : a.callRef > b.callRef ? -1 : 0)
  ))
  const hasMore = candidates.length > args.limit
  const page = candidates.slice(0, args.limit)
  const last = page.at(-1)
  const items = (args.state === undefined ? page : page.filter((row) => row.state === args.state))
    .map((row) => projectSupplyCallSummary(row))

  return {
    kind: 'available' as const,
    items,
    limit: args.limit,
    hasMore,
    ...(hasMore && last !== undefined ? { nextCursor: { createdAt: last.createdAt, callRef: last.callRef } } : {}),
  }
}
