import { verifyCustomerRequestServiceAssertion, type CustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import type { Doc } from '../../_generated/dataModel'
import { env, type MutationCtx, type QueryCtx } from '../../_generated/server'

const MAX_SELECTION_DECISION_ITEMS = 64
const SELECTION_DECISION_OPERATION = 'capabilitySelectionDecisions.record'
const SELECTION_DECISION_SCOPE = 'market_selection:evidence'

export type SelectionDecisionInput = Readonly<{
  kind: 'procure' | 'registry_rerank' | 'directory_rerank' | 'chat_recommend'
  accountRef?: string
  correlationId: string
  offered: readonly Readonly<{ toolRef: string; rank: number; score: number }>[]
  pickedToolRef?: string
  tier: string
  modelConfidence?: number
  fit: readonly Readonly<{ toolRef: string; noul?: number; score?: number }>[]
  latencyMs: number
  costAud?: number
  serviceAuth: CustomerRequestServiceAssertion
}>

type SelectionDecisionRowInput = Omit<SelectionDecisionInput, 'serviceAuth'> & Readonly<{
  threadId?: string
  promptMessageId?: string
  shown?: boolean
  ranToolRef?: string
  ranAt?: number
}>

export type StoredSelectionDecision = {
  kind: SelectionDecisionInput['kind']
  accountRef?: string
  correlationId: string
  offered: { toolRef: string; rank: number; score: number }[]
  pickedToolRef?: string
  tier: string
  modelConfidence?: number
  fit: { toolRef: string; noul?: number; score?: number }[]
  latencyMs: number
  costAud?: number
  threadId?: string
  promptMessageId?: string
  shown?: boolean
  ranToolRef?: string
  ranAt?: number
  createdAt: number
}

async function assertSelectionDecisionAuth(
  args: Pick<SelectionDecisionInput, 'kind' | 'correlationId' | 'serviceAuth'>,
): Promise<void> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  const command = { correlationId: args.correlationId, kind: args.kind }
  if (key === undefined || key.length < 32
    || !args.serviceAuth.scopes.includes(SELECTION_DECISION_SCOPE)
    || !await verifyCustomerRequestServiceAssertion({
      key,
      operation: SELECTION_DECISION_OPERATION,
      command,
      assertion: args.serviceAuth,
    })) {
    throw new Error('capability_selection_decision_authentication_required')
  }
}

export async function recordSelectionDecision(
  ctx: MutationCtx,
  args: SelectionDecisionInput,
): Promise<void> {
  await assertSelectionDecisionAuth(args)
  await insertSelectionDecision(ctx, args)
}

export async function insertSelectionDecision(
  ctx: MutationCtx,
  args: SelectionDecisionRowInput,
): Promise<void> {
  const noCandidates = args.tier === 'no_match' || args.tier === 'selection_unavailable'
  if (noCandidates && (args.pickedToolRef !== undefined || args.offered.length !== 0 || args.fit.length !== 0)) {
    throw new Error('capability_selection_decision_empty_outcome_invalid')
  }
  if ((!noCandidates && args.offered.length === 0) || args.offered.length > MAX_SELECTION_DECISION_ITEMS) {
    throw new Error('capability_selection_decision_offered_invalid')
  }
  if ((!noCandidates && args.fit.length === 0) || args.fit.length > MAX_SELECTION_DECISION_ITEMS) {
    throw new Error('capability_selection_decision_fit_invalid')
  }
  if (args.offered.some((item) => !Number.isFinite(item.score))) {
    throw new Error('capability_selection_decision_score_invalid')
  }
  if (args.fit.some((item) => (item.noul !== undefined && !Number.isFinite(item.noul))
    || (item.score !== undefined && !Number.isFinite(item.score)))) {
    throw new Error('capability_selection_decision_fit_score_invalid')
  }
  if (args.modelConfidence !== undefined
    && (!Number.isFinite(args.modelConfidence) || args.modelConfidence < 0 || args.modelConfidence > 1)) {
    throw new Error('capability_selection_decision_confidence_invalid')
  }
  if (args.kind === 'chat_recommend' && args.shown === true
    && (args.threadId === undefined || args.promptMessageId === undefined
      || args.pickedToolRef === undefined || args.modelConfidence === undefined || args.tier !== 'jev_system_one')) {
    throw new Error('capability_selection_decision_shown_invalid')
  }

  if (args.kind === 'chat_recommend') {
    const threadId = args.threadId
    const promptMessageId = args.promptMessageId
    if (threadId === undefined || promptMessageId === undefined
      || args.correlationId !== `${threadId}:${promptMessageId}`) {
      throw new Error('capability_selection_decision_correlation_invalid')
    }
    const previous = await ctx.db.query('toolSelectionDecisions')
      .withIndex('by_threadId_and_promptMessageId', (index) => index.eq('threadId', threadId).eq('promptMessageId', promptMessageId))
      .unique()
    if (previous !== null) {
      if (previous.kind !== 'chat_recommend' || previous.correlationId !== args.correlationId) {
        throw new Error('capability_selection_decision_correlation_conflict')
      }
      return
    }
  }
  await ctx.db.insert('toolSelectionDecisions', {
    kind: args.kind,
    ...(args.accountRef === undefined ? {} : { accountRef: args.accountRef }),
    correlationId: args.correlationId,
    offered: args.offered.map(({ toolRef, rank, score }) => ({ toolRef, rank, score })),
    ...(args.pickedToolRef === undefined ? {} : { pickedToolRef: args.pickedToolRef }),
    tier: args.tier,
    ...(args.modelConfidence === undefined ? {} : { modelConfidence: args.modelConfidence }),
    fit: args.fit.map(({ toolRef, noul, score }) => ({
      toolRef,
      ...(noul === undefined ? {} : { noul }),
      ...(score === undefined ? {} : { score }),
    })),
    latencyMs: args.latencyMs,
    ...(args.costAud === undefined ? {} : { costAud: args.costAud }),
    ...(args.threadId === undefined ? {} : { threadId: args.threadId }),
    ...(args.promptMessageId === undefined ? {} : { promptMessageId: args.promptMessageId }),
    ...(args.shown === undefined ? {} : { shown: args.shown }),
    ...(args.ranToolRef === undefined ? {} : { ranToolRef: args.ranToolRef }),
    ...(args.ranAt === undefined ? {} : { ranAt: args.ranAt }),
    createdAt: Date.now(),
  })
}

export async function readRecentSelectionDecisions(
  ctx: QueryCtx,
  args: Readonly<{ kind?: SelectionDecisionInput['kind']; limit: number }>,
): Promise<StoredSelectionDecision[]> {
  let rows: Doc<'toolSelectionDecisions'>[]
  if (args.kind === undefined) {
    rows = await ctx.db.query('toolSelectionDecisions')
      .withIndex('by_createdAt')
      .order('desc')
      .take(args.limit)
  } else if (args.kind === 'procure') {
    rows = await ctx.db.query('toolSelectionDecisions')
      .withIndex('by_kind_and_createdAt', (index) => index.eq('kind', 'procure'))
      .order('desc')
      .take(args.limit)
  } else if (args.kind === 'registry_rerank') {
    rows = await ctx.db.query('toolSelectionDecisions')
      .withIndex('by_kind_and_createdAt', (index) => index.eq('kind', 'registry_rerank'))
      .order('desc')
      .take(args.limit)
  } else if (args.kind === 'directory_rerank') {
    rows = await ctx.db.query('toolSelectionDecisions')
      .withIndex('by_kind_and_createdAt', (index) => index.eq('kind', 'directory_rerank'))
      .order('desc')
      .take(args.limit)
  } else {
    rows = await ctx.db.query('toolSelectionDecisions')
      .withIndex('by_kind_and_createdAt', (index) => index.eq('kind', 'chat_recommend'))
      .order('desc')
      .take(args.limit)
  }
  return rows.map((row) => ({
    kind: row.kind,
    ...(row.accountRef === undefined ? {} : { accountRef: row.accountRef }),
    correlationId: row.correlationId,
    offered: row.offered.map(({ toolRef, rank, score }) => ({ toolRef, rank, score })),
    ...(row.pickedToolRef === undefined ? {} : { pickedToolRef: row.pickedToolRef }),
    tier: row.tier,
    ...(row.modelConfidence === undefined ? {} : { modelConfidence: row.modelConfidence }),
    fit: row.fit.map(({ toolRef, noul, score }) => ({
      toolRef,
      ...(noul === undefined ? {} : { noul }),
      ...(score === undefined ? {} : { score }),
    })),
    latencyMs: row.latencyMs,
    ...(row.costAud === undefined ? {} : { costAud: row.costAud }),
    ...(row.threadId === undefined ? {} : { threadId: row.threadId }),
    ...(row.promptMessageId === undefined ? {} : { promptMessageId: row.promptMessageId }),
    ...(row.shown === undefined ? {} : { shown: row.shown }),
    ...(row.ranToolRef === undefined ? {} : { ranToolRef: row.ranToolRef }),
    ...(row.ranAt === undefined ? {} : { ranAt: row.ranAt }),
    createdAt: row.createdAt,
  }))
}
