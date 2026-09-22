import type { QuoteRef } from '@/modules/capability-execution/call-contracts'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import type { AdminQuoteView } from '@/lib/operator/admin-console/views'
import { parseAdminObjectRef } from '@/lib/operator/admin-console/ref-parsers'

import type { QueryCtx } from '../../../_generated/server'

export async function readAdminQuoteView(
  ctx: QueryCtx,
  ref: QuoteRef,
): Promise<AdminQuoteView | { kind: 'object_not_found' }> {
  const row = await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', (query) => query.eq('quoteRef', ref))
    .unique()
  if (row === null) return { kind: 'object_not_found' }

  const workspace = parseAdminObjectRef('workspace', row.accountRef)
  const agent = parseAdminObjectRef('agent', row.principalId)
  const consumedCall = row.consumedCallRef === undefined
    ? undefined
    : parseAdminObjectRef('call', row.consumedCallRef)

  return {
    kind: 'quote',
    ref,
    state: row.state,
    toolRef: isPublicToolRef(row.toolRef) ? row.toolRef : null,
    workspaceRef: workspace.kind === 'valid' && workspace.ref.kind === 'workspace'
      ? workspace.ref.ref
      : null,
    agentRef: agent.kind === 'valid' && agent.ref.kind === 'agent'
      ? agent.ref.ref
      : null,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    consumedCallRef: consumedCall?.kind === 'valid' && consumedCall.ref.kind === 'call'
      ? consumedCall.ref.ref
      : null,
  }
}
