import { availability } from '@/modules/capability-supply/public'
import type { DirectoryChoice } from '@/modules/market/x402-directory'
import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import { toolRecord } from '../../capabilitySupply/tool/projection'

/** Exact current publication identity alone never establishes Call readiness. */
export async function currentDirectoryChoice(ctx: QueryCtx, sourceRouteRef: string | undefined, now: number): Promise<DirectoryChoice> {
  if (sourceRouteRef === undefined) return { access: 'external_listing' }
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_sourceRouteRef_and_disposition', q => q.eq('sourceRouteRef', sourceRouteRef).eq('disposition', 'current'))
    .unique()
  if (publication === null) return { access: 'external_listing', sourceRouteRef }
  const record = await toolRecord(ctx, publication, now)
  if (record === undefined) return { access: 'unavailable', sourceRouteRef }
  const posture = availability({
    routeable: record.routeable, integrated: record.integrated, readiness: record.readiness,
    ...(record.unavailableReason === undefined ? {} : { unavailableReason: record.unavailableReason }),
  }, now).posture
  return { access: posture === 'routeable' ? 'ae_callable' : posture, sourceRouteRef, toolRef: publication.toolRef }
}

/** Memoize only inside this bounded Convex read; withdrawal is checked on every new read. */
export function choiceForDirectoryPage(ctx: QueryCtx, now: number): (row: Doc<'marketDirectorySearchEntries'>) => Promise<DirectoryChoice> {
  const choices = new Map<string, Promise<DirectoryChoice>>()
  return row => {
    const key = row.sourceRouteRef ?? String(row._id)
    let choice = choices.get(key)
    if (choice === undefined) {
      choice = currentDirectoryChoice(ctx, row.sourceRouteRef, now)
      choices.set(key, choice)
    }
    return choice
  }
}
