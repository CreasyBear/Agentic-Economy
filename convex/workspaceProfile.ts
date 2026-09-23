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
import { persistAuditEvent } from './securityShared'
import { serviceAssertion } from './serviceAssertion'
import { CLERK_ORGANIZATION_PROVIDER_NAMESPACE } from './workspaceProvisioning'

export const SYNC_OPERATION = 'workspaceProfile.syncOrganizationDisplayNameForServer'
export const SYNC_SCOPE = 'workspace:sync_organization_display_name'

const WORKSPACE_NAME_PATTERN = /^[\p{L}\p{N}\p{P}\p{S}\p{Zs}]+$/u
const CLERK_ORG_SYNC_ACTOR_REF = 'ae:clerk-organization-sync'

export type WorkspaceProfileErrorCode = 'authority_conflict' | 'display_name_invalid'

export class WorkspaceProfileError extends Error {
  readonly code: WorkspaceProfileErrorCode

  constructor(code: WorkspaceProfileErrorCode) {
    super(code)
    this.name = 'WorkspaceProfileError'
    this.code = code
  }
}

const syncResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: v.union(v.literal('applied'), v.literal('replayed'), v.literal('ignored')),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(v.literal('authority_conflict'), v.literal('display_name_invalid')),
  }),
)

type SyncResult = Readonly<
  | { kind: 'accepted'; status: 'applied' | 'replayed' | 'ignored' }
  | { kind: 'refused'; code: 'authority_conflict' | 'display_name_invalid' }
>

type SyncCommand = Readonly<{
  clerkOrgId: string
  displayName: string
  deliveryRefHash: string
  observedAt: number
}>

function validateDisplayName(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 200 || !WORKSPACE_NAME_PATTERN.test(trimmed)) {
    throw new WorkspaceProfileError('display_name_invalid')
  }
  return trimmed
}

function syncCommandDigest(command: SyncCommand & { displayName: string }): string {
  return canonicalDigest({
    clerkOrgId: command.clerkOrgId,
    displayName: command.displayName,
    deliveryRefHash: command.deliveryRefHash,
    observedAt: command.observedAt,
  })
}

function auditEventIdFromDeliveryRefHash(deliveryRefHash: string): string {
  const digestValue = deliveryRefHash.slice('sha256:'.length)
  return `audit:clerk-org-sync:${digestValue}`
}

async function verifySyncServiceAuth(
  args: Readonly<{
    clerkOrgId: string
    displayName: string
    deliveryRefHash: string
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
    operation: SYNC_OPERATION,
    command: toStableHashValue({
      clerkOrgId: args.clerkOrgId,
      displayName: args.displayName,
      deliveryRefHash: args.deliveryRefHash,
      observedAt: args.observedAt,
    }),
    assertion: args.serviceAuth,
    now: Date.now(),
  })
  if (!verified || !args.serviceAuth.scopes.includes(SYNC_SCOPE)) {
    throw new WorkspaceProfileError('authority_conflict')
  }
}

async function recordWorkspaceProfileSyncAudit(
  db: MutationCtx['db'],
  input: Readonly<{
    accountRef: string
    beforeDisplayName: string
    afterDisplayName: string
    clerkOrgId: string
    deliveryRefHash: string
    observedAt: number
    commandDigest: string
    createdAt: number
  }>,
): Promise<void> {
  const digestValue = input.deliveryRefHash.slice('sha256:'.length)
  const eventRef = auditEventIdFromDeliveryRefHash(input.deliveryRefHash)
  const toolRef = `clerk-org-sync:${digestValue}`
  const audit = createPackage3AuditEvent({
    eventId: brandNonEmpty(eventRef, 'AuditEventId'),
    eventType: 'account.workspace_profile.updated',
    actorKind: 'system',
    actorRef: CLERK_ORG_SYNC_ACTOR_REF,
    activeAccountRef: input.accountRef,
    sourceSystem: 'clerk_observed',
    observedAt: input.observedAt,
    targetType: 'account',
    targetRef: input.accountRef,
    idempotencyKey: brandNonEmpty(toolRef, 'OperationKey'),
    correlationId: brandNonEmpty(toolRef, 'CorrelationId'),
    beforeState: input.beforeDisplayName,
    outcome: input.afterDisplayName,
    evidenceRefs: [`clerk-delivery:${digestValue}`],
    redactedPayload: { clerkOrgId: input.clerkOrgId },
    commandDigest: brandNonEmpty(input.commandDigest, 'SourceHash'),
    createdAt: input.createdAt,
  })
  if (!audit.valid) throw new Error(`workspace_profile_sync_audit_invalid:${audit.reason}`)
  await persistAuditEvent(db, audit.event)
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

export const syncOrganizationDisplayNameForServer = mutation({
  args: {
    clerkOrgId: v.string(),
    displayName: v.string(),
    deliveryRefHash: v.string(),
    observedAt: v.number(),
    serviceAuth: serviceAssertion,
  },
  returns: syncResultValue,
  handler: async (ctx, args): Promise<SyncResult> => {
    await verifySyncServiceAuth(args)
    const trimmed = validateDisplayName(args.displayName)

    const bindingResolution = await resolveActiveOrgBinding(ctx.db, args.clerkOrgId)
    if (bindingResolution === 'conflict') {
      throw new WorkspaceProfileError('authority_conflict')
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

    const commandDigest = syncCommandDigest({
      clerkOrgId: args.clerkOrgId,
      displayName: trimmed,
      deliveryRefHash: args.deliveryRefHash,
      observedAt: args.observedAt,
    })
    const eventId = auditEventIdFromDeliveryRefHash(args.deliveryRefHash)
    const existingAudit = await ctx.db
      .query('auditEvents')
      .withIndex('by_eventId', (query) => query.eq('eventId', eventId))
      .unique()
    if (existingAudit !== null) {
      const replayed = existingAudit.activeAccountRef === account.accountRef
        && existingAudit.eventType === 'account.workspace_profile.updated'
        && existingAudit.payloadHash === commandDigest
      if (!replayed) {
        throw new WorkspaceProfileError('authority_conflict')
      }
      return { kind: 'accepted', status: 'replayed' }
    }

    const now = Date.now()

    if (account.displayName === trimmed) {
      await recordWorkspaceProfileSyncAudit(ctx.db, {
        accountRef: account.accountRef,
        beforeDisplayName: account.displayName,
        afterDisplayName: trimmed,
        clerkOrgId: args.clerkOrgId,
        deliveryRefHash: args.deliveryRefHash,
        observedAt: args.observedAt,
        commandDigest,
        createdAt: now,
      })
      return { kind: 'accepted', status: 'applied' }
    }

    if (args.observedAt < account.updatedAt) {
      return { kind: 'accepted', status: 'applied' }
    }

    await ctx.db.patch(account._id, {
      displayName: trimmed,
      revision: account.revision + 1,
      updatedAt: Math.max(now, args.observedAt),
    })
    await recordWorkspaceProfileSyncAudit(ctx.db, {
      accountRef: account.accountRef,
      beforeDisplayName: account.displayName,
      afterDisplayName: trimmed,
      clerkOrgId: args.clerkOrgId,
      deliveryRefHash: args.deliveryRefHash,
      observedAt: args.observedAt,
      commandDigest,
      createdAt: now,
    })
    return { kind: 'accepted', status: 'applied' }
  },
})
