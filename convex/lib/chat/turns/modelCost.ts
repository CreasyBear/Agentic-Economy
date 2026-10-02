import { makeFunctionReference } from 'convex/server'
import {
  CHAT_MODEL_COST_MAX_REQUESTS, isChatModelCostIdentifier, isChatModelCostModel, parseModelCostUsd, sumModelCostUsd,
  type ChatModelCostBinding, type ChatModelCostBegin, type ChatModelCostObserve,
  type ChatModelCostStatsClaim, type ChatModelCostSummary,
} from '@/modules/chat/model-cost'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { chatThreadBelongsToPrincipal } from '../threads/ownership'

const reconcile = makeFunctionReference<'action', { requestRef: string; attempt: number }, null>('chatModelCostActions:reconcile')
type Request = Doc<'chatModelCostRequests'>

/** Requires canonical turn/thread/prompt and bounded identifiers. Ensures one
 * immutable request per identity before I/O. Invariant: turn's Account owns the
 * row; duplicate delivery creates no new request. On violation: named refusal
 * throws before any write. Convex reads + insert provide the concurrency fence. */
export async function beginHandler(ctx: MutationCtx, args: ChatModelCostBegin): Promise<null> {
  validIdentifier(args.requestRef)
  validModel(args.requestedModel)
  const [turn, existing] = await Promise.all([
    boundTurn(ctx, args),
    ctx.db.query('chatModelCostRequests').withIndex('by_requestRef', q => q.eq('requestRef', args.requestRef)).unique(),
  ])
  if (existing !== null) {
    if (!matchesBinding(existing, args, turn.accountRef) || existing.source !== args.source
      || existing.purpose !== args.purpose || existing.requestedModel !== args.requestedModel) throw new Error('model_cost_request_conflict')
    return null
  }
  if (turn.state !== 'submitted' && turn.state !== 'working') throw new Error('model_cost_turn_finished')
  if (turn.cancelRequestedAt !== undefined) throw new Error('model_cost_turn_finished')
  const now = Date.now()
  await ctx.db.insert('chatModelCostRequests', { ...args, accountRef: turn.accountRef,
    accounting: { status: 'pending' }, createdAt: now, updatedAt: now })
  return null
}

/** Completion may arrive after cancellation. Accepted usage and prices cannot
 * change; missing fields may be enriched and unpriced diagnostics may change.
 * A generation join is checked in the same transaction, so two concurrent
 * requests cannot both count it. Refusal retains the previous pending/unknown
 * fact. No prompts, raw metadata or arbitrary failure messages are retained. */
export async function observeHandler(ctx: MutationCtx, args: ChatModelCostObserve): Promise<null> {
  validIdentifier(args.requestRef)
  if (args.model !== undefined) validModel(args.model)
  if (args.providerGenerationId !== undefined) validIdentifier(args.providerGenerationId)
  for (const tokens of [args.inputTokens, args.outputTokens]) {
    if (tokens !== undefined && (!Number.isSafeInteger(tokens) || tokens < 0)) throw new Error('model_cost_usage_invalid')
  }
  const [turn, row] = await Promise.all([
    boundTurn(ctx, args),
    ctx.db.query('chatModelCostRequests').withIndex('by_requestRef', q => q.eq('requestRef', args.requestRef)).unique(),
  ])
  if (row === null) throw new Error('model_cost_request_not_found')
  if (!matchesBinding(row, args, turn.accountRef)) throw new Error('model_cost_request_conflict')
  for (const field of ['model', 'inputTokens', 'outputTokens', 'providerGenerationId'] as const) {
    if (args[field] !== undefined && row[field] !== undefined && row[field] !== args[field]) throw new Error('model_cost_observation_conflict')
  }
  const generationId = args.providerGenerationId ?? row.providerGenerationId
  if (generationId !== undefined) {
    const claimed = await ctx.db.query('chatModelCostRequests')
      .withIndex('by_source_and_providerGenerationId', q => q.eq('source', row.source).eq('providerGenerationId', generationId)).unique()
    if (claimed !== null && claimed.requestRef !== row.requestRef) throw new Error('model_cost_generation_conflict')
  }
  let accounting = row.accounting
  if (args.accounting.status === 'priced') {
    const amountUsd = parseModelCostUsd(args.accounting.amountUsd)
    if (amountUsd === undefined) throw new Error('model_cost_amount_invalid')
    if (row.source !== 'openrouter' || (args.accounting.source === 'generation_stats' && generationId === undefined)) {
      throw new Error('model_cost_price_source_invalid')
    }
    if (accounting.status === 'priced' && (accounting.amountUsd !== amountUsd || accounting.source !== args.accounting.source)) {
      throw new Error('model_cost_observation_conflict')
    }
    accounting = { ...args.accounting, amountUsd }
  } else if (accounting.status !== 'priced') accounting = args.accounting
  const metadata = {
    ...(args.model === undefined ? {} : { model: args.model }),
    ...(args.inputTokens === undefined ? {} : { inputTokens: args.inputTokens }),
    ...(args.outputTokens === undefined ? {} : { outputTokens: args.outputTokens }),
    ...(args.providerGenerationId === undefined ? {} : { providerGenerationId: args.providerGenerationId }),
  }
  const scheduleStats = row.source === 'openrouter' && generationId !== undefined
    && accounting.status === 'unpriced' && row.metadataLookupAttempts === undefined
  const changed = accounting.status !== row.accounting.status
    || (accounting.status === 'priced' && row.accounting.status !== 'priced')
    || (accounting.status === 'unpriced' && row.accounting.status === 'unpriced' && accounting.reason !== row.accounting.reason)
    || Object.entries(metadata).some(([field, value]) => row[field as keyof Request] !== value)
  if (changed || scheduleStats) await ctx.db.patch(row._id, { ...metadata, accounting,
    ...(scheduleStats ? { metadataLookupAttempts: 0 } : {}), updatedAt: Date.now() })
  if (scheduleStats) await ctx.scheduler.runAfter(1_000, reconcile, { requestRef: row.requestRef, attempt: 1 })
  return null
}

/** Claim and successor schedule commit together. Duplicate delivery, a stale
 * attempt, or an already priced request starts no lookup. At most three claims
 * can succeed, including when an action dies after its transactional claim. */
export async function claimStatsLookupHandler(ctx: MutationCtx, args: { requestRef: string; attempt: number }): Promise<ChatModelCostStatsClaim> {
  validIdentifier(args.requestRef)
  if (!Number.isInteger(args.attempt) || args.attempt < 1 || args.attempt > 3) return null
  const row = await ctx.db.query('chatModelCostRequests').withIndex('by_requestRef', q => q.eq('requestRef', args.requestRef)).unique()
  if (row === null || row.source !== 'openrouter' || row.accounting.status !== 'unpriced'
    || row.providerGenerationId === undefined || row.metadataLookupAttempts !== args.attempt - 1) return null
  await boundTurn(ctx, row)
  await ctx.db.patch(row._id, { metadataLookupAttempts: args.attempt, updatedAt: Date.now() })
  if (args.attempt < 3) await ctx.scheduler.runAfter(args.attempt === 1 ? 15_000 : 60_000,
    reconcile, { requestRef: row.requestRef, attempt: args.attempt + 1 })
  return { turnRef: row.turnRef, threadId: row.threadId, promptMessageId: row.promptMessageId,
    requestRef: row.requestRef, providerGenerationId: row.providerGenerationId,
    ...(row.model === undefined ? {} : { model: row.model }),
    ...(row.inputTokens === undefined ? {} : { inputTokens: row.inputTokens }),
    ...(row.outputTokens === undefined ? {} : { outputTokens: row.outputTokens }) }
}

/** A sum is a known subtotal, never a price estimate. The status carries missing
 * coverage; requestCount=257 under limit_exceeded is a bounded lower bound. */
export async function readTurnHandler(ctx: Pick<QueryCtx, 'db'>, args: { turnRef: string }): Promise<ChatModelCostSummary> {
  validBindingIdentifier(args.turnRef)
  const turn = await ctx.db.query('chatTurns').withIndex('by_turnRef', q => q.eq('turnRef', args.turnRef)).unique()
  if (turn === null) return {
    turnRef: args.turnRef, status: 'untracked', knownCostUsd: '0', requestCount: 0, unknownRequestCount: 0, requests: [],
  }
  const rows = await ctx.db.query('chatModelCostRequests').withIndex('by_turnRef', q => q.eq('turnRef', args.turnRef))
    .take(CHAT_MODEL_COST_MAX_REQUESTS + 1)
  const requests = rows.slice(0, CHAT_MODEL_COST_MAX_REQUESTS).map(row => ({
    requestRef: row.requestRef, source: row.source, purpose: row.purpose, requestedModel: row.requestedModel,
    ...(row.model === undefined ? {} : { model: row.model }),
    ...(row.inputTokens === undefined ? {} : { inputTokens: row.inputTokens }),
    ...(row.outputTokens === undefined ? {} : { outputTokens: row.outputTokens }),
    ...(row.providerGenerationId === undefined ? {} : { providerGenerationId: row.providerGenerationId }),
    accounting: row.accounting,
  }))
  const unknownRequestCount = requests.filter(row => row.accounting.status !== 'priced').length
  return { turnRef: turn.turnRef,
    status: rows.length > CHAT_MODEL_COST_MAX_REQUESTS ? 'limit_exceeded'
      : turn.modelCostTrackingVersion !== 1 ? 'untracked'
      : turn.state === 'submitted' || turn.state === 'working' || unknownRequestCount > 0 ? 'incomplete' : 'complete',
    knownCostUsd: sumModelCostUsd(requests.flatMap(row => row.accounting.status === 'priced' ? [row.accounting.amountUsd] : [])),
    requestCount: rows.length, unknownRequestCount, requests }
}

async function boundTurn(ctx: Pick<QueryCtx, 'db'>, args: ChatModelCostBinding): Promise<Doc<'chatTurns'>> {
  validBindingIdentifier(args.turnRef)
  validBindingIdentifier(args.threadId)
  validBindingIdentifier(args.promptMessageId)
  const turn = await ctx.db.query('chatTurns').withIndex('by_turnRef', q => q.eq('turnRef', args.turnRef)).unique()
  if (turn === null || turn.threadId !== args.threadId || turn.promptMessageId !== args.promptMessageId) throw new Error('model_cost_binding_invalid')
  const thread = await ctx.db.query('chatThreads').withIndex('by_threadId', q => q.eq('threadId', args.threadId)).unique()
  if (thread === null || !chatThreadBelongsToPrincipal(thread, turn.accountRef, turn.principalKind, turn.principalRef)) {
    throw new Error('model_cost_binding_invalid')
  }
  return turn
}

function matchesBinding(row: Request, args: ChatModelCostBinding, accountRef: string) {
  return row.turnRef === args.turnRef && row.threadId === args.threadId
    && row.promptMessageId === args.promptMessageId && row.accountRef === accountRef
}
function validIdentifier(value: string) {
  if (!isChatModelCostIdentifier(value)) throw new Error('model_cost_identifier_invalid')
}
function validModel(value: string) {
  if (!isChatModelCostModel(value)) throw new Error('model_cost_model_invalid')
}
function validBindingIdentifier(value: string) {
  if (value.length > 256 || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/u.test(value)) throw new Error('model_cost_binding_invalid')
}
