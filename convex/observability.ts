import type { UserIdentity } from 'convex/server'
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { readActiveAdminMembership } from './authz'
import {
  loadPhaseOneSourceState,
  persistPhaseOneSourceState,
  runtimeDb,
} from './source-state'
import { brandNonEmpty } from '../src/modules/common/ids'
import {
  readOperatorControls as readOperatorControlsModule,
  setOperatorControl as setOperatorControlModule,
} from '../src/modules/observability/public'
import type {
  AuditEventContract,
  OperatorControlReadback,
  OperatorControlRecord,
  OperatorControlSourceState,
} from '../src/modules/observability/public'
import {
  recordAdminActionDenied,
  requireAdminAuthority,
} from '../src/modules/security/public'
import type {
  AdminAuthorityState,
  AdminDecisionAudit,
  AdminMembership,
} from '../src/modules/security/public'

const operatorControlKey = v.union(
  v.literal('claims_enabled'),
  v.literal('publish_enabled'),
  v.literal('registry_enabled'),
  v.literal('discovery_enabled'),
  v.literal('public_copy_safe_mode')
)

const operatorControlReadback = v.object({
  key: operatorControlKey,
  configuredEnabled: v.boolean(),
  effectiveEnabled: v.boolean(),
  expired: v.boolean(),
  expiresAt: v.optional(v.number()),
  source: v.union(v.literal('default'), v.literal('source_owned')),
  reasonCode: v.optional(v.string()),
  changedByAdminRef: v.optional(v.string()),
  correlationId: v.optional(v.string()),
  updatedAt: v.number(),
})

const operatorAuditSummary = v.object({
  eventType: v.union(v.literal('operator_control.changed'), v.literal('admin.action_denied')),
  actorRef: v.string(),
  targetRef: v.string(),
  beforeState: v.optional(v.string()),
  afterState: v.optional(v.string()),
  reasonCode: v.optional(v.string()),
})

const membershipAuditSummary = v.object({
  eventType: v.literal('action_denied'),
  actorRef: v.string(),
  targetRef: v.string(),
  reasonCode: v.string(),
})

const operatorControlRecord = v.object({
  key: operatorControlKey,
  enabled: v.boolean(),
  changedByAdminRef: v.string(),
  reasonCode: v.string(),
  evidenceRefs: v.array(v.string()),
  correlationId: v.string(),
  operationKey: v.string(),
  expiresAt: v.optional(v.number()),
  updatedAt: v.number(),
})

const setOperatorControlResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(v.literal('operator_control_changed'), v.literal('operator_control_replayed')),
    control: operatorControlRecord,
    readback: operatorControlReadback,
    auditEvent: operatorAuditSummary,
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(
      v.literal('operator_control_csrf_rejected'),
      v.literal('operator_control_admin_denied'),
      v.literal('operator_control_invalid_reason'),
      v.literal('operator_control_missing_evidence'),
      v.literal('operator_control_invalid_expiry')
    ),
    retryable: v.boolean(),
    reason: v.string(),
    auditEvent: v.optional(operatorAuditSummary),
    membershipAuditEvent: v.optional(membershipAuditSummary),
  })
)

const readOperatorControlsResult = v.union(
  v.object({
    kind: v.literal('allowed'),
    controls: v.array(operatorControlReadback),
  }),
  v.object({
    kind: v.literal('denied'),
    reason: v.union(
      v.literal('missing_membership'),
      v.literal('inactive_membership'),
      v.literal('action_not_allowed')
    ),
    controls: v.array(operatorControlReadback),
  })
)

type RuntimeCtx = {
  db: object
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>
  }
}

type PhaseOneOperatorControlKey =
  | 'claims_enabled'
  | 'publish_enabled'
  | 'registry_enabled'
  | 'discovery_enabled'
  | 'public_copy_safe_mode'

export const setOperatorControl = mutationGeneric({
  args: {
    key: operatorControlKey,
    enabled: v.boolean(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    expiresAt: v.optional(v.number()),
    csrfToken: v.optional(v.string()),
    csrfCookie: v.optional(v.string()),
    origin: v.optional(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: setOperatorControlResult,
  handler: async (ctx, args) => {
    const db = runtimeDb(ctx.db)
    const source = await loadPhaseOneSourceState(db)
    const adminMembership = await readCurrentActiveMembership(ctx)
    const authority = requireAdminAuthority(adminMembership, 'set_operator_control')
    if (authority.kind === 'denied') {
      const denied = recordAdminActionDenied(adminAuthorityState(source), {
        actorMembership: adminMembership,
        action: 'set_operator_control',
        targetType: 'operator_control',
        targetRef: args.key,
        reasonCode: authority.reason,
        evidenceRefs: args.evidenceRefs,
        operationKey: args.operationKey,
        correlationId: args.correlationId,
        now: Date.now(),
      })
      await persistPhaseOneSourceState(db, source)
      return {
        kind: 'error' as const,
        code: 'operator_control_admin_denied' as const,
        retryable: false,
        reason: authority.reason,
        auditEvent: summarizeOperatorAudit(denied.auditEvent),
        membershipAuditEvent: summarizeMembershipAudit(denied.membershipAuditEvent),
      }
    }

    const state = operatorControlState(source)
    const result = setOperatorControlModule(state, {
      adminMembership,
      key: args.key,
      enabled: args.enabled,
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
      ...(args.expiresAt === undefined ? {} : { expiresAt: args.expiresAt }),
      security: {
        csrf: {
          ...(args.csrfToken === undefined ? {} : { csrfToken: args.csrfToken }),
          ...(args.csrfCookie === undefined ? {} : { csrfCookie: args.csrfCookie }),
          ...(args.origin === undefined ? {} : { origin: args.origin }),
          allowedOrigins: sourceAllowedOrigins(),
        },
      },
      operationKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      now: Date.now(),
    })

    await persistPhaseOneSourceState(db, source)
    return summarizeSetOperatorControl(result)
  },
})

export const readOperatorControls = queryGeneric({
  args: {},
  returns: readOperatorControlsResult,
  handler: async (ctx) => {
    const db = runtimeDb(ctx.db)
    const source = await loadPhaseOneSourceState(db)
    const adminMembership = await readCurrentActiveMembership(ctx)
    const authority = requireAdminAuthority(adminMembership, 'set_operator_control')
    if (authority.kind === 'denied') {
      return {
        kind: 'denied' as const,
        reason: authority.reason,
        controls: [],
      }
    }

    return {
      kind: 'allowed' as const,
      controls: readOperatorControlsModule(operatorControlState(source), Date.now())
        .filter(isPhaseOneOperatorControlReadback)
        .map(summarizeOperatorReadback),
    }
  },
})

function operatorControlState(source: Awaited<ReturnType<typeof loadPhaseOneSourceState>>): OperatorControlSourceState {
  return {
    operatorControls: source.observability.operatorControls as OperatorControlSourceState['operatorControls'],
    auditEvents: source.observability.auditEvents as AuditEventContract[],
  }
}

function adminAuthorityState(source: Awaited<ReturnType<typeof loadPhaseOneSourceState>>): AdminAuthorityState {
  return {
    adminMemberships: source.security.adminMemberships as AdminMembership[],
    adminMembershipAuditEvents: source.security.adminMembershipAuditEvents as AdminDecisionAudit[],
    auditEvents: source.observability.auditEvents as AuditEventContract[],
  }
}

async function readCurrentActiveMembership(ctx: RuntimeCtx): Promise<AdminMembership | undefined> {
  const identity = await ctx.auth.getUserIdentity()
  return identity === null ? undefined : readActiveAdminMembership(runtimeDb(ctx.db), identity.subject)
}

function summarizeSetOperatorControl(result: ReturnType<typeof setOperatorControlModule>) {
  if (result.kind === 'error') {
    return result
  }

  return {
    kind: 'ok' as const,
    code: result.code,
    control: summarizeOperatorRecord(result.control),
    readback: summarizeOperatorReadback(result.readback),
    auditEvent: summarizeOperatorAudit(result.auditEvent),
  }
}

function summarizeOperatorRecord(control: OperatorControlRecord) {
  if (!isPhaseOneOperatorControlKey(control.key)) {
    throw new Error(`Unexpected non-Phase-1 operator control key: ${control.key}`)
  }

  return {
    key: control.key,
    enabled: control.enabled,
    changedByAdminRef: control.changedByAdminRef,
    reasonCode: control.reasonCode,
    evidenceRefs: [...control.evidenceRefs],
    correlationId: control.correlationId,
    operationKey: control.operationKey,
    ...(control.expiresAt === undefined ? {} : { expiresAt: control.expiresAt }),
    updatedAt: control.updatedAt,
  }
}

function summarizeOperatorReadback(control: OperatorControlReadback) {
  if (!isPhaseOneOperatorControlKey(control.key)) {
    throw new Error(`Unexpected non-Phase-1 operator control key: ${control.key}`)
  }

  return {
    key: control.key,
    configuredEnabled: control.configuredEnabled,
    effectiveEnabled: control.effectiveEnabled,
    expired: control.expired,
    ...(control.expiresAt === undefined ? {} : { expiresAt: control.expiresAt }),
    source: control.source,
    ...(control.reasonCode === undefined ? {} : { reasonCode: control.reasonCode }),
    ...(control.changedByAdminRef === undefined ? {} : { changedByAdminRef: control.changedByAdminRef }),
    ...(control.correlationId === undefined ? {} : { correlationId: control.correlationId }),
    updatedAt: control.updatedAt,
  }
}

function summarizeOperatorAudit(event: AuditEventContract) {
  return {
    eventType: event.eventType as 'operator_control.changed' | 'admin.action_denied',
    actorRef: event.actorRef,
    targetRef: event.targetRef,
    ...(event.beforeState === undefined ? {} : { beforeState: event.beforeState }),
    ...(event.afterState === undefined ? {} : { afterState: event.afterState }),
    ...(event.reasonCode === undefined ? {} : { reasonCode: event.reasonCode }),
  }
}

function summarizeMembershipAudit(event: AdminDecisionAudit) {
  return {
    eventType: 'action_denied' as const,
    actorRef: event.actorRef,
    targetRef: event.targetRef,
    reasonCode: event.reasonCode,
  }
}

function isPhaseOneOperatorControlReadback(
  control: OperatorControlReadback
): control is OperatorControlReadback & { key: PhaseOneOperatorControlKey } {
  return isPhaseOneOperatorControlKey(control.key)
}

function isPhaseOneOperatorControlKey(key: string): key is PhaseOneOperatorControlKey {
  return (
    key === 'claims_enabled' ||
    key === 'publish_enabled' ||
    key === 'registry_enabled' ||
    key === 'discovery_enabled' ||
    key === 'public_copy_safe_mode'
  )
}

function sourceAllowedOrigins(): readonly string[] {
  const origins = [
    ...envList('AE_ALLOWED_ORIGINS'),
    ...envList('VITE_AE_ALLOWED_ORIGINS'),
    ...envList('SITE_URL'),
    ...envList('VITE_SITE_URL'),
  ]
  return ['https://ae.example', ...origins.filter((origin) => origin !== 'https://ae.example')]
}

function envList(name: string): string[] {
  const value = typeof process === 'undefined' ? undefined : process.env[name]
  return value === undefined ? [] : value.split(',').map((item) => item.trim()).filter(Boolean)
}

export type {
  AuditEventContract,
  OperatorControlKey,
  OperatorControlReadback,
  OperatorControlRecord,
  OperatorControlSourceState,
  SetOperatorControlCommand,
  SetOperatorControlResult,
} from '../src/modules/observability/public'
