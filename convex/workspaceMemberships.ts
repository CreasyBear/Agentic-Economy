import { v } from 'convex/values'

import {
  toStableHashValue,
  verifyCustomerRequestServiceAssertion,
} from '../src/modules/agent-access/service-auth-envelope'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { brandNonEmpty } from '../src/modules/common/ids'
import { createPackage3AuditEvent } from '../src/modules/observability/public'
import { generateMembershipRef } from '../src/modules/principal-account/account/public'

import type { Doc } from './_generated/dataModel'
import { env, mutation, type MutationCtx } from './_generated/server'
import { persistAuditEvent } from './lib/security/audit/persistence'
import { serviceAssertion } from './serviceAssertion'
import {
  CLERK_ORGANIZATION_PROVIDER_NAMESPACE,
  CLERK_USER_PROVIDER_NAMESPACE,
} from './workspaceProvisioning'

export const RECORD_OPERATION = 'workspaceMemberships.recordOrganizationMembershipCreatedForServer'
export const RECORD_SCOPE = 'workspace:record_organization_membership_created'
export const RECORD_UPDATED_OPERATION =
  'workspaceMemberships.recordOrganizationMembershipUpdatedForServer'
export const RECORD_UPDATED_SCOPE = 'workspace:record_organization_membership_updated'
export const RECORD_DELETED_OPERATION =
  'workspaceMemberships.recordOrganizationMembershipDeletedForServer'
export const RECORD_DELETED_SCOPE = 'workspace:record_organization_membership_deleted'

export const recordOrganizationMembershipInput = {
  clerkOrgId: v.string(),
  providerIdentifier: v.string(),
  deliveryRefHash: v.string(),
  membershipRefHash: v.string(),
  role: v.union(v.literal('org:admin'), v.literal('org:member')),
  observedAt: v.number(),
}

const digestPattern = /^sha256:[0-9a-f]{64}$/u
const clerkOrgIdPattern = /^org_/
const CLERK_ORG_MEMBERSHIP_ACTOR_REF = 'ae:clerk-organization-membership'
const WORKSPACE_MEMBERSHIP_SYSTEM_ACTOR_REF = CLERK_ORG_MEMBERSHIP_ACTOR_REF

export type WorkspaceMembershipErrorCode = 'authority_conflict'

export class WorkspaceMembershipError extends Error {
  readonly code: WorkspaceMembershipErrorCode

  constructor(code: WorkspaceMembershipErrorCode) {
    super(code)
    this.name = 'WorkspaceMembershipError'
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
    code: v.union(v.literal('authority_conflict'), v.literal('identity_binding_missing')),
  }),
)

type RecordResult = Readonly<
  | { kind: 'accepted'; status: 'applied' | 'replayed' | 'ignored' }
  | { kind: 'refused'; code: 'authority_conflict' | 'identity_binding_missing' }
>

type RecordCommand = Readonly<{
  clerkOrgId: string
  providerIdentifier: string
  deliveryRefHash: string
  membershipRefHash: string
  role: 'org:admin' | 'org:member'
  observedAt: number
}>

function validateRecordCommand(command: RecordCommand): void {
  if (!clerkOrgIdPattern.test(command.clerkOrgId)) {
    throw new WorkspaceMembershipError('authority_conflict')
  }
  if (
    !digestPattern.test(command.deliveryRefHash)
    || !digestPattern.test(command.membershipRefHash)
  ) {
    throw new WorkspaceMembershipError('authority_conflict')
  }
}

function recordCommandDigest(command: RecordCommand): string {
  return canonicalDigest({
    clerkOrgId: command.clerkOrgId,
    providerIdentifier: command.providerIdentifier,
    deliveryRefHash: command.deliveryRefHash,
    membershipRefHash: command.membershipRefHash,
    role: command.role,
    observedAt: command.observedAt,
  })
}

function auditEventIdFromDeliveryRefHash(deliveryRefHash: string): string {
  const digestValue = deliveryRefHash.slice('sha256:'.length)
  return `audit:clerk-org-membership:${digestValue}`
}

async function verifyRecordServiceAuth(
  args: Readonly<{
    operation: string
    scope: string
    clerkOrgId: string
    providerIdentifier: string
    deliveryRefHash: string
    membershipRefHash: string
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
      providerIdentifier: args.providerIdentifier,
      deliveryRefHash: args.deliveryRefHash,
      membershipRefHash: args.membershipRefHash,
      role: args.role,
      observedAt: args.observedAt,
    }),
    assertion: args.serviceAuth,
    now: Date.now(),
  })
  if (!verified || !args.serviceAuth.scopes.includes(args.scope)) {
    throw new WorkspaceMembershipError('authority_conflict')
  }
}

async function resolveOrgBindings(
  db: MutationCtx['db'],
  clerkOrgId: string,
): Promise<Doc<'accountExternalOrganizationBindings'>[] | 'conflict'> {
  const bindings = await db
    .query('accountExternalOrganizationBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_ORGANIZATION_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', clerkOrgId))
    .take(2)
  if (bindings.length > 1) return 'conflict'
  return bindings
}

async function recordOrganizationMembershipCreatedAudit(
  db: MutationCtx['db'],
  input: Readonly<{
    accountRef: string
    clerkOrgId: string
    membershipRefHash: string
    role: 'org:admin' | 'org:member'
    memberPrincipalRef: string
    deliveryRefHash: string
    observedAt: number
    commandDigest: string
    createdAt: number
  }>,
): Promise<void> {
  const digestValue = input.deliveryRefHash.slice('sha256:'.length)
  const eventRef = auditEventIdFromDeliveryRefHash(input.deliveryRefHash)
  const toolRef = `clerk-org-membership:${digestValue}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventRef, 'AuditEventId'),
    eventType: 'account.workspace_membership.created',
    actorKind: 'system',
    actorRef: CLERK_ORG_MEMBERSHIP_ACTOR_REF,
    activeAccountRef: input.accountRef,
    sourceSystem: 'clerk_observed',
    observedAt: input.observedAt,
    targetType: 'account',
    targetRef: input.accountRef,
    idempotencyKey: brandNonEmpty(toolRef, 'OperationKey'),
    correlationId: brandNonEmpty(toolRef, 'CorrelationId'),
    beforeState: 'not_observed',
    outcome: 'active',
    evidenceRefs: [`clerk-delivery:${digestValue}`],
    redactedPayload: {
      clerkOrgId: input.clerkOrgId,
      membershipRefHash: input.membershipRefHash,
      role: input.role,
      memberPrincipalRef: input.memberPrincipalRef,
    },
    commandDigest: brandNonEmpty(input.commandDigest, 'SourceHash'),
    createdAt: input.createdAt,
  })
  if (!audit.valid) throw new Error(`workspace_membership_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
}

async function recordOrganizationMembershipUpdatedAudit(
  db: MutationCtx['db'],
  input: Readonly<{
    accountRef: string
    clerkOrgId: string
    membershipRefHash: string
    role: 'org:admin' | 'org:member'
    memberPrincipalRef: string
    deliveryRefHash: string
    observedAt: number
    commandDigest: string
    beforeState: string
    createdAt: number
  }>,
): Promise<void> {
  const digestValue = input.deliveryRefHash.slice('sha256:'.length)
  const eventRef = auditEventIdFromDeliveryRefHash(input.deliveryRefHash)
  const toolRef = `clerk-org-membership:${digestValue}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventRef, 'AuditEventId'),
    eventType: 'account.workspace_membership.updated',
    actorKind: 'system',
    actorRef: WORKSPACE_MEMBERSHIP_SYSTEM_ACTOR_REF,
    activeAccountRef: input.accountRef,
    sourceSystem: 'clerk_observed',
    observedAt: input.observedAt,
    targetType: 'account',
    targetRef: input.accountRef,
    idempotencyKey: brandNonEmpty(toolRef, 'OperationKey'),
    correlationId: brandNonEmpty(toolRef, 'CorrelationId'),
    beforeState: input.beforeState,
    outcome: input.role,
    evidenceRefs: [`clerk-delivery:${digestValue}`],
    redactedPayload: {
      clerkOrgId: input.clerkOrgId,
      membershipRefHash: input.membershipRefHash,
      role: input.role,
      memberPrincipalRef: input.memberPrincipalRef,
    },
    commandDigest: brandNonEmpty(input.commandDigest, 'SourceHash'),
    createdAt: input.createdAt,
  })
  if (!audit.valid) throw new Error(`workspace_membership_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
}

async function recordOrganizationMembershipDeletedAudit(
  db: MutationCtx['db'],
  input: Readonly<{
    accountRef: string
    clerkOrgId: string
    membershipRefHash: string
    role: 'org:admin' | 'org:member'
    memberPrincipalRef: string
    deliveryRefHash: string
    observedAt: number
    commandDigest: string
    beforeState: string
    createdAt: number
  }>,
): Promise<void> {
  const digestValue = input.deliveryRefHash.slice('sha256:'.length)
  const eventRef = auditEventIdFromDeliveryRefHash(input.deliveryRefHash)
  const toolRef = `clerk-org-membership:${digestValue}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventRef, 'AuditEventId'),
    eventType: 'account.workspace_membership.deleted',
    actorKind: 'system',
    actorRef: WORKSPACE_MEMBERSHIP_SYSTEM_ACTOR_REF,
    activeAccountRef: input.accountRef,
    sourceSystem: 'clerk_observed',
    observedAt: input.observedAt,
    targetType: 'account',
    targetRef: input.accountRef,
    idempotencyKey: brandNonEmpty(toolRef, 'OperationKey'),
    correlationId: brandNonEmpty(toolRef, 'CorrelationId'),
    beforeState: input.beforeState,
    outcome: 'ended',
    evidenceRefs: [`clerk-delivery:${digestValue}`],
    redactedPayload: {
      clerkOrgId: input.clerkOrgId,
      membershipRefHash: input.membershipRefHash,
      role: input.role,
      memberPrincipalRef: input.memberPrincipalRef,
    },
    commandDigest: brandNonEmpty(input.commandDigest, 'SourceHash'),
    createdAt: input.createdAt,
  })
  if (!audit.valid) throw new Error(`workspace_membership_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
}

export const recordOrganizationMembershipCreatedForServer = mutation({
  args: {
    ...recordOrganizationMembershipInput,
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

    const bindingsResolution = await resolveOrgBindings(ctx.db, command.clerkOrgId)
    if (bindingsResolution === 'conflict') {
      throw new WorkspaceMembershipError('authority_conflict')
    }
    const [binding] = bindingsResolution
    if (binding === undefined || binding.lifecycle !== 'active') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', binding.accountRef))
      .unique()
    if (account === null || account.lifecycle !== 'active') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const identityBindings = await ctx.db
      .query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
        .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
        .eq('providerIdentifier', command.providerIdentifier))
      .take(2)
    if (identityBindings.length === 0) {
      return { kind: 'refused', code: 'identity_binding_missing' }
    }
    if (identityBindings.length > 1) {
      throw new WorkspaceMembershipError('authority_conflict')
    }
    const [identityBinding] = identityBindings
    if (identityBinding === undefined || identityBinding.lifecycle !== 'active') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const principal = await ctx.db
      .query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', identityBinding.principalRef))
      .unique()
    if (principal === null || principal.lifecycle !== 'active') {
      return { kind: 'accepted', status: 'ignored' }
    }
    if (principal.kind !== 'human') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const activeOwnerships = await ctx.db
      .query('accountOwnerships')
      .withIndex('by_accountRef_and_lifecycle', (query) => query
        .eq('accountRef', account.accountRef)
        .eq('lifecycle', 'active'))
      .collect()
    if (activeOwnerships.some((ownership) => ownership.ownerPrincipalRef === principal.principalRef)) {
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
        && existingAudit.eventType === 'account.workspace_membership.created'
        && existingAudit.payloadHash === commandDigest
      if (!replayed) {
        throw new WorkspaceMembershipError('authority_conflict')
      }
      return { kind: 'accepted', status: 'replayed' }
    }

    const existingMembership = await ctx.db
      .query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', account.accountRef)
        .eq('memberPrincipalRef', principal.principalRef)
        .eq('lifecycle', 'active'))
      .unique()
    if (existingMembership !== null) {
      return { kind: 'accepted', status: 'replayed' }
    }

    const now = Date.now()
    const digestValue = command.deliveryRefHash.slice('sha256:'.length)
    const toolRef = `clerk-org-membership:${digestValue}`
    const membershipRef = generateMembershipRef()
    await ctx.db.insert('memberships', {
      membershipRef,
      accountRef: account.accountRef,
      memberPrincipalRef: principal.principalRef,
      role: command.role,
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      createdBy: {
        actorPrincipalRef: CLERK_ORG_MEMBERSHIP_ACTOR_REF,
        activeAccountRef: account.accountRef,
        correlationRef: toolRef,
        idempotencyRef: toolRef,
      },
    })

    await recordOrganizationMembershipCreatedAudit(ctx.db, {
      accountRef: account.accountRef,
      clerkOrgId: command.clerkOrgId,
      membershipRefHash: command.membershipRefHash,
      role: command.role,
      memberPrincipalRef: principal.principalRef,
      deliveryRefHash: command.deliveryRefHash,
      observedAt: command.observedAt,
      commandDigest,
      createdAt: now,
    })
    return { kind: 'accepted', status: 'applied' }
  },
})

export const recordOrganizationMembershipUpdatedForServer = mutation({
  args: {
    ...recordOrganizationMembershipInput,
    serviceAuth: serviceAssertion,
  },
  returns: recordResultValue,
  handler: async (ctx, args): Promise<RecordResult> => {
    const { serviceAuth, ...command } = args
    validateRecordCommand(command)
    await verifyRecordServiceAuth({
      ...command,
      serviceAuth,
      operation: RECORD_UPDATED_OPERATION,
      scope: RECORD_UPDATED_SCOPE,
    })

    const bindingsResolution = await resolveOrgBindings(ctx.db, command.clerkOrgId)
    if (bindingsResolution === 'conflict') {
      throw new WorkspaceMembershipError('authority_conflict')
    }
    const [binding] = bindingsResolution
    if (binding === undefined || binding.lifecycle !== 'active') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', binding.accountRef))
      .unique()
    if (account === null || account.lifecycle !== 'active') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const identityBindings = await ctx.db
      .query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
        .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
        .eq('providerIdentifier', command.providerIdentifier))
      .take(2)
    if (identityBindings.length === 0) {
      return { kind: 'refused', code: 'identity_binding_missing' }
    }
    if (identityBindings.length > 1) {
      throw new WorkspaceMembershipError('authority_conflict')
    }
    const [identityBinding] = identityBindings
    if (identityBinding === undefined || identityBinding.lifecycle !== 'active') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const principal = await ctx.db
      .query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', identityBinding.principalRef))
      .unique()
    if (principal === null || principal.lifecycle !== 'active' || principal.kind !== 'human') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const ownerOwnership = await ctx.db
      .query('accountOwnerships')
      .withIndex('by_accountRef_and_ownerPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', account.accountRef)
        .eq('ownerPrincipalRef', principal.principalRef)
        .eq('lifecycle', 'active'))
      .unique()
    if (ownerOwnership !== null) {
      return { kind: 'accepted', status: 'ignored' }
    }

    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', account.accountRef)
        .eq('memberPrincipalRef', principal.principalRef)
        .eq('lifecycle', 'active'))
      .unique()
    if (membership === null || membership.lifecycle !== 'active') {
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
        && existingAudit.eventType === 'account.workspace_membership.updated'
        && existingAudit.payloadHash === commandDigest
      if (!replayed) {
        throw new WorkspaceMembershipError('authority_conflict')
      }
      return { kind: 'accepted', status: 'replayed' }
    }

    if (membership.role === command.role) {
      return { kind: 'accepted', status: 'replayed' }
    }

    const now = Date.now()
    const beforeState = membership.role ?? 'unspecified'
    await ctx.db.patch(membership._id, {
      role: command.role,
      revision: membership.revision + 1,
    })

    await recordOrganizationMembershipUpdatedAudit(ctx.db, {
      accountRef: account.accountRef,
      clerkOrgId: command.clerkOrgId,
      membershipRefHash: command.membershipRefHash,
      role: command.role,
      memberPrincipalRef: principal.principalRef,
      deliveryRefHash: command.deliveryRefHash,
      observedAt: command.observedAt,
      commandDigest,
      beforeState,
      createdAt: now,
    })
    return { kind: 'accepted', status: 'applied' }
  },
})

export const recordOrganizationMembershipDeletedForServer = mutation({
  args: {
    ...recordOrganizationMembershipInput,
    serviceAuth: serviceAssertion,
  },
  returns: recordResultValue,
  handler: async (ctx, args): Promise<RecordResult> => {
    const { serviceAuth, ...command } = args
    validateRecordCommand(command)
    await verifyRecordServiceAuth({
      ...command,
      serviceAuth,
      operation: RECORD_DELETED_OPERATION,
      scope: RECORD_DELETED_SCOPE,
    })

    const bindingsResolution = await resolveOrgBindings(ctx.db, command.clerkOrgId)
    if (bindingsResolution === 'conflict') {
      throw new WorkspaceMembershipError('authority_conflict')
    }
    const [binding] = bindingsResolution
    if (binding === undefined || binding.lifecycle !== 'active') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', binding.accountRef))
      .unique()
    if (account === null || account.lifecycle !== 'active') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const identityBindings = await ctx.db
      .query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
        .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
        .eq('providerIdentifier', command.providerIdentifier))
      .take(2)
    if (identityBindings.length === 0) {
      return { kind: 'refused', code: 'identity_binding_missing' }
    }
    if (identityBindings.length > 1) {
      throw new WorkspaceMembershipError('authority_conflict')
    }
    const [identityBinding] = identityBindings
    if (identityBinding === undefined || identityBinding.lifecycle !== 'active') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const principal = await ctx.db
      .query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', identityBinding.principalRef))
      .unique()
    if (principal === null || principal.lifecycle !== 'active' || principal.kind !== 'human') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const ownerOwnership = await ctx.db
      .query('accountOwnerships')
      .withIndex('by_accountRef_and_ownerPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', account.accountRef)
        .eq('ownerPrincipalRef', principal.principalRef)
        .eq('lifecycle', 'active'))
      .unique()
    if (ownerOwnership !== null) {
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
        && existingAudit.eventType === 'account.workspace_membership.deleted'
        && existingAudit.payloadHash === commandDigest
      if (!replayed) {
        throw new WorkspaceMembershipError('authority_conflict')
      }
      return { kind: 'accepted', status: 'replayed' }
    }

    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', account.accountRef)
        .eq('memberPrincipalRef', principal.principalRef)
        .eq('lifecycle', 'active'))
      .unique()
    if (membership === null || membership.lifecycle !== 'active') {
      return { kind: 'accepted', status: 'ignored' }
    }

    const sessionSelections = await ctx.db
      .query('interactiveSessionSelections')
      .withIndex('by_principalRef_and_activeAccountRef', (query) => query
        .eq('principalRef', principal.principalRef)
        .eq('activeAccountRef', account.accountRef))
      .collect()
    for (const row of sessionSelections) {
      await ctx.db.delete(row._id)
    }

    const digestValue = command.deliveryRefHash.slice('sha256:'.length)
    const toolRef = `clerk-org-membership:${digestValue}`
    const beforeState = membership.role ?? 'unspecified'
    await ctx.db.patch(membership._id, {
      lifecycle: 'ended',
      endedAt: command.observedAt,
      endedBy: {
        actorPrincipalRef: CLERK_ORG_MEMBERSHIP_ACTOR_REF,
        activeAccountRef: account.accountRef,
        correlationRef: toolRef,
        idempotencyRef: toolRef,
      },
      revision: membership.revision + 1,
    })

    const now = Date.now()
    await recordOrganizationMembershipDeletedAudit(ctx.db, {
      accountRef: account.accountRef,
      clerkOrgId: command.clerkOrgId,
      membershipRefHash: command.membershipRefHash,
      role: command.role,
      memberPrincipalRef: principal.principalRef,
      deliveryRefHash: command.deliveryRefHash,
      observedAt: command.observedAt,
      commandDigest,
      beforeState,
      createdAt: now,
    })
    return { kind: 'accepted', status: 'applied' }
  },
})
