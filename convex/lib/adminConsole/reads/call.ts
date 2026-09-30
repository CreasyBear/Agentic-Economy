import type { CallStatusResult } from '@/modules/capability-execution/call-recovery-contracts'
import {
  callResultSchema,
  type CallRef,
} from '@/modules/capability-execution/call-contracts'
import {
  projectCallReceipt,
  projectFoundCallPurchaseStatus,
} from '@/modules/capability-execution/call-receipt-view'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import type {
  AdminCallView,
  AdminTimelineEntry,
} from '@/lib/operator/admin-console/views'
import { parseAdminObjectRef } from '@/lib/operator/admin-console/ref-parsers'

import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import { readPurchaseResolutionByCallRef } from '../../capabilityExecution/callLifecycle/purchaseResolutionMaterialize'
import { readTurnHandler } from '../../chat/turns/modelCost'

type FoundCallStatus = Extract<CallStatusResult, { kind: 'found' }>
type CallRow = Doc<'capabilityCalls'>

type ShapeAdminCallViewInput = Readonly<
  Omit<AdminCallView, 'kind' | 'purchase' | 'receipt'> & {
    status: FoundCallStatus
  }
>

export function shapeAdminCallView(input: ShapeAdminCallViewInput): AdminCallView {
  const { status, ...view } = input
  return {
    kind: 'call',
    ...view,
    purchase: projectFoundCallPurchaseStatus(status),
    receipt: projectCallReceipt(status),
  }
}

export async function readAdminCallView(
  ctx: QueryCtx,
  ref: CallRef,
): Promise<AdminCallView | { kind: 'object_not_found' }> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', ref))
    .unique()
  if (row === null) return { kind: 'object_not_found' }

  const resolution = await readPurchaseResolutionByCallRef(ctx, ref)
  const correlationId = 'correlationId' in row && typeof row.correlationId === 'string'
    ? row.correlationId
    : null
  const timeline = correlationId === null ? [] : await readCallTimeline(ctx, correlationId)
  const parsedResult = row.result === undefined ? undefined : callResultSchema.safeParse(row.result)
  const quote = row.quoteRef === undefined ? undefined : parseAdminObjectRef('quote', row.quoteRef)
  const workspace = parseAdminObjectRef('workspace', row.ownerId)
  const agent = parseAdminObjectRef('agent', row.principalId)
  const status: FoundCallStatus = {
    kind: 'found',
    callRef: row.callRef,
    version: row.updatedAt,
    toolRef: row.toolRef,
    state: publicCallState(row),
    ...(row.usage === undefined ? {} : { usage: row.usage }),
    ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    ...(parsedResult?.success === true ? { result: parsedResult.data } : {}),
    ...(resolution === null ? {} : { purchaseResolution: resolution }),
  }

  return shapeAdminCallView({
    ref,
    state: row.state,
    quoteRef: quote?.kind === 'valid' && quote.ref.kind === 'quote' ? quote.ref.ref : null,
    toolRef: isPublicToolRef(row.toolRef) ? row.toolRef : null,
    workspaceRef: workspace.kind === 'valid' && workspace.ref.kind === 'workspace'
      ? workspace.ref.ref
      : null,
    agentRef: agent.kind === 'valid' && agent.ref.kind === 'agent' ? agent.ref.ref : null,
    correlationId,
    resolution,
    answerModelCost: await readAnswerModelCost(ctx, row),
    timeline,
    status,
  })
}

async function readAnswerModelCost(ctx: QueryCtx, call: CallRow): Promise<AdminCallView['answerModelCost']> {
  const turnRef = call.chatTurnRef
  if (turnRef === undefined) return null
  const turn = await ctx.db.query('chatTurns').withIndex('by_turnRef', q => q.eq('turnRef', turnRef)).unique()
  if (turn === null || turn.accountRef !== call.ownerId || turn.principalRef !== call.principalId) return null
  const [cost, related] = await Promise.all([
    readTurnHandler(ctx, { turnRef }),
    ctx.db.query('capabilityCalls').withIndex('by_chatTurnRef', q => q.eq('chatTurnRef', turnRef)).take(257),
  ])
  return { cost, callRefs: related.slice(0, 256)
    .filter(row => row.ownerId === call.ownerId && row.principalId === call.principalId)
    .map(row => row.callRef), callsTruncated: related.length > 256 }
}

function publicCallState(row: CallRow): FoundCallStatus['state'] {
  if (row.state === 'pending') {
    return row.result?.kind === 'needs_authority' ? 'awaiting_authority' : 'in_progress'
  }
  if (row.state === 'reconciliation_required') return 'reconciliation_required'
  if (row.state === 'cancelled') return 'cancelled'
  return 'terminal'
}


async function readCallTimeline(
  ctx: QueryCtx,
  correlationId: string,
): Promise<readonly AdminTimelineEntry[]> {
  // Call rows expose no audit target type; correlationId is the canonical audit join when present.
  const rows = await ctx.db.query('auditEvents')
    .withIndex('by_correlationId_and_createdAt', (query) => query.eq('correlationId', correlationId))
    .order('desc')
    .take(50)
  return rows.map((row) => ({
    at: row.createdAt,
    eventType: row.eventType,
    actorRef: row.actorRef,
    outcome: row.outcome ?? null,
  }))
}
