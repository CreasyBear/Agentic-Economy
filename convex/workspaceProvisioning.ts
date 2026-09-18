import type { GenericDatabaseReader, UserIdentity } from 'convex/server'
import { v } from 'convex/values'

import {
  toStableHashValue,
  verifyCustomerRequestServiceAssertion,
} from '../src/modules/agent-access/service-auth-envelope'
import {
  generateAccountRef,
  generateOwnershipRef,
} from '../src/modules/principal-account/account/public'
import { generateExternalIdentityBindingRef } from '../src/modules/principal-account/external-identity/public'
import { principalRef } from '../src/modules/principal-account/principal/public'

import type { DataModel, Doc } from './_generated/dataModel'
import { env, mutation, type MutationCtx } from './_generated/server'
import { clerkActiveOrganizationId } from './interactiveAuthority'
import { serviceAssertion } from './serviceAssertion'

export const PROVISION_OPERATION = 'workspaceProvisioning.provisionOrganizationWorkspaceForServer'
export const PROVISION_SCOPE = 'workspace:provision_organization'
export const CLERK_ORGANIZATION_PROVIDER_NAMESPACE = 'clerk/organization' as const
export const CLERK_USER_PROVIDER_NAMESPACE = 'clerk/user' as const

const CLERK_ORG_ID_PATTERN = /^org_[A-Za-z0-9_-]{1,195}$/u
const CORRELATION_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
const WORKSPACE_NAME_PATTERN = /^[\p{L}\p{N}\p{P}\p{S}\p{Zs}]+$/u

export type WorkspaceProvisioningErrorCode =
  | 'creator_binding_missing'
  | 'creator_principal_inactive'
  | 'display_name_invalid'
  | 'clerk_org_id_invalid'
  | 'active_organization_mismatch'
  | 'identity_invalid'
  | 'authority_conflict'
  | 'correlation_ref_invalid'

export class WorkspaceProvisioningError extends Error {
  readonly code: WorkspaceProvisioningErrorCode

  constructor(code: WorkspaceProvisioningErrorCode) {
    super(code)
    this.name = 'WorkspaceProvisioningError'
    this.code = code
  }
}

const provisionSuccessValue = v.object({
  kind: v.union(v.literal('created'), v.literal('replayed')),
  accountRef: v.string(),
  ownershipRef: v.string(),
  bindingRef: v.string(),
})

type ProvisionDb = Pick<MutationCtx, 'db'>
type ProvisionSuccess = Readonly<{
  kind: 'created' | 'replayed'
  accountRef: string
  ownershipRef: string
  bindingRef: string
}>

function validateClerkOrgId(value: string): void {
  if (!CLERK_ORG_ID_PATTERN.test(value)) {
    throw new WorkspaceProvisioningError('clerk_org_id_invalid')
  }
}

function validateCorrelationRef(value: string): void {
  if (value.length < 3 || value.length > 128 || !CORRELATION_REF_PATTERN.test(value)) {
    throw new WorkspaceProvisioningError('correlation_ref_invalid')
  }
}

function validateDisplayName(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 200 || !WORKSPACE_NAME_PATTERN.test(trimmed)) {
    throw new WorkspaceProvisioningError('display_name_invalid')
  }
  return trimmed
}

async function resolveCreatorPrincipal(
  db: GenericDatabaseReader<DataModel>,
  creatorTokenIdentifier: string,
): Promise<Doc<'principals'>> {
  const bindings = await db
    .query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', creatorTokenIdentifier))
    .take(2)
  if (bindings.length !== 1) {
    throw new WorkspaceProvisioningError('creator_binding_missing')
  }
  const [binding] = bindings
  if (binding === undefined || binding.lifecycle !== 'active') {
    throw new WorkspaceProvisioningError('creator_binding_missing')
  }

  const principals = await db
    .query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .take(2)
  if (principals.length !== 1) {
    throw new WorkspaceProvisioningError('creator_binding_missing')
  }
  const [principal] = principals
  if (principal === undefined) {
    throw new WorkspaceProvisioningError('creator_binding_missing')
  }
  if (principal.lifecycle !== 'active') {
    throw new WorkspaceProvisioningError('creator_principal_inactive')
  }
  if (principal.kind !== 'human') {
    throw new WorkspaceProvisioningError('creator_binding_missing')
  }
  return principal
}

async function upsertSessionSelection(
  db: ProvisionDb['db'],
  canonicalPrincipalRef: string,
  activeAccountRef: string,
  correlationRefValue: string,
  now: number,
): Promise<void> {
  const existingRows = await db
    .query('interactiveSessionSelections')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', canonicalPrincipalRef))
    .take(2)
  if (existingRows.length > 1) {
    throw new WorkspaceProvisioningError('authority_conflict')
  }
  const [existing] = existingRows
  if (existing !== undefined) {
    await db.patch(existing._id, {
      activeAccountRef,
      revision: existing.revision + 1,
      selectedAt: now,
      lastCorrelationRef: correlationRefValue,
    })
    return
  }
  await db.insert('interactiveSessionSelections', {
    principalRef: canonicalPrincipalRef,
    activeAccountRef,
    revision: 1,
    selectedAt: now,
    lastCorrelationRef: correlationRefValue,
  })
}

async function provisionOrganizationWorkspace(
  ctx: ProvisionDb,
  input: Readonly<{
    clerkOrgId: string
    displayName: string
    creatorTokenIdentifier: string
    correlationRef: string
  }>,
): Promise<ProvisionSuccess> {
  validateClerkOrgId(input.clerkOrgId)
  const trimmedDisplayName = validateDisplayName(input.displayName)
  validateCorrelationRef(input.correlationRef)

  const principal = await resolveCreatorPrincipal(ctx.db, input.creatorTokenIdentifier)
  const canonicalPrincipalRef = principalRef(principal.principalRef)
  const idempotencyRef = `clerk-org:${input.clerkOrgId}`
  const now = Date.now()

  const orgBindings = await ctx.db
    .query('accountExternalOrganizationBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_ORGANIZATION_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', input.clerkOrgId))
    .take(2)
  if (orgBindings.length > 1) {
    throw new WorkspaceProvisioningError('authority_conflict')
  }
  const [existingOrgBinding] = orgBindings
  if (existingOrgBinding !== undefined && existingOrgBinding.lifecycle === 'active') {
    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', existingOrgBinding.accountRef))
      .unique()
    if (account === null || account.lifecycle !== 'active') {
      throw new WorkspaceProvisioningError('authority_conflict')
    }
    const ownership = await ctx.db
      .query('accountOwnerships')
      .withIndex('by_accountRef_and_ownerPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', existingOrgBinding.accountRef)
        .eq('ownerPrincipalRef', principal.principalRef)
        .eq('lifecycle', 'active'))
      .unique()
    if (ownership === null) {
      throw new WorkspaceProvisioningError('authority_conflict')
    }
    await upsertSessionSelection(
      ctx.db,
      canonicalPrincipalRef,
      existingOrgBinding.accountRef,
      input.correlationRef,
      now,
    )
    return {
      kind: 'replayed',
      accountRef: existingOrgBinding.accountRef,
      ownershipRef: ownership.ownershipRef,
      bindingRef: existingOrgBinding.bindingRef,
    }
  }

  const newAccountRef = generateAccountRef()
  const newOwnershipRef = generateOwnershipRef()
  const newBindingRef = generateExternalIdentityBindingRef()

  await ctx.db.insert('accounts', {
    accountRef: newAccountRef,
    displayName: trimmedDisplayName,
    lifecycle: 'active',
    recoveryPolicy: { kind: 'no_transfer', revision: 1 },
    creationActorPrincipalRef: principal.principalRef,
    creationIdempotencyRef: idempotencyRef,
    initialOwnershipRef: newOwnershipRef,
    currentOwnershipRef: newOwnershipRef,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    lastAction: {
      actorPrincipalRef: principal.principalRef,
      activeAccountRef: newAccountRef,
      correlationRef: input.correlationRef,
      idempotencyRef,
    },
  })
  await ctx.db.insert('accountOwnerships', {
    ownershipRef: newOwnershipRef,
    accountRef: newAccountRef,
    ownerPrincipalRef: principal.principalRef,
    lifecycle: 'active',
    changeKind: 'creation',
    revision: 1,
    createdAt: now,
    createdBy: {
      actorPrincipalRef: principal.principalRef,
      activeAccountRef: newAccountRef,
      correlationRef: input.correlationRef,
      idempotencyRef,
    },
  })
  await ctx.db.insert('accountExternalOrganizationBindings', {
    bindingRef: newBindingRef,
    accountRef: newAccountRef,
    providerNamespace: CLERK_ORGANIZATION_PROVIDER_NAMESPACE,
    providerIdentifier: input.clerkOrgId,
    lifecycle: 'active',
    revision: 1,
    createdAt: now,
    updatedAt: now,
  })
  await upsertSessionSelection(
    ctx.db,
    canonicalPrincipalRef,
    newAccountRef,
    input.correlationRef,
    now,
  )

  return {
    kind: 'created',
    accountRef: newAccountRef,
    ownershipRef: newOwnershipRef,
    bindingRef: newBindingRef,
  }
}

async function verifyProvisionServiceAuth(
  args: Readonly<{
    clerkOrgId: string
    displayName: string
    creatorTokenIdentifier: string
    correlationRef: string
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
    operation: PROVISION_OPERATION,
    command: toStableHashValue({
      clerkOrgId: args.clerkOrgId,
      displayName: args.displayName,
      creatorTokenIdentifier: args.creatorTokenIdentifier,
      correlationRef: args.correlationRef,
    }),
    assertion: args.serviceAuth,
    now: Date.now(),
  })
  if (!verified || !args.serviceAuth.scopes.includes(PROVISION_SCOPE)) {
    throw new WorkspaceProvisioningError('authority_conflict')
  }
}

async function requireInteractiveHumanPrincipal(
  db: GenericDatabaseReader<DataModel>,
  identity: UserIdentity,
): Promise<Doc<'principals'>> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
    throw new WorkspaceProvisioningError('identity_invalid')
  }
  return await resolveCreatorPrincipal(db, tokenIdentifier)
}

function displayNameFromClaim(
  identity: UserIdentity,
  displayName: string | undefined,
): string {
  if (displayName !== undefined) {
    return displayName
  }
  const orgName = identity.org_name
  if (typeof orgName === 'string' && orgName.trim().length > 0) {
    return orgName.trim()
  }
  return 'Workspace'
}

export const provisionOrganizationWorkspaceForServer = mutation({
  args: {
    clerkOrgId: v.string(),
    displayName: v.string(),
    creatorTokenIdentifier: v.string(),
    correlationRef: v.string(),
    serviceAuth: serviceAssertion,
  },
  returns: provisionSuccessValue,
  handler: async (ctx, args): Promise<ProvisionSuccess> => {
    await verifyProvisionServiceAuth(args)
    return await provisionOrganizationWorkspace(ctx, args)
  },
})

export const claimCreatedWorkspace = mutation({
  args: {
    clerkOrgId: v.string(),
    displayName: v.optional(v.string()),
    correlationRef: v.string(),
  },
  returns: provisionSuccessValue,
  handler: async (ctx, args): Promise<ProvisionSuccess> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new WorkspaceProvisioningError('identity_invalid')
    }

    const activeOrgId = clerkActiveOrganizationId(identity)
    if (activeOrgId === null || activeOrgId !== args.clerkOrgId) {
      throw new WorkspaceProvisioningError('active_organization_mismatch')
    }

    validateClerkOrgId(args.clerkOrgId)
    validateCorrelationRef(args.correlationRef)

    await requireInteractiveHumanPrincipal(ctx.db, identity)
    const resolvedDisplayName = validateDisplayName(
      displayNameFromClaim(identity, args.displayName),
    )

    const tokenIdentifier = identity.tokenIdentifier
    if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
      throw new WorkspaceProvisioningError('identity_invalid')
    }

    return await provisionOrganizationWorkspace(ctx, {
      clerkOrgId: args.clerkOrgId,
      displayName: resolvedDisplayName,
      creatorTokenIdentifier: tokenIdentifier,
      correlationRef: args.correlationRef,
    })
  },
})
