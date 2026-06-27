import { brandNonEmpty } from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'
import { assertCsrf, requireAdminAuthority } from '@/modules/security/public'
import { validateAuditEvent } from '@/modules/observability/public'
import type {
  OperatorControlKey,
  OperatorControlReadback,
  OperatorControlRecord,
  OperatorControlSourceState,
  SetOperatorControlCommand,
  SetOperatorControlResult,
} from '@/modules/observability/public'

const defaultControlValues = {
  claims_enabled: true,
  publish_enabled: true,
  registry_enabled: true,
  discovery_enabled: true,
  public_copy_safe_mode: false,
} satisfies Record<OperatorControlKey, boolean>

export function setOperatorControl(
  state: OperatorControlSourceState,
  command: SetOperatorControlCommand
): SetOperatorControlResult {
  const csrfDecision = assertCsrf(command.security.csrf)
  if (csrfDecision.kind === 'rejected') {
    return {
      kind: 'error',
      code: 'operator_control_csrf_rejected',
      retryable: false,
      reason: csrfDecision.reason,
    }
  }

  const authority = requireAdminAuthority(command.adminMembership, 'set_operator_control')
  if (authority.kind === 'denied') {
    return {
      kind: 'error',
      code: 'operator_control_admin_denied',
      retryable: false,
      reason: authority.reason,
    }
  }

  const reasonCode = command.reasonCode.trim()
  if (reasonCode.length === 0) {
    return {
      kind: 'error',
      code: 'operator_control_invalid_reason',
      retryable: false,
      reason: 'Operator control changes require a reason code.',
    }
  }

  if (!hasEvidence(command.evidenceRefs)) {
    return {
      kind: 'error',
      code: 'operator_control_missing_evidence',
      retryable: false,
      reason: 'Operator control changes require private evidence.',
    }
  }

  if (command.expiresAt !== undefined && command.expiresAt <= command.now) {
    return {
      kind: 'error',
      code: 'operator_control_invalid_expiry',
      retryable: false,
      reason: 'Operator control expiry must be in the future.',
    }
  }

  const eventId = operatorControlAuditEventId(command.key, command.operationKey)
  const existingAudit = state.auditEvents.find((event) => event.eventId === eventId)
  const existing = state.operatorControls.find((control) => control.key === command.key)
  if (existingAudit !== undefined && existing !== undefined) {
    return {
      kind: 'ok',
      code: 'operator_control_replayed',
      control: existing,
      readback: toReadback(existing, command.now),
      auditEvent: existingAudit,
    }
  }

  const beforeState = existing === undefined ? `default:${defaultControlValues[command.key]}` : controlState(existing)
  const base = existing ?? {
    key: command.key,
    enabled: command.enabled,
    changedByAdminRef: authority.membership.clerkUserId,
    reasonCode,
    evidenceRefs: [...command.evidenceRefs],
    correlationId: command.correlationId,
    operationKey: command.operationKey,
    updatedAt: command.now,
  }

  base.enabled = command.enabled
  base.changedByAdminRef = authority.membership.clerkUserId
  base.reasonCode = reasonCode
  base.evidenceRefs = [...command.evidenceRefs]
  base.correlationId = command.correlationId
  base.operationKey = command.operationKey
  base.updatedAt = command.now
  if (command.expiresAt === undefined) {
    delete base.expiresAt
  } else {
    base.expiresAt = command.expiresAt
  }

  if (existing === undefined) {
    state.operatorControls.push(base)
  }

  const auditEvent = recordOperatorControlAuditEvent(state, base, {
    beforeState,
    operationKey: command.operationKey,
    now: command.now,
  })

  return {
    kind: 'ok',
    code: 'operator_control_changed',
    control: base,
    readback: toReadback(base, command.now),
    auditEvent,
  }
}

export function readOperatorControls(state: OperatorControlSourceState, now: number): readonly OperatorControlReadback[] {
  return Object.keys(defaultControlValues).map((key) => {
    const controlKey = key as OperatorControlKey
    const existing = state.operatorControls.find((control) => control.key === controlKey)

    if (existing === undefined) {
      return {
        key: controlKey,
        configuredEnabled: defaultControlValues[controlKey],
        effectiveEnabled: defaultControlValues[controlKey],
        expired: false,
        source: 'default',
        updatedAt: 0,
      }
    }

    return toReadback(existing, now)
  })
}

function recordOperatorControlAuditEvent(
  state: OperatorControlSourceState,
  control: OperatorControlRecord,
  input: {
    beforeState: string
    operationKey: SetOperatorControlCommand['operationKey']
    now: number
  }
) {
  const redactedPayload = {
    evidenceCount: control.evidenceRefs.length,
    expiresAt: control.expiresAt ?? null,
    key: control.key,
    reasonCode: control.reasonCode,
  }
  const validation = validateAuditEvent({
    eventId: operatorControlAuditEventId(control.key, input.operationKey),
    eventType: 'operator_control.changed',
    actorKind: 'admin',
    actorRef: control.changedByAdminRef,
    targetType: 'operator_control',
    targetRef: control.key,
    idempotencyKey: input.operationKey,
    correlationId: control.correlationId,
    beforeState: input.beforeState,
    afterState: controlState(control),
    reasonCode: control.reasonCode,
    evidenceRefs: control.evidenceRefs,
    redactedPayload,
    payloadHash: stableHash(redactedPayload),
    createdAt: input.now,
  })

  if (!validation.valid) {
    throw new Error(`Invalid operator control audit event: ${validation.reason}`)
  }

  state.auditEvents.push(validation.event)
  return validation.event
}

function toReadback(control: OperatorControlRecord, now: number): OperatorControlReadback {
  const expired = control.expiresAt !== undefined && control.expiresAt <= now
  const base = {
    key: control.key,
    configuredEnabled: control.enabled,
    effectiveEnabled: expired ? defaultControlValues[control.key] : control.enabled,
    expired,
    source: 'source_owned' as const,
    reasonCode: control.reasonCode,
    changedByAdminRef: control.changedByAdminRef,
    correlationId: control.correlationId,
    updatedAt: control.updatedAt,
  }

  return control.expiresAt === undefined ? base : { ...base, expiresAt: control.expiresAt }
}

function controlState(control: OperatorControlRecord): string {
  return `${control.enabled ? 'enabled' : 'disabled'}:${control.expiresAt ?? 'no_expiry'}`
}

function operatorControlAuditEventId(
  key: OperatorControlKey,
  operationKey: SetOperatorControlCommand['operationKey']
) {
  return brandNonEmpty(`audit:operator_control.changed:${key}:${operationKey}`, 'AuditEventId')
}

function hasEvidence(evidenceRefs: readonly string[]): boolean {
  return evidenceRefs.some((evidenceRef) => evidenceRef.trim().length > 0)
}
