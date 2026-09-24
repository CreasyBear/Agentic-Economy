import { v } from 'convex/values'

import {
  toStableHashValue,
  verifyCustomerRequestServiceAssertion,
} from '../src/modules/agent-access/service-auth-envelope'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { brandNonEmpty } from '../src/modules/common/ids'
import { createPackage3AuditEvent } from '../src/modules/observability/public'

import type { Doc } from './_generated/dataModel'
import { env, mutation, type MutationCtx } from './_generated/server'
import { persistAuditEvent } from './lib/security/audit/persistence'
import { serviceAssertion } from './serviceAssertion'
import { CLERK_ORGANIZATION_PROVIDER_NAMESPACE } from './workspaceProvisioning'

export const RECORD_OPERATION = 'workspaceInvitations.recordOrganizationInvitationCreatedForServer'
export const RECORD_SCOPE = 'workspace:record_organization_invitation_created'
export const RECORD_REVOKED_OPERATION = 'workspaceInvitations.recordOrganizationInvitationRevokedForServer'
export const RECORD_REVOKED_SCOPE = 'workspace:record_organization_invitation_revoked'

export const recordOrganizationInvitationInput = {
  clerkOrgId: v.string(),
  deliveryRefHash: v.string(),
  invitationRefHash: v.string(),
  emailHash: v.string(),
  role: v.union(v.literal('org:admin'), v.literal('org:member')),
  observedAt: v.number(),
  expiresAt: v.optional(v.number()),
  status: v.optional(v.string()),
}

const digestPattern = /^sha256:[0-9a-f]{64}$/u
const clerkOrgIdPattern = /^org_/
const CLERK_ORG_INVITATION_ACTOR_REF = 'ae:clerk-organization-invitation'
const WORKSPACE_INVITATION_SYSTEM_ACTOR_REF = CLERK_ORG_INVITATION_ACTOR_REF

export type WorkspaceInvitationErrorCode = 'authority_conflict'

export class WorkspaceInvitationError extends Error {
  readonly code: WorkspaceInvitationErrorCode

  constructor(code: WorkspaceInvitationErrorCode) {
    super(code)
    this.name = 'WorkspaceInvitationError'
    this.code = code
  }
}

const recordResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: v.union(v.literal('applied'), v.literal('replayed'), v.literal('ignored')),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.literal('authority_conflict'),
  }),
)

type RecordResult = Readonly<
  | { kind: 'accepted'; status: 'applied' | 'replayed' | 'ignored' }
  | { kind: 'refused'; code: 'authority_conflict' }
>

type RecordCommand = Readonly<{
  clerkOrgId: string
  deliveryRefHash: string
  invitationRefHash: string
  emailHash: string
  role: 'org:admin' | 'org:member'
  observedAt: number
  expiresAt?: number
  status?: string
}>

function validateRecordCommand(command: RecordCommand): void {
  if (!clerkOrgIdPattern.test(command.clerkOrgId)) {
    throw new WorkspaceInvitationError('authority_conflict')
  }
  if (
    !digestPattern.test(command.deliveryRefHash)
    || !digestPattern.test(command.invitationRefHash)
    || !digestPattern.test(command.emailHash)
  ) {
    throw new WorkspaceInvitationError('authority_conflict')
  }
  if (command.status !== undefined && command.status !== 'pending') {
    throw new WorkspaceInvitationError('authority_conflict')
  }
}

function recordCommandDigest(command: RecordCommand): string {
  return canonicalDigest({
    clerkOrgId: command.clerkOrgId,
    deliveryRefHash: command.deliveryRefHash,
    invitationRefHash: command.invitationRefHash,
    emailHash: command.emailHash,
    role: command.role,
    observedAt: command.observedAt,
  })
}

function auditEventIdFromDeliveryRefHash(deliveryRefHash: string): string {
  const digestValue = deliveryRefHash.slice('sha256:'.length)
  return `audit:clerk-org-invite:${digestValue}`
}

async function verifyRecordServiceAuth(
  args: Readonly<{
    operation: string
    scope: string
    clerkOrgId: string
    deliveryRefHash: string
    invitationRefHash: string
    emailHash: string
    role: 'org:admin' | 'org:member'
    observedAt: number
    serviceAuth: {
      scopes: readonly string[]
      issuedAt: number
      signature: string
      principalId: string
      ownerId: string
      credentialId: string
    }
  }>,
): Promise<void> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim() ?? ''
  const verified = await verifyCustomerRequestServiceAssertion({
    key,
    operation: args.operation,
    command: toStableHashValue({
      clerkOrgId: args.clerkOrgId,
      deliveryRefHash: args.deliveryRefHash,
      invitationRefHash: args.invitationRefHash,
      emailHash: args.emailHash,
      role: args.role,
      observedAt: args.observedAt,
    }),
    assertion: args.serviceAuth,
    now: Date.now(),
  })
  if (!verified || !args.serviceAuth.scopes.includes(args.scope)) {
    throw new WorkspaceInvitationError('authority_conflict')
  }
}

async function resolveActiveOrgBinding(
  db: MutationCtx['db'],
  clerkOrgId: string,
): Promise<Doc<'accountExternalOrganizationBindings'> | 'ignored' | 'conflict'> {
  const bindings = await db
    .query('accountExternalOrganizationBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_ORGANIZATION_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', clerkOrgId))
    .take(2)
  if (bindings.length > 1) return 'conflict'
  const [binding] = bindings
  if (binding === undefined || binding.lifecycle !== 'active') return 'ignored'
  return binding
}

async function recordOrganizationInvitationCreatedAudit(
  db: MutationCtx['db'],
  input: Readonly<{
    accountRef: string
    clerkOrgId: string
    invitationRefHash: string
    emailHash: string
    role: 'org:admin' | 'org:member'
    deliveryRefHash: string
    observedAt: number
    commandDigest: string
    createdAt: number
  }>,
): Promise<void> {
  const digestValue = input.deliveryRefHash.slice('sha256:'.length)
  const eventRef = auditEventIdFromDeliveryRefHash(input.deliveryRefHash)
  const toolRef = `clerk-org-invite:${digestValue}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventRef, 'AuditEventId'),
    eventType: 'account.workspace_invitation.created',
    actorKind: 'system',
    actorRef: CLERK_ORG_INVITATION_ACTOR_REF,
    activeAccountRef: input.accountRef,
    sourceSystem: 'clerk_observed',
    observedAt: input.observedAt,
    targetType: 'account',
    targetRef: input.accountRef,
    idempotencyKey: brandNonEmpty(toolRef, 'OperationKey'),
    correlationId: brandNonEmpty(toolRef, 'CorrelationId'),
    beforeState: 'not_observed',
    outcome: 'pending',
    evidenceRefs: [`clerk-delivery:${digestValue}`],
    redactedPayload: {
      clerkOrgId: input.clerkOrgId,
      invitationRefHash: input.invitationRefHash,
      emailHash: input.emailHash,
      role: input.role,
    },
    commandDigest: brandNonEmpty(input.commandDigest, 'SourceHash'),
    createdAt: input.createdAt,
  })
  if (!audit.valid) throw new Error(`workspace_invitation_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
}

async function recordOrganizationInvitationRevokedAudit(
  db: MutationCtx['db'],
  input: Readonly<{
    accountRef: string
    clerkOrgId: string
    invitationRefHash: string
    emailHash: string
    role: 'org:admin' | 'org:member'
    deliveryRefHash: string
    observedAt: number
    commandDigest: string
    createdAt: number
  }>,
): Promise<void> {
  const digestValue = input.deliveryRefHash.slice('sha256:'.length)
  const eventRef = auditEventIdFromDeliveryRefHash(input.deliveryRefHash)
  const toolRef = `clerk-org-invite:${digestValue}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventRef, 'AuditEventId'),
    eventType: 'account.workspace_invitation.revoked',
    actorKind: 'system',
    actorRef: WORKSPACE_INVITATION_SYSTEM_ACTOR_REF,
    activeAccountRef: input.accountRef,
    sourceSystem: 'clerk_observed',
    observedAt: input.observedAt,
    targetType: 'account',
    targetRef: input.accountRef,
    idempotencyKey: brandNonEmpty(toolRef, 'OperationKey'),
    correlationId: brandNonEmpty(toolRef, 'CorrelationId'),
    beforeState: 'pending',
    outcome: 'revoked',
    evidenceRefs: [`clerk-delivery:${digestValue}`],
    redactedPayload: {
      clerkOrgId: input.clerkOrgId,
      invitationRefHash: input.invitationRefHash,
      emailHash: input.emailHash,
      role: input.role,
    },
    commandDigest: brandNonEmpty(input.commandDigest, 'SourceHash'),
    createdAt: input.createdAt,
  })
  if (!audit.valid) throw new Error(`workspace_invitation_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
}

export const recordOrganizationInvitationCreatedForServer = mutation({
  args: {
    ...recordOrganizationInvitationInput,
    serviceAuth: serviceAssertion,
  },
  returns: recordResultValue,
  handler: async (ctx, args): Promise<RecordResult> => {
    const { serviceAuth, ...command } = args
    validateRecordCommand(command)
    await verifyRecordServiceAuth({
      ...command,
      serviceAuth,
      operation: RECORD_OPERATION,
      scope: RECORD_SCOPE,
    })

    const bindingResolution = await resolveActiveOrgBinding(ctx.db, command.clerkOrgId)
    if (bindingResolution === 'conflict') {
      throw new WorkspaceInvitationError('authority_conflict')
    }
    if (bindingResolution === 'ignored') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', bindingResolution.accountRef))
      .unique()
    if (account === null || account.lifecycle !== 'active') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const commandDigest = recordCommandDigest(command)
    const eventId = auditEventIdFromDeliveryRefHash(command.deliveryRefHash)
    const existingAudit = await ctx.db
      .query('auditEvents')
      .withIndex('by_eventId', (query) => query.eq('eventId', eventId))
      .unique()
    if (existingAudit !== null) {
      const replayed = existingAudit.activeAccountRef === account.accountRef
        && existingAudit.eventType === 'account.workspace_invitation.created'
        && existingAudit.payloadHash === commandDigest
      if (!replayed) {
        throw new WorkspaceInvitationError('authority_conflict')
      }
      return { kind: 'accepted', status: 'replayed' }
    }

    const now = Date.now()
    await recordOrganizationInvitationCreatedAudit(ctx.db, {
      accountRef: account.accountRef,
      clerkOrgId: command.clerkOrgId,
      invitationRefHash: command.invitationRefHash,
      emailHash: command.emailHash,
      role: command.role,
      deliveryRefHash: command.deliveryRefHash,
      observedAt: command.observedAt,
      commandDigest,
      createdAt: now,
    })
    return { kind: 'accepted', status: 'applied' }
  },
})

export const recordOrganizationInvitationRevokedForServer = mutation({
  args: {
    ...recordOrganizationInvitationInput,
    serviceAuth: serviceAssertion,
  },
  returns: recordResultValue,
  handler: async (ctx, args): Promise<RecordResult> => {
    const { serviceAuth, ...command } = args
    validateRecordCommand(command)
    await verifyRecordServiceAuth({
      ...command,
      serviceAuth,
      operation: RECORD_REVOKED_OPERATION,
      scope: RECORD_REVOKED_SCOPE,
    })

    const bindingResolution = await resolveActiveOrgBinding(ctx.db, command.clerkOrgId)
    if (bindingResolution === 'conflict') {
      throw new WorkspaceInvitationError('authority_conflict')
    }
    if (bindingResolution === 'ignored') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', bindingResolution.accountRef))
      .unique()
    if (account === null || account.lifecycle !== 'active') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const commandDigest = recordCommandDigest(command)
    const eventId = auditEventIdFromDeliveryRefHash(command.deliveryRefHash)
    const existingAudit = await ctx.db
      .query('auditEvents')
      .withIndex('by_eventId', (query) => query.eq('eventId', eventId))
      .unique()
    if (existingAudit !== null) {
      const replayed = existingAudit.activeAccountRef === account.accountRef
        && existingAudit.eventType === 'account.workspace_invitation.revoked'
        && existingAudit.payloadHash === commandDigest
      if (!replayed) {
        throw new WorkspaceInvitationError('authority_conflict')
      }
      return { kind: 'accepted', status: 'replayed' }
    }

    const now = Date.now()
    await recordOrganizationInvitationRevokedAudit(ctx.db, {
      accountRef: account.accountRef,
      clerkOrgId: command.clerkOrgId,
      invitationRefHash: command.invitationRefHash,
      emailHash: command.emailHash,
      role: command.role,
      deliveryRefHash: command.deliveryRefHash,
      observedAt: command.observedAt,
      commandDigest,
      createdAt: now,
    })
    return { kind: 'accepted', status: 'applied' }
  },
})
