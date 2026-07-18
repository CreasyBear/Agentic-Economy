import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { projectActionPreparation } from '@/modules/customer-request/action-preparation'

import {
  preparationIntegrityValid,
  samePreparationProjectionIdentity,
} from './integrity'
import type { CustomerRequestV2PreparationPorts } from './ports'
import type {
  ResumeActionPreparationArgs,
  ResumeActionPreparationResult,
} from './types'

export async function resumeActionPreparation(
  args: ResumeActionPreparationArgs,
  ports: CustomerRequestV2PreparationPorts,
): Promise<ResumeActionPreparationResult> {
  const row = await ports.loadActionPreparation({
    requestId: args.requestId,
    requestRevision: args.requestRevision,
    actionId: args.actionId,
  })
  if (row === null || row.lineage.principalId !== args.principalId) {
    return { kind: 'not_found' }
  }
  const head = await ports.loadRequestHead(args.requestId)
  if (head === null || head.currentRevision !== args.requestRevision) {
    return { kind: 'stale' }
  }
  const revision = await ports.loadVerifiedRevision({
    requestId: args.requestId,
    requestRevision: args.requestRevision,
    expectedAggregateDigest: head.currentAggregateDigest,
  })
  const action = revision.aggregate.plan.actions.find((candidate) => candidate.actionId === args.actionId)
  if (action === undefined) return { kind: 'stale' }
  const model = await ports.loadActionCapabilityModel(revision.aggregate, action)
  if (model === undefined) return { kind: 'stale' }
  const projected = projectActionPreparation({
    aggregate: revision.aggregate,
    actionId: args.actionId,
    model,
    now: row.recordedAt,
  })
  if (projected.kind === 'stale' || projected.kind === 'refused'
    || !samePreparationProjectionIdentity(row.preparation, projected)) {
    return { kind: 'stale' }
  }
  if (row.preparationDigest !== row.preparation.preparationDigest
    || canonicalDigest(row.lineage as StableHashValue)
      !== canonicalDigest(row.preparation.lineage as StableHashValue)
    || !preparationIntegrityValid(row.preparation)) {
    throw new Error('customer_request_v2_preparation_integrity_failure')
  }
  return { kind: 'current', preparation: structuredClone(row.preparation) }
}
