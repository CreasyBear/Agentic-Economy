import { directorySourceLabels } from '@/modules/market/x402-directory-metadata'
import { isRecord } from '@/modules/common/is-record'
import { x402DirectoryFunctionalTitle } from '@/modules/market/x402-directory-title'
import type { Doc } from '../../_generated/dataModel'
import type { QueryCtx, MutationCtx } from '../../_generated/server'
import type { DirectoryDepthBand, DirectoryMomentumBand, DirectoryRecencyBand } from '@/modules/market/x402-directory-index'
import type { DirectoryEntry, IndexedEntry } from './contracts'
import type { X402DirectoryIndexCoverage } from '@/modules/market/x402-directory-index'

export async function directoryState(ctx: Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>) {
  return await ctx.db.query('marketExternalRegistryState')
    .withIndex('by_key', q => q.eq('key', 'coinbase')).unique()
}

export async function directoryGeneration(ctx: Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>, generation: string) {
  const row = await ctx.db.query('marketExternalRegistryGenerations')
    .withIndex('by_generation', q => q.eq('generation', generation)).unique()
  return row?.source === 'coinbase' ? row : null
}

/**
 * The live generation is updated in place (Well 8 Lane B): a refresh patches
 * this same row rather than swapping to a fresh one, so `status` legitimately
 * reads 'refreshing' for the run's whole duration. Gating reads on
 * `terminalObserved` alone (never re-checking `status`) keeps browse/search/
 * facets available throughout a refresh - `terminalObserved` latches true the
 * first time a scan ever completes (x402DirectoryIndexStore.applyPage) and
 * never resets, unlike `status`, which does flip per run.
 */
export async function activeDirectoryGeneration(ctx: Pick<QueryCtx, 'db'>) {
  const state = await directoryState(ctx)
  if (state?.activeGeneration === undefined) return null
  const generation = await directoryGeneration(ctx, state.activeGeneration)
  return generation?.terminalObserved === true ? generation : null
}

export function directoryCoverage(row: Doc<'marketExternalRegistryGenerations'>): X402DirectoryIndexCoverage {
  return {
    source: 'coinbase', generation: row.generation, indexedTotal: row.ingestedCount,
    reportedTotal: row.sourceReportedLatest ?? 0, reportedTotalAtStart: row.sourceReportedInitial ?? 0,
    sourceChangedDuringScan: row.sourceReportedMinimum !== row.sourceReportedMaximum || (row.duplicateObservations ?? 0) > 0 || row.ingestedCount !== row.sourceReportedLatest,
    duplicateObservations: row.duplicateObservations ?? 0, pagesFetched: row.pagesFetched ?? 0,
    startedAt: row.startedAt, completedAt: row.completedAt ?? row.startedAt,
    completeness: 'completed_observed_scan',
  }
}

export function storedDirectoryEntry(row: Doc<'marketExternalRegistryEntries'>): DirectoryEntry {
  if (row.source !== 'coinbase' || row.directoryEntryJson === undefined || row.directorySourceJson === undefined) throw new Error('directory_entry_invalid')
  // The internal write validates this shape before persisting it. Source JSON
  // lives once in the row, rather than duplicating it inside the presentation.
  const entry = JSON.parse(row.directoryEntryJson) as DirectoryEntry
  const source: unknown = JSON.parse(row.directorySourceJson)
  const raw = isRecord(source) ? source : {}
  const extensions = isRecord(raw.extensions) ? raw.extensions : {}
  const bazaar = isRecord(extensions.bazaar) ? extensions.bazaar : {}
  const explicitTitle = [raw.title, raw.name, bazaar.title].find((value): value is string =>
    typeof value === 'string' && value.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim().length > 0)
  const description = typeof raw.description === 'string' ? raw.description : undefined
  const serviceName = typeof raw.serviceName === 'string' ? raw.serviceName : entry.serviceName
  // Reproject display text from the retained observation. No new source scan,
  // admission, index mutation or payment/contract reinterpretation is needed.
  const title = x402DirectoryFunctionalTitle({
    ...(explicitTitle === undefined ? {} : { explicitTitle }),
    ...(description === undefined ? {} : { description }),
    ...(serviceName === undefined ? {} : { serviceName }),
    fallback: entry.title,
  })
  return { ...entry, ...directorySourceLabels(raw), title, metadataJson: row.directorySourceJson }
}

export function indexedDirectoryEntry(row: Doc<'marketExternalRegistryEntries'>, search?: Doc<'marketDirectorySearchEntries'>): IndexedEntry {
  const stored = storedDirectoryEntry(row)
  const entry = search?.slug === undefined ? stored : { ...stored, slug: search.slug }
  // momentumBand/callDelta/payerDelta are no longer computed (Well 8 Lane B
  // dropped the previous-generation comparison they depended on - see
  // x402DirectoryIndexBackfill.ts). They stay optional here so legacy rows
  // that still carry a value from before that change keep rendering it,
  // without gating the whole analytics block on a field nothing writes
  // anymore.
  const analytics = search === undefined || search.depthBand === undefined || search.lastCalledBand === undefined ? undefined : {
    ...(search.payerDepth === undefined ? {} : { payerDepth: search.payerDepth }),
    depthBand: search.depthBand as DirectoryDepthBand,
    ...(search.lastActivatedAt === undefined ? {} : { lastActivatedAt: search.lastActivatedAt }),
    lastCalledBand: search.lastCalledBand as DirectoryRecencyBand,
    ...(search.callDelta === undefined ? {} : { callDelta: search.callDelta }),
    ...(search.payerDelta === undefined ? {} : { payerDelta: search.payerDelta }),
    ...(search.momentumBand === undefined ? {} : { momentumBand: search.momentumBand as DirectoryMomentumBand }),
  }
  return {
    entry, category: row.directoryCategory ?? 'uncategorized',
    categorySource: entry.category === undefined ? 'unclassified' : 'provider_declared',
    observedAt: row.updatedAt, sourceDigest: row.sourceDigest,
    ...(analytics === undefined ? {} : { analytics }),
  }
}
