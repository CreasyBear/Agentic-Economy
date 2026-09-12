'use node'

import { listX402DiscoveryResources } from '@coinbase/cdp-sdk'
import { v } from 'convex/values'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { isRecord } from '@/modules/common/is-record'
import { projectX402DirectoryEntry } from '@/modules/market/x402-directory.server'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { parseWorkloadCronSnapshot, workloadCronSnapshotValue } from './workloadCron'
import { progressValue, type IndexedSource, type IndexProgress } from './lib/x402DirectoryIndex/contracts'

const PAGE_SIZE = 100
const MAX_RAW_METADATA_BYTES = 256 * 1024
const encoder = new TextEncoder()

/** Keep every endpoint visible even when optional source metadata exceeds a document budget. */
export function prepareIndexedDirectorySource(resource: Readonly<Record<string, unknown>>): IndexedSource {
  if (typeof resource.resource !== 'string' || resource.resource.length === 0 || resource.resource.length > 8192) throw new Error('directory_resource_identity_invalid')
  const raw = JSON.stringify(resource)
  let sourceJson = raw
  if (encoder.encode(raw).byteLength > MAX_RAW_METADATA_BYTES) {
    sourceJson = JSON.stringify({
      resource: resource.resource, type: resource.type, x402Version: resource.x402Version,
      description: typeof resource.description === 'string' ? resource.description.slice(0, 1600) : undefined,
      serviceName: typeof resource.serviceName === 'string' ? resource.serviceName.slice(0, 140) : undefined,
      lastUpdated: resource.lastUpdated, quality: resource.quality,
      accepts: Array.isArray(resource.accepts) ? resource.accepts.filter(isRecord).map(({ outputSchema: _outputSchema, ...price }) => price) : [],
      metadataOmitted: true,
      originalMetadataBytes: encoder.encode(raw).byteLength,
    })
    if (encoder.encode(sourceJson).byteLength > MAX_RAW_METADATA_BYTES) throw new Error('directory_payment_metadata_too_large')
  }
  const projected = projectX402DirectoryEntry(resource)
  return {
    resource: resource.resource,
    entry: JSON.parse(JSON.stringify({ ...projected, metadataJson: '' })) as IndexedSource['entry'],
    sourceJson, sourceDigest: canonicalDigest(JSON.parse(raw) as StableHashValue),
  }
}

/**
 * Cheapest available upstream change signal: one discovery call with limit 1
 * (no metadata parsing, no writes) returning the source's reported total.
 * Used by x402DirectoryIndexRefresh.start to skip a full re-index when
 * nothing changed (see cost comment there).
 */
export const probeTotal = internalAction({
  args: {},
  returns: v.number(),
  handler: async () => {
    const response = await listX402DiscoveryResources({ limit: 1, offset: 0 })
    const total = response.pagination.total
    if (total === undefined || !Number.isSafeInteger(total) || total < 0) throw new Error('directory_probe_invalid')
    return total
  },
})

/** Read-only SDK discovery plus one transactional metadata commit; no Provider endpoint is called. */
export const page = internalAction({
  args: { generation: v.string(), offset: v.number(), workload: workloadCronSnapshotValue },
  returns: progressValue,
  handler: async (ctx, args): Promise<IndexProgress> => {
    await ctx.runQuery(internal.workloadCron.reconcile, { name: 'refresh Agentic Economy API registry', snapshot: parseWorkloadCronSnapshot(args.workload) })
    const checkpoint = await ctx.runQuery(internal.x402DirectoryIndexStore.checkpoint, { generation: args.generation })
    if (checkpoint === null || checkpoint.status === 'failed') return { kind: 'stale', generation: args.generation, nextOffset: checkpoint?.nextOffset ?? 0, indexedTotal: checkpoint?.indexedTotal ?? 0 }
    if (checkpoint.status === 'complete') return { kind: 'complete', generation: args.generation, nextOffset: checkpoint.nextOffset, indexedTotal: checkpoint.indexedTotal }
    if (checkpoint.nextOffset > args.offset) return { kind: 'advanced', generation: args.generation, nextOffset: checkpoint.nextOffset, indexedTotal: checkpoint.indexedTotal }
    if (checkpoint.nextOffset !== args.offset) throw new Error('directory_scan_position_invalid')
    const response = await listX402DiscoveryResources({ limit: PAGE_SIZE, offset: args.offset })
    const reportedTotal = response.pagination.total
    if (response.pagination.offset !== args.offset || response.pagination.limit !== PAGE_SIZE
      || reportedTotal === undefined || !Number.isSafeInteger(reportedTotal) || reportedTotal < 0
      || !Array.isArray(response.items) || response.items.length > PAGE_SIZE) throw new Error('directory_source_page_invalid')
    const items = response.items.map(item => {
      if (!isRecord(item)) throw new Error('directory_source_page_invalid')
      return prepareIndexedDirectorySource(item)
    })
    let progress: IndexProgress = { kind: 'advanced', generation: args.generation, nextOffset: args.offset, indexedTotal: checkpoint.indexedTotal }
    // Aggregate maintains its native tree transactionally; bounded sub-batches
    // keep its read budget independent of upstream page size and catalog depth.
    for (let startItem = 0; startItem < Math.max(1, items.length); startItem += 5) {
      progress = await ctx.runMutation(internal.x402DirectoryIndexStore.applyPage, {
        generation: args.generation, offset: args.offset, reportedTotal,
        items: items.slice(startItem, startItem + 5), startItem, totalItems: items.length,
        observedAt: Date.now(), workload: args.workload,
      })
      if (progress.kind !== 'advanced') break
    }
    return progress
  },
})
