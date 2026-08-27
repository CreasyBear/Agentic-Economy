import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

export const currentOperationReadMode = v.union(
  v.literal('old'),
  v.literal('shadow'),
  v.literal('new'),
)
export type CurrentOperationReadMode = 'old' | 'shadow' | 'new'

export const currentOperationMismatchKind = v.union(
  v.literal('missing_projection'),
  v.literal('stale_projection'),
  v.literal('typed_outcome'),
  v.literal('descriptor_digest'),
  v.literal('invalid_projection'),
  v.literal('orphan_projection'),
)
export type CurrentOperationMismatchKind =
  | 'missing_projection'
  | 'stale_projection'
  | 'typed_outcome'
  | 'descriptor_digest'
  | 'invalid_projection'
  | 'orphan_projection'

export const currentOperationProjectionRebuildReturns = v.object({
  kind: v.union(v.literal('rebuilt'), v.literal('deactivated'), v.literal('missing')),
  publicationRef: v.string(),
  publicationRevision: v.number(),
  outcomeKind: v.optional(v.union(v.literal('current'), v.literal('unavailable'), v.literal('dropped'))),
  operationRef: v.optional(v.string()),
  idempotent: v.boolean(),
})

export const currentOperationProjectionBackfillArgs = {
  paginationOpts: paginationOptsValidator,
} as const

export const currentOperationProjectionBackfillReturns = v.object({
  processed: v.number(),
  rebuilt: v.number(),
  dropped: v.number(),
  unavailable: v.number(),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

export const currentOperationReadControlReturns = v.object({
  mode: currentOperationReadMode,
  reason: v.string(),
  releaseOwner: v.string(),
  verifiedActiveCount: v.optional(v.number()),
  verifiedProjectionDigest: v.optional(v.string()),
  updatedAt: v.number(),
  isDefault: v.boolean(),
})

const mismatchCount = v.object({ kind: currentOperationMismatchKind, count: v.number() })
export const currentOperationShadowDiagnosticsReturns = v.object({
  kind: v.literal('current_operation_shadow_diagnostic'),
  schemaVersion: v.literal('current-operation-shadow-diagnostic:v1'),
  sourceCount: v.number(),
  projectionCount: v.number(),
  comparedCount: v.number(),
  explainedMismatchCount: v.number(),
  unexplainedMismatchCount: v.number(),
  truncated: v.boolean(),
  mismatches: v.array(mismatchCount),
})

export const currentOperationStagingSnapshotReturns = v.union(
  v.object({
    kind: v.literal('unavailable'),
    reason: v.literal('source_revision_unavailable'),
  }),
  v.object({
    kind: v.literal('current_operation_staging_snapshot'),
    schemaVersion: v.literal('current-operation-staging-snapshot:v1'),
    deploymentName: v.string(),
    sourceRevision: v.string(),
    sourceCount: v.number(),
    searchProjectionCount: v.number(),
    detailProjectionCount: v.number(),
    sourceSetDigest: v.string(),
    readinessSetDigest: v.string(),
    observedSinceCount: v.number(),
    unobservedSinceCount: v.number(),
    truncated: v.boolean(),
  }),
)


