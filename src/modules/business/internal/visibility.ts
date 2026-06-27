import { stableHash } from '@/modules/common/stable-hash'
import { assertCsrf, requireAdminAuthority } from '@/modules/security/public'
import type { SuppressionRuleRecord } from '@/modules/security/public'
import { recordInvalidationIntent, validateAuditEvent } from '@/modules/observability/public'
import type { BusinessRecord, BusinessSuppressionState, SuppressBusinessCommand, SuppressBusinessResult } from '@/modules/business/public'
import { brandNonEmpty } from '@/modules/common/ids'

export function isPubliclyDiscoverable(
  business: Pick<BusinessRecord, 'businessId' | 'publicStatus'> | undefined,
  suppressionRules: readonly SuppressionRuleRecord[]
): boolean {
  if (business === undefined || business.publicStatus !== 'published') {
    return false
  }

  return !suppressionRules.some(
    (rule) =>
      rule.targetType === 'business' &&
      rule.targetRef === business.businessId &&
      rule.status === 'active'
  )
}

export function suppressBusiness(
  state: BusinessSuppressionState,
  command: SuppressBusinessCommand
): SuppressBusinessResult {
  const csrfDecision = assertCsrf(command.security.csrf)
  if (csrfDecision.kind === 'rejected') {
    return {
      kind: 'error',
      code: 'business_suppress_csrf_rejected',
      retryable: false,
      reason: csrfDecision.reason,
    }
  }

  const authority = requireAdminAuthority(command.adminMembership, 'change_public_visibility')
  if (authority.kind === 'denied') {
    return {
      kind: 'error',
      code: 'business_suppress_admin_denied',
      retryable: false,
      reason: authority.reason,
    }
  }

  const reasonCode = command.reasonCode.trim()
  if (reasonCode.length === 0) {
    return {
      kind: 'error',
      code: 'business_suppress_invalid_reason',
      retryable: false,
      reason: 'Suppression requires a reason code.',
    }
  }

  const business = state.businesses.find((candidate) => candidate.businessId === command.businessId)
  if (business === undefined) {
    return {
      kind: 'error',
      code: 'business_suppress_not_found',
      retryable: false,
      reason: 'Business was not found.',
    }
  }

  const eventId = brandNonEmpty(`audit:business.suppressed:${business.businessId}:${command.operationKey}`, 'AuditEventId')
  const existingAudit = state.auditEvents.find((event) => event.eventId === eventId)
  const beforeState = business.publicStatus

  if (business.publicStatus !== 'suppressed') {
    business.publicStatus = 'suppressed'
    business.claimStatus = 'suppressed'
    business.suppressedAt = command.now
    business.updatedAt = command.now
    for (const service of state.businessServices) {
      if (service.businessId === business.businessId) {
        service.status = 'suppressed'
        service.updatedAt = command.now
      }
    }
  }

  const suppressionRule = ensureSuppressionRule(state, business, authority.membership.clerkUserId, reasonCode, command)
  const auditEvent =
    existingAudit ??
    createSuppressionAuditEvent(state, business, authority.membership.clerkUserId, beforeState, reasonCode, command)
  const invalidationIntent = recordInvalidationIntent(state.invalidationIntents, {
    intentId: `invalidate:${business.businessId}:${command.operationKey}`,
    businessId: business.businessId,
    targetType: 'business',
    targetRef: business.businessId,
    surfaces: ['public_catalog', 'registry_projection', 'discovery_manifest'],
    status: 'queued',
    reasonCode,
    createdAt: command.now,
  })

  return {
    kind: 'ok',
    code: suppressionRule.createdAt === command.now && existingAudit === undefined ? 'business_suppressed' : 'business_suppression_replayed',
    business,
    auditEvent,
    invalidationIntent,
  }
}

function ensureSuppressionRule(
  state: BusinessSuppressionState,
  business: BusinessRecord,
  adminRef: string,
  reasonCode: string,
  command: SuppressBusinessCommand
): SuppressionRuleRecord {
  const existing = state.suppressionRules.find(
    (rule) => rule.targetType === 'business' && rule.targetRef === business.businessId && rule.status === 'active'
  )
  if (existing !== undefined) {
    return existing
  }

  const rule: SuppressionRuleRecord = {
    targetType: 'business',
    targetRef: business.businessId,
    status: 'active',
    reasonCode,
    evidenceRefs: command.evidenceRefs,
    createdByAdminRef: adminRef,
    createdAt: command.now,
  }
  state.suppressionRules.push(rule)
  return rule
}

function createSuppressionAuditEvent(
  state: BusinessSuppressionState,
  business: BusinessRecord,
  adminRef: string,
  beforeState: BusinessRecord['publicStatus'],
  reasonCode: string,
  command: SuppressBusinessCommand
) {
  const redactedPayload = {
    evidenceCount: command.evidenceRefs.length,
    reasonCode,
    slug: business.slug,
  }
  const validation = validateAuditEvent({
    eventId: brandNonEmpty(`audit:business.suppressed:${business.businessId}:${command.operationKey}`, 'AuditEventId'),
    eventType: 'business.suppressed',
    actorKind: 'admin',
    actorRef: adminRef,
    targetType: 'business',
    targetRef: business.businessId,
    businessId: business.businessId,
    idempotencyKey: command.operationKey,
    correlationId: command.correlationId,
    beforeState,
    afterState: 'suppressed',
    reasonCode,
    evidenceRefs: command.evidenceRefs,
    redactedPayload,
    payloadHash: stableHash(redactedPayload),
    createdAt: command.now,
  })

  if (!validation.valid) {
    throw new Error(`Invalid suppression audit event: ${validation.reason}`)
  }

  state.auditEvents.push(validation.event)
  return validation.event
}
