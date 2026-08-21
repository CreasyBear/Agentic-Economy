import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { validateAuditEvent } from '@/modules/common/audit-events'
import type { AuditEventContract, AuditEventSink, AuditTargetType } from '@/modules/common/audit-events'
import type {
  AdminAction,
  AdminDecisionAudit,
  AdminMembership,
  AdminMembershipAuditEventType,
  AdminRole,
} from '@/modules/security/public'

const AdminActionMatrix = {
  owner_admin: {
    read_admin_readbacks: true,
    annotate_triage: true,
    manage_admin_membership: true,
    use_break_glass: true,
    close_dispute: true,
    register_capability_binding: true,
    register_capability_contract: true,
    register_capability_supply: true,
    control_kernel_incidents: true,
  },
  support: {
    read_admin_readbacks: true,
    annotate_triage: true,
    manage_admin_membership: false,
    use_break_glass: false,
    close_dispute: false,
    register_capability_binding: false,
    register_capability_contract: false,
    register_capability_supply: false,
    control_kernel_incidents: false,
  },
  reviewer: {
    read_admin_readbacks: true,
    annotate_triage: false,
    manage_admin_membership: false,
    use_break_glass: false,
    close_dispute: false,
    register_capability_binding: false,
    register_capability_contract: false,
    register_capability_supply: false,
    control_kernel_incidents: false,
  },
} satisfies Record<AdminRole, Record<AdminAction, boolean>>

export type AdminAuthorityResult =
  | { kind: 'allowed'; membership: AdminMembership }
  | { kind: 'denied'; reason: 'missing_membership' | 'inactive_membership' | 'action_not_allowed' }

export function requireAdminAuthority(membership: AdminMembership | undefined, action: AdminAction): AdminAuthorityResult {
  if (membership === undefined) {
    return { kind: 'denied', reason: 'missing_membership' }
  }

  if (membership.state !== 'active') {
    return { kind: 'denied', reason: 'inactive_membership' }
  }

  if (!AdminActionMatrix[membership.role][action]) {
    return { kind: 'denied', reason: 'action_not_allowed' }
  }

  return { kind: 'allowed', membership }
}

export type AdminBootstrapConfig = {
  authorizedClerkUserIds: readonly string[]
  activeOwnerAdminCount: number
}

export function canBootstrapOwnerAdmin(clerkUserId: string, config: AdminBootstrapConfig): boolean {
  return config.activeOwnerAdminCount === 0 && config.authorizedClerkUserIds.includes(clerkUserId)
}

export type AdminAuthorityState = AuditEventSink & {
  adminMemberships: AdminMembership[]
  adminMembershipAuditEvents: AdminDecisionAudit[]
}

export type AdminBootstrapCommand = {
  clerkUserId: string
  tokenIdentifier: string
  authorizedClerkUserIds: readonly string[]
  reasonCode: string
  evidenceRefs: readonly string[]
  operationKey: string
  correlationId: string
  now: number
}

export type AdminGrantMembershipCommand = {
  actorMembership: AdminMembership | undefined
  targetClerkUserId: string
  targetTokenIdentifier: string
  role: AdminRole
  reasonCode: string
  evidenceRefs: readonly string[]
  operationKey: string
  correlationId: string
  now: number
}

export type AdminRevokeMembershipCommand = {
  actorMembership: AdminMembership | undefined
  targetClerkUserId: string
  targetTokenIdentifier?: string
  reasonCode: string
  evidenceRefs: readonly string[]
  operationKey: string
  correlationId: string
  now: number
}

export type AdminActionDeniedCommand = {
  actorMembership: AdminMembership | undefined
  action: AdminAction
  targetType: AuditTargetType
  targetRef: string
  reasonCode: string
  evidenceRefs: readonly string[]
  operationKey: string
  correlationId: string
  now: number
}

export type AdminAuthorityMutationResult =
  | {
      kind: 'ok'
      code: 'admin_membership_bootstrapped' | 'admin_membership_granted' | 'admin_membership_revoked'
      membership: AdminMembership
      auditEvent: AuditEventContract
      membershipAuditEvent: AdminDecisionAudit
    }
  | {
      kind: 'error'
      code:
        | 'admin_bootstrap_denied'
        | 'admin_action_denied'
        | 'admin_membership_not_found'
        | 'admin_invalid_reason'
        | 'admin_missing_evidence'
      retryable: boolean
      reason: string
      auditEvent?: AuditEventContract
      membershipAuditEvent?: AdminDecisionAudit
    }

export function createEmptyAdminAuthorityState(): AdminAuthorityState {
  return {
    adminMemberships: [],
    adminMembershipAuditEvents: [],
    auditEvents: [],
  }
}

export function bootstrapOwnerAdmin(
  state: AdminAuthorityState,
  command: AdminBootstrapCommand
): AdminAuthorityMutationResult {
  const validated = validateReasonAndEvidence(command.reasonCode, command.evidenceRefs)
  if (validated.kind === 'error') {
    return validated
  }
  if (command.tokenIdentifier.trim().length === 0) {
    const denied = recordAdminActionDenied(state, {
      actorMembership: undefined,
      action: 'manage_admin_membership',
      targetType: 'admin_membership',
      targetRef: command.clerkUserId,
      reasonCode: 'missing_token_identifier',
      evidenceRefs: command.evidenceRefs,
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      now: command.now,
    })
    return {
      kind: 'error',
      code: 'admin_bootstrap_denied',
      retryable: false,
      reason: 'missing_token_identifier',
      auditEvent: denied.auditEvent,
      membershipAuditEvent: denied.membershipAuditEvent,
    }
  }


  const activeOwnerAdminCount = countActiveOwnerAdmins(state.adminMemberships)
  if (
    !canBootstrapOwnerAdmin(command.clerkUserId, {
      authorizedClerkUserIds: command.authorizedClerkUserIds,
      activeOwnerAdminCount,
    })
  ) {
    const reason = activeOwnerAdminCount === 0 ? 'unauthorized_bootstrap_principal' : 'owner_admin_already_exists'
    const denied = recordAdminActionDenied(state, {
      actorMembership: undefined,
      action: 'manage_admin_membership',
      targetType: 'admin_membership',
      targetRef: command.clerkUserId,
      reasonCode: reason,
      evidenceRefs: command.evidenceRefs,
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      now: command.now,
    })

    return {
      kind: 'error',
      code: 'admin_bootstrap_denied',
      retryable: false,
      reason,
      auditEvent: denied.auditEvent,
      membershipAuditEvent: denied.membershipAuditEvent,
    }
  }

  const membership: AdminMembership = {
    clerkUserId: command.clerkUserId,
    tokenIdentifier: command.tokenIdentifier,
    role: 'owner_admin',
    state: 'active',
    grantedBy: `bootstrap:${command.clerkUserId}`,
    grantedAt: command.now,
    evidenceRef: validated.evidenceRef,
  }
  state.adminMemberships.push(membership)

  const audit = recordAdminMembershipAudit(state, {
    eventType: 'membership_bootstrapped',
    auditEventType: 'admin.membership_bootstrapped',
    actorRef: command.clerkUserId,
    targetRef: command.clerkUserId,
    reasonCode: validated.reasonCode,
    evidenceRefs: command.evidenceRefs,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    beforeState: 'none',
    afterState: 'active:owner_admin',
    now: command.now,
  })

  return {
    kind: 'ok',
    code: 'admin_membership_bootstrapped',
    membership,
    auditEvent: audit.auditEvent,
    membershipAuditEvent: audit.membershipAuditEvent,
  }
}

export function grantAdminMembership(
  state: AdminAuthorityState,
  command: AdminGrantMembershipCommand
): AdminAuthorityMutationResult {
  const authority = requireAdminAuthority(command.actorMembership, 'manage_admin_membership')
  if (authority.kind === 'denied') {
    const denied = recordAdminActionDenied(state, {
      actorMembership: command.actorMembership,
      action: 'manage_admin_membership',
      targetType: 'admin_membership',
      targetRef: command.targetClerkUserId,
      reasonCode: authority.reason,
      evidenceRefs: command.evidenceRefs,
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      now: command.now,
    })

    return {
      kind: 'error',
      code: 'admin_action_denied',
      retryable: false,
      reason: authority.reason,
      auditEvent: denied.auditEvent,
      membershipAuditEvent: denied.membershipAuditEvent,
    }
  }
  if (
    typeof command.targetTokenIdentifier !== 'string'
    || command.targetTokenIdentifier.trim().length === 0
  ) {
    const denied = recordAdminActionDenied(state, {
      actorMembership: command.actorMembership,
      action: 'manage_admin_membership',
      targetType: 'admin_membership',
      targetRef: command.targetClerkUserId,
      reasonCode: 'malformed_token_identifier',
      evidenceRefs: command.evidenceRefs,
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      now: command.now,
    })

    return {
      kind: 'error',
      code: 'admin_action_denied',
      retryable: false,
      reason: 'malformed_token_identifier',
      auditEvent: denied.auditEvent,
      membershipAuditEvent: denied.membershipAuditEvent,
    }
  }


  const validated = validateReasonAndEvidence(command.reasonCode, command.evidenceRefs)
  if (validated.kind === 'error') {
    return validated
  }

  const existing =
    state.adminMemberships.find((membership) => membership.tokenIdentifier === command.targetTokenIdentifier)
  const existingBySubject = existing ?? state.adminMemberships.find((membership) => membership.clerkUserId === command.targetClerkUserId)
  const beforeState = existingBySubject === undefined ? 'none' : `${existingBySubject.state}:${existingBySubject.role}`
  const membership = existingBySubject ?? {
    clerkUserId: command.targetClerkUserId,
    tokenIdentifier: command.targetTokenIdentifier,
    role: command.role,
    state: 'active',
    grantedBy: authority.membership.clerkUserId,
    grantedAt: command.now,
  }

  membership.role = command.role
  membership.state = 'active'
  membership.grantedBy = authority.membership.clerkUserId
  membership.grantedAt = command.now
  membership.tokenIdentifier = command.targetTokenIdentifier
  delete membership.revokedBy
  delete membership.revokedAt

  if (existingBySubject === undefined) {
    state.adminMemberships.push(membership)
  }

  const audit = recordAdminMembershipAudit(state, {
    eventType: 'membership_granted',
    auditEventType: 'admin.membership_granted',
    actorRef: authority.membership.clerkUserId,
    targetRef: command.targetClerkUserId,
    reasonCode: validated.reasonCode,
    evidenceRefs: command.evidenceRefs,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    beforeState,
    afterState: `active:${command.role}`,
    now: command.now,
  })

  return {
    kind: 'ok',
    code: 'admin_membership_granted',
    membership,
    auditEvent: audit.auditEvent,
    membershipAuditEvent: audit.membershipAuditEvent,
  }
}

export function revokeAdminMembership(
  state: AdminAuthorityState,
  command: AdminRevokeMembershipCommand
): AdminAuthorityMutationResult {
  const authority = requireAdminAuthority(command.actorMembership, 'manage_admin_membership')
  if (authority.kind === 'denied') {
    const denied = recordAdminActionDenied(state, {
      actorMembership: command.actorMembership,
      action: 'manage_admin_membership',
      targetType: 'admin_membership',
      targetRef: command.targetClerkUserId,
      reasonCode: authority.reason,
      evidenceRefs: command.evidenceRefs,
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      now: command.now,
    })

    return {
      kind: 'error',
      code: 'admin_action_denied',
      retryable: false,
      reason: authority.reason,
      auditEvent: denied.auditEvent,
      membershipAuditEvent: denied.membershipAuditEvent,
    }
  }

  const validated = validateReasonAndEvidence(command.reasonCode, command.evidenceRefs)
  if (validated.kind === 'error') {
    return validated
  }

  const membership =
    command.targetTokenIdentifier === undefined
      ? state.adminMemberships.find((candidate) => candidate.clerkUserId === command.targetClerkUserId)
      : state.adminMemberships.find((candidate) => candidate.tokenIdentifier === command.targetTokenIdentifier)
        ?? state.adminMemberships.find((candidate) => candidate.clerkUserId === command.targetClerkUserId)
  if (membership === undefined) {
    return {
      kind: 'error',
      code: 'admin_membership_not_found',
      retryable: false,
      reason: 'target_membership_not_found',
    }
  }

  const beforeState = `${membership.state}:${membership.role}`
  membership.state = 'revoked'
  membership.revokedBy = authority.membership.clerkUserId
  membership.revokedAt = command.now

  const audit = recordAdminMembershipAudit(state, {
    eventType: 'membership_revoked',
    auditEventType: 'admin.membership_revoked',
    actorRef: authority.membership.clerkUserId,
    targetRef: command.targetClerkUserId,
    reasonCode: validated.reasonCode,
    evidenceRefs: command.evidenceRefs,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    beforeState,
    afterState: `revoked:${membership.role}`,
    now: command.now,
  })

  return {
    kind: 'ok',
    code: 'admin_membership_revoked',
    membership,
    auditEvent: audit.auditEvent,
    membershipAuditEvent: audit.membershipAuditEvent,
  }
}

export function recordAdminActionDenied(
  state: AdminAuthorityState,
  command: AdminActionDeniedCommand
): { auditEvent: AuditEventContract; membershipAuditEvent: AdminDecisionAudit } {
  const actorRef = command.actorMembership?.clerkUserId ?? 'anonymous:admin'
  return recordAdminMembershipAudit(state, {
    eventType: 'action_denied',
    auditEventType: 'admin.action_denied',
    actorRef,
    targetType: command.targetType,
    targetRef: command.targetRef,
    reasonCode: command.reasonCode,
    evidenceRefs: command.evidenceRefs,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    beforeState: command.action,
    afterState: 'denied',
    now: command.now,
  })
}

function countActiveOwnerAdmins(memberships: readonly AdminMembership[]): number {
  return memberships.filter((membership) => membership.role === 'owner_admin' && membership.state === 'active').length
}

function validateReasonAndEvidence(
  reasonCode: string,
  evidenceRefs: readonly string[]
):
  | { kind: 'ok'; reasonCode: string; evidenceRef: string }
  | { kind: 'error'; code: 'admin_invalid_reason' | 'admin_missing_evidence'; retryable: false; reason: string } {
  const trimmedReason = reasonCode.trim()
  if (trimmedReason.length === 0) {
    return {
      kind: 'error',
      code: 'admin_invalid_reason',
      retryable: false,
      reason: 'admin_action_requires_reason',
    }
  }

  const evidenceRef = evidenceRefs[0]
  if (evidenceRef === undefined || evidenceRef.trim().length === 0) {
    return {
      kind: 'error',
      code: 'admin_missing_evidence',
      retryable: false,
      reason: 'admin_action_requires_evidence',
    }
  }

  return { kind: 'ok', reasonCode: trimmedReason, evidenceRef }
}

function recordAdminMembershipAudit(
  state: AdminAuthorityState,
  input: {
    eventType: AdminMembershipAuditEventType
    auditEventType:
      | 'admin.membership_bootstrapped'
      | 'admin.membership_granted'
      | 'admin.membership_revoked'
      | 'admin.action_denied'
    actorRef: string
    targetType?: AuditTargetType
    targetRef: string
    reasonCode: string
    evidenceRefs: readonly string[]
    operationKey: string
    correlationId: string
    beforeState: string
    afterState: string
    now: number
  }
): { auditEvent: AuditEventContract; membershipAuditEvent: AdminDecisionAudit } {
  const operationKey = brandNonEmpty(input.operationKey, 'OperationKey')
  const correlationId = brandNonEmpty(input.correlationId, 'CorrelationId')
  const auditEventId = brandNonEmpty(
    `audit:${input.auditEventType}:${input.targetRef}:${input.operationKey}`,
    'AuditEventId'
  )
  const redactedPayload = {
    membershipEventType: input.eventType,
    evidenceCount: input.evidenceRefs.length,
    reasonCode: input.reasonCode,
  }
  const validation = validateAuditEvent({
    eventId: auditEventId,
    eventType: input.auditEventType,
    actorKind: input.actorRef === 'anonymous:admin' ? 'anonymous' : 'admin',
    actorRef: input.actorRef,
    targetType: input.targetType ?? 'admin_membership',
    targetRef: input.targetRef,
    idempotencyKey: operationKey,
    correlationId,
    beforeState: input.beforeState,
    afterState: input.afterState,
    reasonCode: input.reasonCode,
    evidenceRefs: input.evidenceRefs,
    redactedPayload,
    payloadHash: canonicalDigest(redactedPayload),
    createdAt: input.now,
  })

  if (!validation.valid) {
    throw new Error(`Invalid admin audit event: ${validation.reason}`)
  }

  const membershipAuditEvent: AdminDecisionAudit = {
    auditEventId,
    eventType: input.eventType,
    actorRef: input.actorRef,
    targetRef: input.targetRef,
    reasonCode: input.reasonCode,
    evidenceRefs: input.evidenceRefs,
    operationKey,
    correlationId,
    createdAt: input.now,
  }
  state.auditEvents.push(validation.event)
  state.adminMembershipAuditEvents.push(membershipAuditEvent)

  return { auditEvent: validation.event, membershipAuditEvent }
}
