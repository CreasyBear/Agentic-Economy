import { verifyCustomerRequestServiceAssertion, type CustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import type { Doc } from '../../../_generated/dataModel'
import { env, type MutationCtx, type QueryCtx } from '../../../_generated/server'
import { isPublicToolRef } from '@/modules/common/tool-ref'

export async function assertBuyerCompletedCall(
  ctx: MutationCtx,
  principalId: string,
  toolRef: string,
): Promise<void> {
  const completedCall = await ctx.db.query('capabilityCalls')
    .withIndex('by_principalId_and_toolRef_and_state', index => index
      .eq('principalId', principalId)
      .eq('toolRef', toolRef)
      .eq('state', 'completed'))
    .take(1)
  if (completedCall.length === 0) {
    throw new Error('market_rating_completed_call_required')
  }
}

export type SelectionEvidenceRow = Readonly<{
  toolRef: string
  aeCompleted: number
  aeFailed: number
  usedBefore: boolean
}>

const MAX_SELECTION_EVIDENCE_TOOL_REFS = 20
const MAX_TERMINAL_CALLS_PER_TOOL = 1_000
const SELECTION_EVIDENCE_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000

const SELECTION_EVIDENCE_OPERATION = 'marketListingEvidence.selectionEvidence'
const SELECTION_EVIDENCE_SCOPE = 'market_selection:evidence'

export async function authorizeSelectionEvidence(args: Readonly<{
  toolRefs: readonly string[]
  accountRef?: string
  serviceAuth: CustomerRequestServiceAssertion
}>): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (key === undefined || key.length < 32
    || !args.serviceAuth.scopes.includes(SELECTION_EVIDENCE_SCOPE)) return false
  return await verifyCustomerRequestServiceAssertion({
    key,
    operation: SELECTION_EVIDENCE_OPERATION,
    command: {
      toolRefs: args.toolRefs,
      ...(args.accountRef === undefined ? {} : { accountRef: args.accountRef }),
    },
    assertion: args.serviceAuth,
  })
}

export async function readSelectionEvidence(
  ctx: Pick<QueryCtx, 'db'>,
  args: Readonly<{ toolRefs: readonly string[]; accountRef?: string }>,
): Promise<SelectionEvidenceRow[]> {
  // Evidence is an enhancement: unknown or malformed refs simply get no row
  // (callers treat a missing row as zero evidence) instead of failing the batch.
  const toolRefs = [...new Set(args.toolRefs.map((value) => value.trim()))]
    .filter((toolRef) => toolRef.length > 0 && toolRef.length <= 256 && isPublicToolRef(toolRef))
    .slice(0, MAX_SELECTION_EVIDENCE_TOOL_REFS)
  const accountRef = args.accountRef?.trim()
  if (accountRef !== undefined && (accountRef.length === 0 || accountRef.length > 256)) {
    throw new Error('market_selection_evidence_account_ref_invalid')
  }

  const now = Date.now()
  const since = now - SELECTION_EVIDENCE_WINDOW_MS
  return await Promise.all(toolRefs.map(async (toolRef) => {
    const [completedRows, refusedRows] = await Promise.all([
      ctx.db.query('capabilityCalls')
        .withIndex('by_toolRef_and_state_and_updatedAt', (index) => index
          .eq('toolRef', toolRef)
          .eq('state', 'completed')
          .gte('updatedAt', since)
          .lte('updatedAt', now))
        .order('desc')
        .take(MAX_TERMINAL_CALLS_PER_TOOL + 1),
      ctx.db.query('capabilityCalls')
        .withIndex('by_toolRef_and_state_and_updatedAt', (index) => index
          .eq('toolRef', toolRef)
          .eq('state', 'refused')
          .gte('updatedAt', since)
          .lte('updatedAt', now))
        .order('desc')
        .take(MAX_TERMINAL_CALLS_PER_TOOL + 1),
    ])
    const priorCompletedRows = accountRef === undefined
      ? []
      : await ctx.db.query('capabilityCalls')
        .withIndex('by_ownerId_and_toolRef_and_state', (index) => index
          .eq('ownerId', accountRef)
          .eq('toolRef', toolRef)
          .eq('state', 'completed'))
        .take(1)
    return {
      toolRef,
      aeCompleted: Math.min(completedRows.filter(isCompletedCall).length, MAX_TERMINAL_CALLS_PER_TOOL),
      aeFailed: Math.min(refusedRows.filter(isProviderSideFailure).length, MAX_TERMINAL_CALLS_PER_TOOL),
      usedBefore: priorCompletedRows.length > 0,
    }
  }))
}

function isCompletedCall(row: Doc<'capabilityCalls'>): boolean {
  return row.state === 'completed'
    && row.dispatchState === 'completed'
    && row.result?.kind === 'completed'
}

// Count dispatched provider/operation refusals only; buyer input and authority
// or spend refusals do not lower Tool standing.
function isProviderSideFailure(row: Doc<'capabilityCalls'>): boolean {
  const result = row.result
  if (row.state !== 'refused'
    || row.dispatchState !== 'failed'
    || row.attemptRef === undefined
    || result?.kind !== 'refused') {
    return false
  }
  return result.code.startsWith('provider_')
    || result.code.startsWith('operation_transport_')
    || result.code.startsWith('operation_worker_')
}
