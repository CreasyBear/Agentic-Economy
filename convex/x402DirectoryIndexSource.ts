'use node'

import { listX402DiscoveryResources } from '@coinbase/cdp-sdk'
import { v } from 'convex/values'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { isRecord } from '@/modules/common/is-record'
import { projectX402DirectoryEntry } from '@/modules/market/x402-directory-projection'
import { directoryNetwork } from '@/modules/market/x402-directory-index'
import { admitFacilitatorDiscoveryItems, admittedSourceRoute } from '@/modules/capability-supply/server'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import { parseWorkloadCronSnapshot, workloadCronSnapshotValue } from './lib/platform/workloadCron/context'
import { progressValue, type IndexedSource, type IndexProgress, type ListingAdmission } from './lib/market/directoryIndex/contracts'

const PAGE_SIZE = 100
const MAX_RAW_METADATA_BYTES = 256 * 1024
const MAX_ENTRY_BYTES = 768 * 1024
const encoder = new TextEncoder()

/** The decision Quote's resolve makes, and the route ref its publication will carry, from the same stored source JSON it reads. */
async function listingAdmission(sourceJson: string): Promise<{ admission: ListingAdmission; sourceRouteRef?: string }> {
  const { admitted, skipped } = await admitFacilitatorDiscoveryItems([JSON.parse(sourceJson)])
  const route = admitted[0] === undefined ? undefined : admittedSourceRoute(admitted[0])
  const admission: ListingAdmission = skipped[0] === undefined ? { kind: 'quotable' } : { kind: 'unavailable', reason: skipped[0].reason }
  return route === undefined ? { admission } : { admission, sourceRouteRef: route.sourceRouteRef }
}

/** Keep every endpoint visible even when optional source metadata exceeds a document budget. */
export async function prepareIndexedDirectorySource(resource: Readonly<Record<string, unknown>>): Promise<IndexedSource> {
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
  if (new Set(projected.prices.map(price => directoryNetwork(price.network))).size > 128) throw new Error('directory_network_metadata_invalid')
  const item: IndexedSource = {
    resource: resource.resource,
    entry: JSON.parse(JSON.stringify({ ...projected, metadataJson: '' })) as IndexedSource['entry'],
    sourceJson, sourceDigest: canonicalDigest(JSON.parse(raw) as StableHashValue),
    ...await listingAdmission(sourceJson),
  }
  if (encoder.encode(JSON.stringify(item)).byteLength > MAX_ENTRY_BYTES) throw new Error('directory_source_entry_invalid')
  return item
}

/** Reject only malformed external observations; never promote invalid payment metadata. */
export async function prepareIndexedDirectoryPage(sourceItems: readonly unknown[]) {
  const items: IndexedSource[] = []
  for (const item of sourceItems) {
    try {
      if (!isRecord(item)) throw new Error('directory_source_item_invalid')
      items.push(await prepareIndexedDirectorySource(item))
    } catch (cause) {
      console.error('[directory] skipping invalid discovery resource', { cause })
    }
  }
  return { items, skippedInvalidItems: sourceItems.length - items.length }
}

/** Read-only SDK discovery plus one transactional metadata commit; no Provider endpoint is called. */
export const page = internalAction({
  args: { generation: v.string(), offset: v.number(), runStartedAt: v.number(), workload: workloadCronSnapshotValue },
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
    const { items, skippedInvalidItems } = await prepareIndexedDirectoryPage(response.items)
    let progress: IndexProgress = { kind: 'advanced', generation: args.generation, nextOffset: args.offset, indexedTotal: checkpoint.indexedTotal }
    // Aggregate maintains its native tree transactionally; bounded sub-batches
    // keep its read budget independent of upstream page size and catalog depth.
    for (let startItem = 0; startItem < Math.max(1, items.length); startItem += 5) {
      progress = await ctx.runMutation(internal.x402DirectoryIndexStore.applyPage, {
        generation: args.generation, offset: args.offset, reportedTotal,
        items: items.slice(startItem, startItem + 5), startItem, totalItems: items.length,
        ...(skippedInvalidItems === 0 ? {} : { skippedInvalidItems }),
        observedAt: Date.now(), runStartedAt: args.runStartedAt, workload: args.workload,
      })
      if (progress.kind !== 'advanced') break
    }
    return progress
  },
})
