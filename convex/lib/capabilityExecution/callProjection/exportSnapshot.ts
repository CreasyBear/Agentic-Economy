import type { QueryCtx } from '../../../_generated/server'
import { canonicalDigest, schemaDescriptorDigest } from '@/modules/common/canonical-digest'
import { MAX_USAGE_ROWS } from './contracts'
import { readProjectedSupport } from '../serviceUsage/projectedSupport'

/** Transactional cohort fingerprint includes row identity and all projected fields.
 * A final check catches deletions, cursor moves and updates to already-read rows.
 * Later inserts are outside the declared creation cutoff, including equal dates. */
export async function callExportSourceDigest(ctx: Pick<QueryCtx, 'db'>, scope: {
  accountRef: string; principalRef?: string; periodStartAt: number; periodEndAt: number; snapshotAt: number
}): Promise<string> {
  const principal = scope.principalRef
  const rows = principal === undefined
    ? await ctx.db.query('capabilityCallProjections').withIndex('by_accountRef_and_createdAt', q => q
      .eq('accountRef', scope.accountRef).gte('createdAt', scope.periodStartAt).lt('createdAt', scope.periodEndAt)).order('desc').take(MAX_USAGE_ROWS + 1)
    : await ctx.db.query('capabilityCallProjections').withIndex('by_accountRef_and_principalRef_and_createdAt', q => q
      .eq('accountRef', scope.accountRef).eq('principalRef', principal).gte('createdAt', scope.periodStartAt).lt('createdAt', scope.periodEndAt)).order('desc').take(MAX_USAGE_ROWS + 1)
  if (rows.length > MAX_USAGE_ROWS) throw new Error('call_export_window_too_large')
  const digests = []
  for (const row of rows) if (row._creationTime <= scope.snapshotAt) {
    const support = await readProjectedSupport(ctx, row)
    digests.push(canonicalDigest({projectionDigest: canonicalDigest(row), canonicalSupportDigest: support.fingerprint}))
  }
  return schemaDescriptorDigest({ format: 'ae.call-export-source:v2', rows: digests })
}
