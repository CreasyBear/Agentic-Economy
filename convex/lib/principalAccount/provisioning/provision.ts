import { v, type Infer } from 'convex/values'
import { generateAccountRef, generateOwnershipRef } from '../../../../src/modules/principal-account/account/public'
import { generateExternalIdentityBindingRef } from '../../../../src/modules/principal-account/external-identity/public'
import type { MutationCtx } from '../../../_generated/server'
import { serviceAssertion } from '../../../serviceAssertion'
import { CLERK_ORGANIZATION_PROVIDER_NAMESPACE } from '../interactiveAuthority/constants'
import { WorkspaceProvisioningError, type ProvisionDb } from './contracts'
import { resolveCreatorPrincipal } from './identity'
import { verifyProvisionServiceAuth } from './serviceAuth'

const CLERK_ORG_ID_PATTERN = /^org_[A-Za-z0-9_-]{1,195}$/u
const CORRELATION_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
const WORKSPACE_NAME_PATTERN = /^[\p{L}\p{N}\p{P}\p{S}\p{Zs}]+$/u

export const provisionOrganizationWorkspaceForServerResult = v.object({
  kind: v.union(v.literal('created'), v.literal('replayed')),
  accountRef: v.string(),
  ownershipRef: v.string(),
  bindingRef: v.string(),
})

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

function safeDisplayName(value: string): string {
  const trimmed = value.trim()
  return trimmed.length === 0 || trimmed.length > 200 || !WORKSPACE_NAME_PATTERN.test(trimmed)
    ? 'Business'
    : trimmed
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
  const trimmedDisplayName = safeDisplayName(input.displayName)
  validateCorrelationRef(input.correlationRef)

  const principal = await resolveCreatorPrincipal(ctx.db, input.creatorTokenIdentifier)
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

  return {
    kind: 'created',
    accountRef: newAccountRef,
    ownershipRef: newOwnershipRef,
    bindingRef: newBindingRef,
  }
}

export const provisionOrganizationWorkspaceForServerArgs = v.object({
  clerkOrgId: v.string(),
  displayName: v.string(),
  creatorTokenIdentifier: v.string(),
  correlationRef: v.string(),
  serviceAuth: serviceAssertion,
})

export const provisionOrganizationWorkspaceForServerHandler = async (ctx: MutationCtx, args: Infer<typeof provisionOrganizationWorkspaceForServerArgs>): Promise<ProvisionSuccess> => {
  await verifyProvisionServiceAuth(args)
  return await provisionOrganizationWorkspace(ctx, args)
}
