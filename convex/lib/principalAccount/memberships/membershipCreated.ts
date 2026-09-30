import type { MutationCtx } from '../../../_generated/server'
import { generateMembershipRef } from '../../../../src/modules/principal-account/account/public'
import { CLERK_USER_PROVIDER_NAMESPACE } from '../interactiveAuthority/constants'
import { RECORD_OPERATION, RECORD_SCOPE, auditEventIdFromDeliveryRefHash, recordCommandDigest, resolveOrgBindings, validateRecordCommand, verifyRecordServiceAuth } from './auth'
import { recordOrganizationMembershipCreatedAudit } from './audit'
import { CLERK_ORG_MEMBERSHIP_ACTOR_REF, WorkspaceMembershipError, type RecordArgs, type RecordResult } from './contracts'

export const recordOrganizationMembershipCreatedForServerHandler = async (ctx: MutationCtx, args: RecordArgs): Promise<RecordResult> => {
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
      return { kind: 'refused', code: 'organization_unbound' }
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
}
