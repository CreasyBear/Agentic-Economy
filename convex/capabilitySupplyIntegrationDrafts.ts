import { v, type Infer } from 'convex/values'

import {
  normalizeSupplyIntegrationDraft,
  supplyIntegrationDraftRefs,
} from '@/modules/capability-supply/integration-draft'
import {
  beginOperation,
  replayOperationResult,
  succeedOperation,
} from '@/modules/capability-supply/public'
import { brandNonEmpty } from '@/modules/common/ids'
import {
  createOfferingInState,
  upsertAccessPathInState,
} from '@/modules/catalog/public'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { agentAccessPrincipalValue, verifySupplyAgentPrincipal } from './agentAccessPrincipals'
import { resolveBusinessActor } from './authz'
import { ownsPublishedBusinessForOwnerId, publicationPorts } from './capabilitySupply'
import {
  loadOfferingSourceState,
  persistOfferingSourceState,
} from './catalogOfferingMutations'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'

const sourceKindValue = v.union(
  v.literal('openapi'),
  v.literal('mcp'),
  v.literal('agent_plugin'),
  v.literal('x402'),
)
const integrationDraftValue = v.object({
  sourceKind: sourceKindValue,
  sourceDescriptorJson: v.string(),
  sourceDigest: v.string(),
  sourceRevision: v.string(),
  candidateRef: v.string(),
  sourceSelectorJson: v.string(),
  connectionRef: v.optional(v.string()),
  validationInputJson: v.optional(v.string()),
  updatedAt: v.number(),
})

export const saveAgentSupplyIntegrationDraftArgsValue = v.object({
  businessId: v.id('businesses'),
  title: v.string(),
  description: v.string(),
  category: v.string(),
  sourceKind: sourceKindValue,
  sourceDescriptorJson: v.string(),
  sourceDigest: v.string(),
  sourceRevision: v.string(),
  candidateRef: v.string(),
  sourceSelectorJson: v.string(),
  connectionRef: v.optional(v.string()),
  validationInputJson: v.optional(v.string()),
  operationKey: v.string(),
  correlationId: v.string(),
  agentPrincipal: agentAccessPrincipalValue,
  ...sourceWriteArgs,
})
export const saveOwnerSupplyIntegrationDraftArgsValue = v.object({
  businessId: v.id('businesses'),
  title: v.string(),
  description: v.string(),
  category: v.string(),
  sourceKind: sourceKindValue,
  sourceDescriptorJson: v.string(),
  sourceDigest: v.string(),
  sourceRevision: v.string(),
  candidateRef: v.string(),
  sourceSelectorJson: v.string(),
  connectionRef: v.optional(v.string()),
  validationInputJson: v.optional(v.string()),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
export const saveAgentSupplyIntegrationDraftResultValue = v.union(
  v.object({
    kind: v.union(v.literal('saved'), v.literal('replayed')),
    offeringRef: v.string(),
    accessPathRef: v.string(),
    candidateRef: v.string(),
    sourceDigest: v.string(),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authorization_denied'),
      v.literal('draft_invalid'),
      v.literal('source_contains_credential'),
      v.literal('candidate_changed'),
      v.literal('operation_key_conflict'),
      v.literal('draft_unavailable'),
    ),
  }),
)
export const readOwnerSupplyIntegrationDraftResultValue = v.union(
  v.object({ kind: v.literal('not_found') }),
  v.object({
    kind: v.literal('available'),
    offeringRef: v.string(),
    accessPathRef: v.string(),
    draft: integrationDraftValue,
  }),
)

type SaveArgs = Infer<typeof saveAgentSupplyIntegrationDraftArgsValue>
type OwnerSaveArgs = Infer<typeof saveOwnerSupplyIntegrationDraftArgsValue>
type SaveResult = Infer<typeof saveAgentSupplyIntegrationDraftResultValue>

export async function saveAgentSupplyIntegrationDraftHandler(
  ctx: MutationCtx,
  args: SaveArgs,
): Promise<SaveResult> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused', reason: 'authorization_denied' }
  const admission = await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, true)
  if (
    admission.kind !== 'allowed'
    || !(await ownsPublishedBusinessForOwnerId(ctx, args.businessId, admission.ownerId))
  ) {
    return { kind: 'refused', reason: 'authorization_denied' }
  }

  return await saveSupplyIntegrationDraft(ctx, args, admission.principalId)
}

export async function saveOwnerSupplyIntegrationDraftHandler(
  ctx: MutationCtx,
  args: OwnerSaveArgs,
): Promise<SaveResult> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused', reason: 'authorization_denied' }
  const actor = await resolveBusinessActor(ctx)
  const business = await ctx.db.get(args.businessId)
  if (
    actor.kind !== 'authenticated_owner'
    || business === null
    || business.owningAccountRef !== actor.canonicalAccountRef
  ) {
    return { kind: 'refused', reason: 'authorization_denied' }
  }

  return await saveSupplyIntegrationDraft(ctx, args, actor.canonicalPrincipalRef)
}

async function saveSupplyIntegrationDraft(
  ctx: MutationCtx,
  args: SaveArgs | OwnerSaveArgs,
  actorPrincipalRef: string,
): Promise<SaveResult> {

  const now = Date.now()
  const normalized = normalizeSupplyIntegrationDraft({
    sourceKind: args.sourceKind,
    sourceDescriptorJson: args.sourceDescriptorJson,
    sourceDigest: args.sourceDigest,
    sourceRevision: args.sourceRevision,
    candidateRef: args.candidateRef,
    sourceSelectorJson: args.sourceSelectorJson,
    ...(args.connectionRef === undefined ? {} : { connectionRef: args.connectionRef }),
    ...(args.validationInputJson === undefined ? {} : { validationInputJson: args.validationInputJson }),
    updatedAt: now,
  })
  if (normalized.kind === 'refused') return normalized

  const refs = supplyIntegrationDraftRefs(String(args.businessId), args.candidateRef)
  const { updatedAt: _updatedAt, ...durableDraftInput } = normalized.draft
  const expected = {
    kind: 'saved' as const,
    ...refs,
    candidateRef: args.candidateRef,
    sourceDigest: args.sourceDigest,
  }
  const operation = await beginOperation(
    publicationPorts(ctx),
    { kind: 'owner', ref: actorPrincipalRef },
    'saveSupplyIntegrationDraft',
    {
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      reasonCode: 'supply.source.selected',
      evidenceRefs: [args.sourceDigest, args.candidateRef],
    },
    {
      version: 'supply-integration-draft:v1',
      businessId: String(args.businessId),
      title: args.title,
      description: args.description,
      category: args.category,
      draft: durableDraftInput,
    },
    now,
  )
  if (operation.kind === 'conflict') return { kind: 'refused', reason: 'operation_key_conflict' }
  if (operation.kind === 'replay') {
    replayOperationResult(operation, expected)
    return { ...expected, kind: 'replayed' }
  }

  const initial = await loadOfferingSourceState(ctx.db, args.businessId)
  let next = initial
  const existingOffering = initial.offerings.find((item) => item.offeringRef === refs.offeringRef)
  if (existingOffering === undefined) {
    const created = createOfferingInState(initial, {
      authority: {
        actorRef: actorPrincipalRef,
        ownerRef: actorPrincipalRef,
        businessOwnerRef: actorPrincipalRef,
      },
      operationKey: `${args.operationKey}:offering`,
      businessId: brandNonEmpty(String(args.businessId), 'BusinessId'),
      offeringRef: brandNonEmpty(refs.offeringRef, 'OfferingRef'),
      facts: { name: args.title, category: args.category, summary: args.description },
      now,
    })
    if (created.kind === 'error') return { kind: 'refused', reason: 'draft_unavailable' }
    next = created.state
  } else if (existingOffering.status === 'retired') {
    return { kind: 'refused', reason: 'draft_unavailable' }
  }

  const offering = next.offerings.find((item) => item.offeringRef === refs.offeringRef)
  if (offering === undefined) return { kind: 'refused', reason: 'draft_unavailable' }
  const existingPath = next.accessPaths.find((item) => item.accessPathRef === refs.accessPathRef)
  if (existingPath === undefined) {
    const added = upsertAccessPathInState(next, {
      authority: {
        actorRef: actorPrincipalRef,
        ownerRef: actorPrincipalRef,
        businessOwnerRef: actorPrincipalRef,
      },
      operationKey: `${args.operationKey}:access-path`,
      accessPathRef: brandNonEmpty(refs.accessPathRef, 'AccessPathRef'),
      offeringRef: brandNonEmpty(refs.offeringRef, 'OfferingRef'),
      expectedRevision: offering.currentRevision,
      status: 'draft',
      descriptor: {
        kind: 'external_operation',
        name: args.title,
        summary: args.description,
        url: normalized.targetUrl,
        ...(normalized.method === undefined ? {} : { method: normalized.method }),
        interfaceDescription: {
          format: args.sourceKind === 'agent_plugin' ? 'agent-plugin-1.0' : args.sourceKind,
          ...(args.sourceKind === 'openapi' ? { url: normalized.targetUrl } : {}),
        },
        authenticationSummary: normalized.draft.connectionRef === undefined ? 'Public source' : 'Connected source',
        provenance: 'business_declared',
      },
      now,
    })
    if (added.kind === 'error') return { kind: 'refused', reason: 'draft_unavailable' }
    next = added.state
  }

  const persisted = await persistOfferingSourceState(ctx.db, args.businessId, initial, next, 'owner')
  if (persisted.kind === 'error') return { kind: 'refused', reason: 'draft_unavailable' }
  const path = await ctx.db.query('offeringAccessPaths')
    .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', refs.accessPathRef))
    .unique()
  if (path === null || path.businessId !== args.businessId) {
    return { kind: 'refused', reason: 'draft_unavailable' }
  }
  await ctx.db.patch(path._id, {
    integrationDraft: normalized.draft,
    integrationDraftUpdatedAt: normalized.draft.updatedAt,
  })
  await succeedOperation(publicationPorts(ctx), operation.operationId, expected, [refs.offeringRef, refs.accessPathRef], now)
  return expected
}

export async function readOwnerSupplyIntegrationDraftHandler(
  ctx: QueryCtx,
  args: Readonly<{ businessId: SaveArgs['businessId']; candidateRef: string }>,
): Promise<Infer<typeof readOwnerSupplyIntegrationDraftResultValue>> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'not_found' }
  const business = await ctx.db.get(args.businessId)
  if (business === null || business.owningAccountRef !== actor.canonicalAccountRef) return { kind: 'not_found' }
  const refs = supplyIntegrationDraftRefs(String(args.businessId), args.candidateRef)
  const path = await ctx.db.query('offeringAccessPaths')
    .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', refs.accessPathRef))
    .unique()
  if (path === null || path.businessId !== args.businessId || path.integrationDraft === undefined) {
    return { kind: 'not_found' }
  }
  return {
    kind: 'available',
    offeringRef: refs.offeringRef,
    accessPathRef: refs.accessPathRef,
    draft: path.integrationDraft,
  }
}
