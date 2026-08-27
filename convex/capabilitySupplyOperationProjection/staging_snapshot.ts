import type { StableHashValue } from '@/modules/common/stable-hash'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { QueryCtx } from '../_generated/server'

export async function currentOperationStagingSnapshotHandler(
  ctx: QueryCtx,
  args: Readonly<{ now: number; observedSince?: number }>,
  sourceRevision: string | undefined,
) {
  if (sourceRevision === undefined || !/^[0-9a-f]{40}$/u.test(sourceRevision)) {
    return {
      kind: 'unavailable' as const,
      reason: 'source_revision_unavailable' as const,
    }
  }
  if (!Number.isSafeInteger(args.now)
    || args.now < 0
    || (args.observedSince !== undefined
      && (!Number.isSafeInteger(args.observedSince)
        || args.observedSince < 0
        || args.observedSince > args.now))) {
    throw new Error('current_operation_staging_snapshot_time_invalid')
  }
  const [deployment, publicationSentinel, searchSentinel, detailSentinel] = await Promise.all([
    ctx.meta.getDeploymentMetadata(),
    ctx.db.query('capabilityPublications')
      .withIndex('by_disposition_and_readinessValidUntil', (query) => query.eq('disposition', 'current'))
      .take(257),
    ctx.db.query('capabilityCurrentOperations')
      .withIndex('by_active_and_operationRef', (query) => query.eq('active', true))
      .take(257),
    ctx.db.query('capabilityCurrentOperationDetails')
      .withIndex('by_active_and_operationRef', (query) => query.eq('active', true))
      .take(257),
  ])
  const truncated = publicationSentinel.length === 257
    || searchSentinel.length === 257
    || detailSentinel.length === 257
  const publications = publicationSentinel.slice(0, 256)
  const searchRows = searchSentinel.slice(0, 256)
  const detailRows = detailSentinel.slice(0, 256)
  const observedSince = args.observedSince ?? 0
  const observedSinceCount = publications.filter((publication) => (
    publication.readinessObservedAt !== undefined
      && publication.readinessObservedAt >= observedSince
      && publication.readinessObservedAt <= args.now
  )).length
  const sourceMaterial = publications.map((publication) => ({
    operationRef: publication.operationRef,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    sourceDigest: publication.sourceDigest,
  })).sort((left, right) => left.operationRef.localeCompare(right.operationRef))
  const readinessMaterial = publications.map((publication) => ({
    operationRef: publication.operationRef,
    credentialState: publication.credentialState,
    healthState: publication.healthState,
    readinessObservedAt: publication.readinessObservedAt ?? null,
    readinessValidUntil: publication.readinessValidUntil ?? null,
    readinessTargetDigest: publication.readinessTargetDigest ?? null,
    readinessRequestDigest: publication.readinessRequestDigest ?? null,
    readinessResponseDigest: publication.readinessResponseDigest ?? null,
    readinessOutcome: publication.readinessOutcome ?? null,
  })).sort((left, right) => left.operationRef.localeCompare(right.operationRef))
  return {
    kind: 'current_operation_staging_snapshot' as const,
    schemaVersion: 'current-operation-staging-snapshot:v1' as const,
    deploymentName: deployment.name,
    sourceRevision,
    sourceCount: publications.length,
    searchProjectionCount: searchRows.length,
    detailProjectionCount: detailRows.length,
    sourceSetDigest: canonicalDigest(sourceMaterial as StableHashValue),
    readinessSetDigest: canonicalDigest(readinessMaterial as StableHashValue),
    observedSinceCount,
    unobservedSinceCount: publications.length - observedSinceCount,
    truncated,
  }
}

