import type { MutationCtx } from '../../../_generated/server'
import { RECORD_REVOKED_OPERATION, RECORD_REVOKED_SCOPE, auditEventIdFromDeliveryRefHash, recordCommandDigest, resolveActiveOrgBinding, validateRecordCommand, verifyRecordServiceAuth } from './auth'
import { recordOrganizationInvitationRevokedAudit } from './audit'
import { WorkspaceInvitationError, type RecordArgs, type RecordResult } from './contracts'

export const recordOrganizationInvitationRevokedForServerHandler = async (ctx: MutationCtx, args: RecordArgs): Promise<RecordResult> => {
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
}
