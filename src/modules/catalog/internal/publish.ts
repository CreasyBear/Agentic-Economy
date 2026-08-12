import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { buildOfferingSupplyProjection, validateServiceCatalogInput } from './catalog-model'
import {
  type OfferingSourceState,
} from './offering-source'
import { reconcilePublishedOfferings } from './publish-reconcile'
import type {
  PublishBusinessCatalogCommand,
  PublishBusinessCatalogResult,
  PublishBusinessCatalogState,
  ValidatedServiceCatalogInput,
} from './catalog-model'
import type { DiscoveryManifestAttemptContract } from '@/modules/discovery/public'
import type { RegistryProjectionAttemptContract } from '@/modules/registry/public'
import { projectBusinessSupplyToPublicApi } from '@/modules/registry/public'
import {
  markOperationSucceeded,
  reserveOperationKey,
  validateAuditEvent,
} from '@/modules/observability/public'
import type {
  AuditEventContract,
  OperationKeyInput,
  OperationKeyRecord,
  OperationKeyStore,
} from '@/modules/observability/public'
import { assertCsrf } from '@/modules/security/public'

export function publishBusinessCatalog(
  state: PublishBusinessCatalogState,
  command: PublishBusinessCatalogCommand
): PublishBusinessCatalogResult {
  const csrfDecision = assertCsrf(command.security.csrf)
  if (csrfDecision.kind === 'rejected') {
    return {
      kind: 'error',
      code: 'catalog_publish_csrf_rejected',
      retryable: false,
      reason: csrfDecision.reason,
    }
  }

  if (command.actor.kind === 'anonymous') {
    return {
      kind: 'error',
      code: 'catalog_publish_unauthenticated',
      retryable: false,
      reason: 'Authentication is required to publish a business catalog.',
    }
  }

  const claim = state.claims.find((candidate) => candidate.claimId === command.claimId)
  if (claim === undefined) {
    return {
      kind: 'error',
      code: 'catalog_publish_claim_not_found',
      retryable: false,
      reason: 'Claim was not found.',
    }
  }

  if (claim.status === 'contested' || claim.status === 'disputed') {
    return {
      kind: 'error',
      code: 'catalog_publish_pending_review',
      retryable: false,
      reason: 'Claim must finish review before publishing.',
    }
  }

  const owner = state.owners.find((candidate) => candidate.ownerId === claim.ownerId)
  if (owner === undefined || owner.clerkUserId !== command.actor.clerkUserId) {
    return {
      kind: 'error',
      code: 'catalog_publish_wrong_owner',
      retryable: false,
      reason: 'Only the source-bound owner can publish this catalog.',
    }
  }

  const business = state.businesses.find((candidate) => candidate.businessId === claim.businessId)
  const context = state.businessContexts.find((candidate) => candidate.businessId === claim.businessId)
  if (business === undefined || context === undefined) {
    return {
      kind: 'error',
      code: 'catalog_publish_claim_not_found',
      retryable: false,
      reason: 'Claim source state is incomplete.',
    }
  }

  const serviceValidation = validateServiceCatalogInput(command.services)
  if (serviceValidation.kind === 'invalid') {
    return {
      kind: 'error',
      code: 'catalog_publish_invalid_services',
      retryable: false,
      reason: serviceValidation.reason,
    }
  }

  const requestHash = canonicalDigest({
    claimId: command.claimId,
    services: serviceValidation.services.map((service) => ({
      category: service.category,
      firstRequest: {
        mode: service.firstRequest.mode,
        noContactReason: service.firstRequest.noContactReason ?? '',
        publicChannel: service.firstRequest.publicChannel,
        publicDisclosure: service.firstRequest.publicDisclosure,
      },
      name: service.name,
      serviceArea: service.serviceArea,
      summary: service.summary,
    })),
  })
  const candidateState = clonePublishState(state)
  const candidateBusiness = candidateState.businesses.find((item) => item.businessId === business.businessId)
  const candidateClaim = candidateState.claims.find((item) => item.claimId === claim.claimId)
  if (candidateBusiness === undefined || candidateClaim === undefined) {
    return {
      kind: 'error',
      code: 'catalog_publish_claim_not_found',
      retryable: false,
      reason: 'Claim source state is incomplete.',
    }
  }

  const operationStore = new ArrayOperationKeyStore(candidateState.operationKeys)
  const operationInput: OperationKeyInput = {
    scope: 'catalog',
    actorKind: 'owner',
    actorRef: owner.ownerId,
    operationName: 'publishBusinessCatalog',
    key: command.operationKey,
    requestHash,
    sourceHash: business.sourceHash,
    now: command.now,
  }
  const operationDecision = reserveOperationKey(operationStore, operationInput, operationStore)
  if (operationDecision.kind === 'error') {
    return {
      kind: 'error',
      code: 'catalog_publish_operation_conflict',
      retryable: false,
      reason: operationDecision.reason,
    }
  }
  const replayed = operationDecision.code === 'operation_replayed'

  if (!replayed) {
    applyPublishState(candidateState, candidateBusiness, candidateClaim, serviceValidation.services, command.operationKey, command.now)
  }

  const candidateContext = candidateState.businessContexts.find((item) => item.businessId === candidateBusiness.businessId)
  if (candidateContext === undefined) {
    return {
      kind: 'error',
      code: 'catalog_publish_claim_not_found',
      retryable: false,
      reason: 'Claim source state is incomplete.',
    }
  }

  const projection = buildOfferingSupplyProjection({
    business: candidateBusiness,
    context: candidateContext,
    offerings: candidateState.offerings.filter((offering) => offering.businessId === candidateBusiness.businessId),
    revisions: candidateState.revisions.filter((revision) => revision.businessId === candidateBusiness.businessId),
    accessPaths: candidateState.accessPaths.filter((path) => path.businessId === candidateBusiness.businessId),
    indexStatus: 'queued',
    discoveryStatus: 'degraded',
    observedAt: command.now,
  })
  if (projection === undefined) {
    return {
      kind: 'error',
      code: 'catalog_publish_invalid_services',
      retryable: false,
      reason: 'no_published_offerings',
    }
  }
  const catalog = projectBusinessSupplyToPublicApi(projection, command.now)

  const auditEvent = ensurePublishAuditEvent(candidateState, candidateBusiness, command, replayed)
  const registryAttempts = ensureRegistryAttempts(candidateState, candidateBusiness.businessId, candidateBusiness.sourceHash, command.now)
  const discoveryAttempts = ensureDiscoveryAttempts(candidateState, candidateBusiness.businessId, candidateBusiness.sourceHash, command.now)

  if (!replayed) {
    const resultHash = canonicalDigest({
      auditEventId: auditEvent.eventId,
      businessId: candidateBusiness.businessId,
      registryAttempts: registryAttempts.map((attempt) => attempt.logicalKey),
      slug: candidateBusiness.slug,
    })
    const succeeded = markOperationSucceeded(
      operationDecision.record,
      resultHash,
      [
        auditEvent.eventId,
        ...registryAttempts.map((attempt) => attempt.logicalKey),
        ...discoveryAttempts.map((attempt) => attempt.attemptId),
      ],
      command.now,
    )
    operationStore.save(succeeded)
  }

  commitPublishState(state, candidateState)

  return {
    kind: 'ok',
    code: replayed ? 'catalog_publish_replayed' : 'catalog_published',
    business: state.businesses.find((item) => item.businessId === business.businessId) ?? business,
    claim: state.claims.find((item) => item.claimId === claim.claimId) ?? claim,
    catalog,
    auditEvent,
    registryProjectionAttempts: registryAttempts,
    discoveryManifestAttempts: discoveryAttempts,
  }
}

function clonePublishState(state: PublishBusinessCatalogState): PublishBusinessCatalogState {
  return {
    ...state,
    owners: [...state.owners],
    businesses: state.businesses.map((business) => ({ ...business })),
    businessContexts: [...state.businessContexts],
    claims: state.claims.map((claim) => ({ ...claim })),
    claimFingerprints: state.claimFingerprints.map((fingerprint) => ({ ...fingerprint })),
    offerings: [...state.offerings],
    revisions: [...state.revisions],
    accessPaths: [...state.accessPaths],
    operationKeys: state.operationKeys.map((record) => ({ ...record, effectRefs: [...record.effectRefs] })),
    auditEvents: [...state.auditEvents],
    registryProjectionAttempts: [...state.registryProjectionAttempts],
    discoveryManifestAttempts: [...state.discoveryManifestAttempts],
  }
}

function commitPublishState(state: PublishBusinessCatalogState, candidate: PublishBusinessCatalogState): void {
  for (const nextBusiness of candidate.businesses) {
    const currentBusiness = state.businesses.find((business) => business.businessId === nextBusiness.businessId)
    if (currentBusiness !== undefined) Object.assign(currentBusiness, nextBusiness)
  }
  for (const nextClaim of candidate.claims) {
    const currentClaim = state.claims.find((claim) => claim.claimId === nextClaim.claimId)
    if (currentClaim !== undefined) Object.assign(currentClaim, nextClaim)
  }
  state.offerings.splice(0, state.offerings.length, ...candidate.offerings)
  state.revisions.splice(0, state.revisions.length, ...candidate.revisions)
  state.accessPaths.splice(0, state.accessPaths.length, ...candidate.accessPaths)
  state.operationKeys.splice(0, state.operationKeys.length, ...candidate.operationKeys)
  state.auditEvents.splice(0, state.auditEvents.length, ...candidate.auditEvents)
  state.registryProjectionAttempts.splice(0, state.registryProjectionAttempts.length, ...candidate.registryProjectionAttempts)
  state.discoveryManifestAttempts.splice(0, state.discoveryManifestAttempts.length, ...candidate.discoveryManifestAttempts)
}

function applyPublishState(
  state: PublishBusinessCatalogState,
  business: PublishBusinessCatalogState['businesses'][number],
  claim: PublishBusinessCatalogState['claims'][number],
  services: readonly ValidatedServiceCatalogInput[],
  operationKey: string,
  now: number,
): void {
  business.publicStatus = 'published'
  business.claimStatus = 'published'
  business.updatedAt = now
  claim.status = 'published'
  claim.updatedAt = now

  let source: OfferingSourceState = {
    offerings: state.offerings,
    revisions: state.revisions,
    accessPaths: state.accessPaths,
    operations: [],
  }
  const reconcile = reconcilePublishedOfferings(source, {
    businessId: business.businessId,
    authority: {
      actorRef: business.ownerId,
      ownerRef: business.ownerId,
      businessOwnerRef: business.ownerId,
    },
    services,
    operationKey,
    now,
  })
  if (reconcile.kind === 'error') throw new Error(reconcile.reason)
  source = reconcile.state
  state.offerings.splice(0, state.offerings.length, ...source.offerings)
  state.revisions.splice(0, state.revisions.length, ...source.revisions)
  state.accessPaths.splice(0, state.accessPaths.length, ...source.accessPaths)
}

function ensurePublishAuditEvent(
  state: PublishBusinessCatalogState,
  business: PublishBusinessCatalogState['businesses'][number],
  command: PublishBusinessCatalogCommand,
  replayed: boolean
): AuditEventContract {
  const eventId = brandNonEmpty(`audit:claim.published:${business.businessId}:${command.operationKey}`, 'AuditEventId')
  const existing = state.auditEvents.find((event) => event.eventId === eventId)
  if (existing !== undefined) {
    return existing
  }

  const redactedPayload = {
    replayed,
    slug: business.slug,
  }
  const validation = validateAuditEvent({
    eventId,
    eventType: 'claim.published',
    actorKind: 'owner',
    actorRef: business.ownerId,
    targetType: 'business',
    targetRef: business.businessId,
    businessId: business.businessId,
    idempotencyKey: command.operationKey,
    correlationId: command.correlationId,
    beforeState: 'authenticated',
    afterState: 'published',
    redactedPayload,
    payloadHash: canonicalDigest(redactedPayload),
    createdAt: command.now,
  })

  if (!validation.valid) {
    throw new Error(`Invalid publish audit event: ${validation.reason}`)
  }

  state.auditEvents.push(validation.event)
  return validation.event
}

function ensureRegistryAttempts(
  state: PublishBusinessCatalogState,
  businessId: PublishBusinessCatalogState['businesses'][number]['businessId'],
  sourceHash: PublishBusinessCatalogState['businesses'][number]['sourceHash'],
  now: number,
): readonly RegistryProjectionAttemptContract[] {
  return [upsertRegistryAttempt(state.registryProjectionAttempts, {
    businessId,
    logicalKey: `registry:business:${businessId}:${sourceHash}`,
    sourceHash,
    sourceVersion: 'public-catalog:v1',
    projectionKind: 'business_catalog',
    status: 'queued',
    retryCount: 0,
    startedAt: now,
    repairAction: 'rebuild_projection',
    repairResult: 'not_run',
  })]
}

function ensureDiscoveryAttempts(
  state: PublishBusinessCatalogState,
  businessId: PublishBusinessCatalogState['businesses'][number]['businessId'],
  sourceHash: PublishBusinessCatalogState['businesses'][number]['sourceHash'],
  now: number
): readonly DiscoveryManifestAttemptContract[] {
  const attempt = upsertDiscoveryAttempt(state.discoveryManifestAttempts, {
    attemptId: `discovery:manifest:${businessId}:${sourceHash}:v1`,
    businessId,
    ucpVersion: 'v1',
    pathKind: 'ae_hosted_fallback',
    sourceHash,
    sourceVersion: 'public-catalog:v1',
    status: 'queued',
    retryCount: 0,
    startedAt: now,
    repairAction: 'regenerate_manifest',
    repairResult: 'not_run',
  })

  return [attempt]
}

function upsertRegistryAttempt(
  records: RegistryProjectionAttemptContract[],
  next: RegistryProjectionAttemptContract,
): RegistryProjectionAttemptContract {
  const existing = records.find((record) => record.logicalKey === next.logicalKey)
  if (existing !== undefined) return existing
  records.push(next)
  return next
}

function upsertDiscoveryAttempt(
  records: DiscoveryManifestAttemptContract[],
  next: DiscoveryManifestAttemptContract,
): DiscoveryManifestAttemptContract {
  const existing = records.find((record) => record.attemptId === next.attemptId)
  if (existing !== undefined) return existing
  records.push(next)
  return next
}


class ArrayOperationKeyStore implements OperationKeyStore {
  constructor(private readonly records: OperationKeyRecord[]) {}

  find(input: OperationKeyInput): OperationKeyRecord | undefined {
    return this.records.find(
      (record) => record.actorRef === input.actorRef && record.operationName === input.operationName && record.key === input.key
    )
  }

  save(record: OperationKeyRecord): OperationKeyRecord {
    const index = this.records.findIndex(
      (candidate) =>
        candidate.actorRef === record.actorRef &&
        candidate.operationName === record.operationName &&
        candidate.key === record.key
    )
    if (index === -1) {
      this.records.push(record)
      return record
    }

    this.records[index] = record
    return record
  }

  recordConflict(): void {
    return undefined
  }
}
