import { brandNonEmpty } from '@/modules/common/ids'
import { normalizeSlug } from '@/modules/common/normalize-slug'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { buildOfferingSupplyProjection, validateServiceCatalogInput } from './catalog-model'
import {
  changeOfferingStatusInState,
  createOfferingInState,
  reviseOfferingInState,
  upsertAccessPathInState,
  withdrawAccessPathInState,
  type OfferingFactsInput,
  type OfferingSourceState,
} from './offering-source'
import type {
  BusinessOfferingRecord,
} from './offering-supply'
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
  const operationStore = new ArrayOperationKeyStore(state.operationKeys)
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
    applyPublishState(state, business, claim, serviceValidation.services, command.operationKey, command.now)
  }

  const projection = buildOfferingSupplyProjection({
    business,
    context,
    offerings: state.offerings.filter((offering) => offering.businessId === business.businessId),
    revisions: state.revisions.filter((revision) => revision.businessId === business.businessId),
    accessPaths: state.accessPaths.filter((path) => path.businessId === business.businessId),
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

  const auditEvent = ensurePublishAuditEvent(state, business, command, replayed)
  const registryAttempts = ensureRegistryAttempts(state, business.businessId, business.sourceHash, command.now)
  const discoveryAttempts = ensureDiscoveryAttempts(state, business.businessId, business.sourceHash, command.now)

  if (!replayed) {
    const resultHash = canonicalDigest({
      auditEventId: auditEvent.eventId,
      businessId: business.businessId,
      registryAttempts: registryAttempts.map((attempt) => attempt.logicalKey),
      slug: business.slug,
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

  return {
    kind: 'ok',
    code: replayed ? 'catalog_publish_replayed' : 'catalog_published',
    business,
    claim,
    catalog,
    auditEvent,
    registryProjectionAttempts: registryAttempts,
    discoveryManifestAttempts: discoveryAttempts,
  }
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
  const activeRefs = new Set<string>()
  const authority = { actorRef: business.ownerId, ownerRef: business.ownerId, businessOwnerRef: business.ownerId }
  for (const service of services) {
    const slug = normalizeSlug(service.name) || 'offering'
    const offeringRef = brandNonEmpty(`offering:${business.businessId}:${slug}`, 'OfferingRef')
    activeRefs.add(offeringRef)
    const facts: OfferingFactsInput = {
      name: service.name,
      category: service.category,
      summary: service.summary,
      serviceAreaSummary: service.serviceArea,
      availabilitySummary: service.hoursOrUnknown,
    }
    const existing = source.offerings.find((offering) => offering.offeringRef === offeringRef)
    let offering: BusinessOfferingRecord
    if (existing === undefined) {
      const created = createOfferingInState(source, {
        authority,
        operationKey: `${operationKey}:offering:${slug}:create`,
        businessId: business.businessId,
        offeringRef,
        facts,
        now,
      })
      if (created.kind === 'error') throw new Error(created.reason)
      source = created.state
      offering = created.value
    } else {
      const revised = reviseOfferingInState(source, {
        authority,
        operationKey: `${operationKey}:offering:${slug}:revise:${existing.currentRevision}`,
        offeringRef,
        expectedRevision: existing.currentRevision,
        facts,
        now,
      })
      if (revised.kind === 'error') throw new Error(revised.reason)
      source = revised.state
      offering = revised.value
    }
    if (offering.status !== 'published') {
      const published = changeOfferingStatusInState(source, {
        authority,
        operationKey: `${operationKey}:offering:${slug}:publish`,
        offeringRef,
        expectedRevision: offering.currentRevision,
        status: 'published',
        now,
      })
      if (published.kind === 'error') throw new Error(published.reason)
      source = published.state
      offering = published.value
    }

    const channel = service.firstRequest.publicChannel === 'public_business_contact'
      ? 'phone'
      : service.firstRequest.publicChannel === 'ae_status_only'
        ? 'ae_inquiry'
        : undefined
    const existingPaths = source.accessPaths.filter((path) => path.offeringRef === offeringRef && path.status !== 'withdrawn')
    if (channel !== undefined && service.firstRequest.mode !== 'not_available_yet') {
      const upserted = upsertAccessPathInState(source, {
        authority,
        operationKey: `${operationKey}:offering:${slug}:access-path`,
        offeringRef,
        accessPathRef: brandNonEmpty(`access:${business.businessId}:${slug}:human`, 'AccessPathRef'),
        expectedRevision: offering.currentRevision,
        status: 'published',
        descriptor: {
          kind: 'human_request',
          channel,
          disclosure: service.firstRequest.publicDisclosure ?? 'Contact the business to begin.',
        },
        now,
      })
      if (upserted.kind === 'error') throw new Error(upserted.reason)
      source = upserted.state
    } else {
      for (const path of existingPaths) {
        const withdrawn = withdrawAccessPathInState(source, {
          authority,
          operationKey: `${operationKey}:offering:${slug}:withdraw:${path.accessPathRef}`,
          accessPathRef: path.accessPathRef,
          expectedRevision: offering.currentRevision,
          now,
        })
        if (withdrawn.kind === 'error') throw new Error(withdrawn.reason)
        source = withdrawn.state
      }
    }
  }
  for (const offering of source.offerings) {
    if (offering.businessId !== business.businessId || activeRefs.has(offering.offeringRef) || offering.status === 'retired') continue
    const drafted = changeOfferingStatusInState(source, {
      authority,
      operationKey: `${operationKey}:offering:${offering.offeringRef}:draft`,
      offeringRef: offering.offeringRef,
      expectedRevision: offering.currentRevision,
      status: 'draft',
      now,
    })
    if (drafted.kind === 'error') throw new Error(drafted.reason)
    source = drafted.state
  }
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
