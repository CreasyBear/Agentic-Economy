import { TableAggregate } from '@convex-dev/aggregate'

import { components } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { insertOperationEvidence } from './marketListingEvidence'

export type MarketEvidenceKind =
  | 'ae_invocation'
  | 'ae_invocation_completed'
  | 'ae_settlement'
  | 'ae_qualified_use'
  | 'ae_reconciliation_required'

const marketEvidence = new TableAggregate<{
  Namespace: MarketEvidenceKind
  Key: number
  DataModel: DataModel
  TableName: 'marketEvidenceFacts'
}>(components.marketEvidence, {
  namespace: (doc) => doc.kind,
  sortKey: (doc) => doc.occurredAt,
})

export async function recordMarketEvidenceFact(
  ctx: MutationCtx,
  kind: MarketEvidenceKind,
  sourceRef: string,
  occurredAt: number,
  listing?: Readonly<{ operationRef: string; durationMs?: number }>,
): Promise<void> {
  const existing = await ctx.db.query('marketEvidenceFacts')
    .withIndex('by_kind_and_sourceRef', (query) => query.eq('kind', kind).eq('sourceRef', sourceRef))
    .unique()
  if (existing !== null) return
  const id = await ctx.db.insert('marketEvidenceFacts', {
    kind,
    sourceRef,
    occurredAt,
    ...(listing === undefined
      ? {}
      : {
          operationRef: listing.operationRef,
          ...(listing.durationMs === undefined ? {} : { durationMs: listing.durationMs }),
        }),
  })
  const row = await ctx.db.get(id)
  if (row === null) throw new Error('market_evidence_fact_missing_after_insert')
  await marketEvidence.insert(ctx, row)
  await insertOperationEvidence(ctx, row)
}

export async function countMarketEvidence(
  ctx: QueryCtx,
  kind: MarketEvidenceKind,
  since: number,
): Promise<number> {
  return (await marketEvidence.count(ctx, {
    namespace: kind,
    bounds: { lower: { key: since, inclusive: true } },
  })) ?? 0
}
