import { projectProviderToolStatus } from '@/modules/capability-supply/provider-tool-status'
import { qualifySuppliedCandidate } from '@/modules/capability-supply/public'
import { MAX_ACCESS_PATHS_PER_OFFERING } from '@/modules/catalog/public'
import { capabilitySupplyGraphPorts } from '../graphPorts/ports'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'

const EVIDENCE_WINDOW_MS = 30 * 24 * 60 * 60_000
const EVIDENCE_READ_LIMIT = 10_000

function sourceKind(sourceKind: Doc<'capabilityPublications'>['sourceKind'] | undefined) {
  if (sourceKind === 'openapi_http') return 'openapi' as const
  if (sourceKind === 'agent_plugin_mcp') return 'agent_plugin' as const
  if (sourceKind === 'ae_envelope') return 'legacy' as const
  return sourceKind ?? 'unavailable'
}

function projectedSourceKind(
  publicationKind: Doc<'capabilityPublications'>['sourceKind'] | undefined,
  draftKind: 'openapi' | 'mcp' | 'agent_plugin' | 'x402' | undefined,
) {
  return publicationKind === undefined ? draftKind ?? 'unavailable' : sourceKind(publicationKind)
}

export async function projectIdentity(
  ctx: MutationCtx | QueryCtx,
  identity: Doc<'capabilityProviderToolProjections'>,
  now: number,
  includeEvidence: boolean,
) {
  const [offering, revision, paths, publication, admissionCase, offboarding] = await Promise.all([
    ctx.db.query('businessOfferings').withIndex('by_offeringRef', (query) => query.eq('offeringRef', identity.offeringRef)).unique(),
    ctx.db.query('businessOfferingRevisions').withIndex('by_offeringRef_and_revision', (query) => query.eq('offeringRef', identity.offeringRef).eq('revision', identity.offeringRevision)).unique(),
    ctx.db.query('offeringAccessPaths').withIndex('by_offeringRef_and_offeringRevision', (query) => query.eq('offeringRef', identity.offeringRef).eq('offeringRevision', identity.offeringRevision)).take(MAX_ACCESS_PATHS_PER_OFFERING + 1),
    identity.publicationRef === undefined || identity.publicationRevision === undefined
      ? null
      : ctx.db.query('capabilityPublications').withIndex('by_publicationRef_and_revision', (query) => query.eq('publicationRef', identity.publicationRef as string).eq('revision', identity.publicationRevision as number)).unique(),
    identity.publicationRef === undefined || identity.publicationRevision === undefined
      ? null
      : ctx.db.query('capabilitySupplyAdmissionCases').withIndex('by_publicationRef_and_revision', (query) => query.eq('publicationRef', identity.publicationRef as string).eq('publicationRevision', identity.publicationRevision as number)).unique(),
    ctx.db.query('capabilityProviderOffboardingCases').withIndex('by_businessId_and_updatedAt', (query) => query.eq('businessId', identity.businessId)).order('desc').first(),
  ])
  if (offering === null || revision === null || offering.businessId !== identity.businessId || revision.businessId !== identity.businessId) return null
  const draft = paths.find((path) => path.integrationDraft !== undefined)?.integrationDraft
  const binding = identity.bindingId === undefined
    ? null
    : await ctx.db.query('capabilityTransportBindings').withIndex('by_bindingId', (query) => query.eq('bindingId', identity.bindingId as string)).unique()
  const connectionRef = publication?.connectionAuthority?.connectionRef ?? draft?.connectionRef
  const connection = connectionRef === undefined
    ? null
    : await ctx.db.query('capabilityProviderConnections').withIndex('by_connectionRef', (query) => query.eq('connectionRef', connectionRef)).unique()
  const qualification = publication === null || binding === null || identity.offeringId === undefined
    ? null
    : await qualifySuppliedCandidate(capabilitySupplyGraphPorts(ctx.db), {
        candidate: {
          publicationRef: publication.publicationRef,
          revision: publication.revision,
          networkId: publication.networkId,
          businessId: String(identity.businessId),
          offeringId: identity.offeringId,
          bindingId: binding.bindingId,
          contractRef: { capabilityId: publication.capabilityId, version: publication.version, contractDigest: publication.contractDigest },
        },
        now,
      })
  const windowStartAt = now - EVIDENCE_WINDOW_MS
  const [calls, qualifiedUses] = includeEvidence
    ? await Promise.all([
        ctx.db.query('capabilityCallProjections').withIndex('by_toolRef_and_createdAt', (query) => query.eq('toolRef', identity.toolRef).gte('createdAt', windowStartAt)).take(EVIDENCE_READ_LIMIT + 1),
        ctx.db.query('qualifiedUseReceipts').withIndex('by_toolRef_and_qualifiedAt', (query) => query.eq('toolRef', identity.toolRef).gte('qualifiedAt', windowStartAt)).take(EVIDENCE_READ_LIMIT + 1),
      ])
    : [[], []]
  const blockers = new Set<string>(admissionCase?.blockerRefs ?? [])
  for (const reason of qualification?.reasons ?? []) blockers.add(reason)
  if (publication?.sourceAuthorityState === 'review_required') blockers.add('provider_authority_unverified')
  if (connectionRef !== undefined && (connection === null || connection.lifecycle !== 'active' || (connection.expiresAt !== undefined && connection.expiresAt <= now))) blockers.add('credential_lost')
  const routeabilityFrozen = offboarding?.routeabilityFrozenAt !== undefined
  if (routeabilityFrozen) blockers.add('provider_offboarding')
  const routeable = qualification?.status === 'eligible' && !routeabilityFrozen
  const setupComplete = publication !== null || draft !== undefined
  const callsOverflow = calls.length > EVIDENCE_READ_LIMIT
  const usesOverflow = qualifiedUses.length > EVIDENCE_READ_LIMIT
  const boundedCalls = calls.slice(0, EVIDENCE_READ_LIMIT)
  const boundedUses = qualifiedUses.slice(0, EVIDENCE_READ_LIMIT)
  const status = projectProviderToolStatus({
    schemaVersion: 'provider_tools:v1',
    businessRef: String(identity.businessId),
    providerRef: identity.providerRef,
    toolRef: identity.toolRef,
    revision: identity.publicationRevision ?? identity.offeringRevision,
    observedAt: publication?.readinessObservedAt ?? draft?.updatedAt ?? identity.updatedAt,
    ...(publication?.readinessValidUntil === undefined ? {} : { validUntil: publication.readinessValidUntil }),
    draftPresent: true,
    setupComplete,
    submitted: admissionCase !== null || publication !== null,
    reviewActive: admissionCase?.state === 'submitted' || admissionCase?.state === 'under_review',
    routeable,
    paused: offering.status === 'paused' || publication?.disposition === 'withdrawn',
    retired: offering.status === 'retired' || offboarding?.state === 'retired',
    retirementProven: offboarding?.state === 'retired',
    blockerCodes: [...blockers],
    source: {
      kind: projectedSourceKind(publication?.sourceKind, draft?.sourceKind),
      ...((publication?.sourceRevision ?? draft?.sourceRevision) === undefined ? {} : { revision: publication?.sourceRevision ?? draft?.sourceRevision }),
      ...((publication?.sourceDigest ?? draft?.sourceDigest) === undefined ? {} : { digest: publication?.sourceDigest ?? draft?.sourceDigest }),
    },
    routeability: { available: routeable, reasonCodes: [...blockers] },
    authority: connectionRef === undefined
      ? publication?.sourceAuthorityState === 'verified' ? { kind: 'public' } : { kind: 'unverified' }
      : { kind: 'connection', connectionRef, providerRef: identity.providerRef },
    health: {
      connection: connectionRef === undefined ? 'not_required' : blockers.has('credential_lost') ? 'action_required' : 'connected',
      validation: admissionCase?.terminalDecision === 'published' ? 'passed' : admissionCase?.terminalDecision === 'action_required' ? 'failed' : admissionCase === null ? 'not_started' : 'in_progress',
      publication: offering.status === 'retired' ? 'removed' : offering.status === 'paused' || publication?.disposition === 'withdrawn' ? 'paused' : publication === null ? 'not_published' : 'published',
      freshness: publication?.readinessOutcome === 'healthy' && (publication.readinessValidUntil ?? 0) > now ? 'current' : publication?.readinessOutcome === undefined ? draft === undefined ? 'unobserved' : 'current' : (publication.readinessValidUntil ?? 0) <= now ? 'stale' : 'failed',
      delivery: callsOverflow
        ? { kind: 'unavailable', reason: 'window_too_large', provenance: 'canonical_call_receipts' }
        : boundedCalls.length === 0
          ? { kind: 'unobserved', provenance: 'canonical_call_receipts' }
          : { kind: 'observed', deliveredCount: boundedCalls.filter((row) => row.deliveryState === 'delivered').length, notDeliveredCount: boundedCalls.filter((row) => row.deliveryState === 'not_delivered').length, unknownCount: boundedCalls.filter((row) => row.deliveryState === 'unknown').length, sampleSize: boundedCalls.length, lastObservedAt: Math.max(...boundedCalls.map((row) => row.updatedAt)), windowStartAt, windowEndAt: now, provenance: 'canonical_call_receipts' },
      usefulOutcome: usesOverflow
        ? { kind: 'unavailable', reason: 'window_too_large', provenance: 'qualified_use_receipts' }
        : boundedUses.length === 0
          ? { kind: 'unobserved', provenance: 'qualified_use_receipts' }
          : { kind: 'observed', qualifiedUseCount: boundedUses.length, lastObservedAt: Math.max(...boundedUses.map((row) => row.qualifiedAt)), windowStartAt, windowEndAt: now, provenance: 'qualified_use_receipts' },
      operationalConditions: [...blockers],
    },
  })
  return status
}
