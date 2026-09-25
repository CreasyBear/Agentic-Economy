import { type Infer } from 'convex/values'
import { parseFacilitatorDiscoverySourceImport } from '@/modules/capability-supply/convex'
import type { MutationCtx } from '../../../_generated/server'
import { parseWorkloadCronSnapshot } from '../../platform/workloadCron/context'
import { reconcileWorkloadCronSnapshot } from '../../platform/workloadCron/admission'
import { reconcileArgs, reconcileResult } from './contracts'
import { preservePublicationIdentity } from './identity'
import { currentPublication } from './publicationLifecycle'
import { reconcileDraft } from './publication'

const MAX_RECONCILE_ITEMS = 100
const MAX_RECONCILE_ITEM_BYTES = 262_144
const MAX_SEEN_PUBLICATION_REFS = 2_000
const MAX_PUBLICATION_REF_LENGTH = 240
const textEncoder = new TextEncoder()

export async function reconcileHandler(ctx: MutationCtx, args: Infer<typeof reconcileArgs>): Promise<Infer<typeof reconcileResult>> {
    await reconcileWorkloadCronSnapshot(
      ctx,
      args.workload.name,
      parseWorkloadCronSnapshot(args.workload),
    )
    if (
      args.items.length > MAX_RECONCILE_ITEMS
      || args.items.some((item) => {
        const serialized = JSON.stringify(item)
        return serialized === undefined
          || textEncoder.encode(serialized).byteLength > MAX_RECONCILE_ITEM_BYTES
      })
      || (args.seenPublicationRefs?.length ?? 0) > MAX_SEEN_PUBLICATION_REFS
      || args.seenPublicationRefs?.some((ref) => ref.length === 0 || ref.length > MAX_PUBLICATION_REF_LENGTH)
    ) {
      throw new Error('facilitator_discovery_batch_invalid')
    }
    if (!Number.isFinite(args.deadlineAt) || Date.now() >= args.deadlineAt) {
      return {
        admitted: 0,
        published: 0,
        skipped: 0,
        withdrawn: 0,
        seenPublicationRefs: [],
        toolRefs: [],
        deadlineExceeded: true,
      }
    }
    const toolRefs = new Set<string>()
    let published = 0
    let skipped = 0
    const seenPublicationRefs = new Set(args.seenPublicationRefs ?? [])
    const candidates = args.items.filter((item) => {
      if (parseFacilitatorDiscoverySourceImport(item.sourceImportJson) === undefined) {
        skipped += 1
        return false
      }
      return true
    })
    let deadlineExceeded = false
    if (Date.now() >= args.deadlineAt) deadlineExceeded = true
    for (const candidate of candidates) {
      const draft = await preservePublicationIdentity(ctx, candidate)
      if (deadlineExceeded) break
      if (Date.now() >= args.deadlineAt) {
        deadlineExceeded = true
        break
      }
      seenPublicationRefs.add(draft.offering.offeringId)
      const result = await reconcileDraft(ctx, draft, Date.now())
      if (result === 'published') published += 1
      if (result === 'skipped') skipped += 1
      const publication = await currentPublication(ctx, draft.offering.offeringId)
      if (publication !== undefined) toolRefs.add(publication.toolRef)
    }
    if (Date.now() >= args.deadlineAt) deadlineExceeded = true
    // Result pages are observations, never a complete inventory snapshot.
    const withdrawn = 0
    return {
      admitted: candidates.length,
      published,
      skipped,
      withdrawn,
      seenPublicationRefs: [...seenPublicationRefs].sort(),
      toolRefs: [...toolRefs],
      deadlineExceeded,
    }
}
