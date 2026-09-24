import type { UserIdentity } from 'convex/server'
import type { MutationCtx } from '../../../_generated/server'
import { ensureOwnerIdentityForAuthenticatedIdentity } from '../../../interactiveAuthority'
import {
  DEV_SEED_CATALOG_ACCOUNT_NAME,
  DEV_SEED_CATALOG_ACCOUNT_REF,
  DEV_SEED_CATALOG_GRANT_REF,
  DEV_SEED_CATALOG_PRINCIPAL_NAME,
  DEV_SEED_CATALOG_PRINCIPAL_REF,
  DEV_SEED_CATALOG_RESOURCE,
  DEV_SEED_CATALOG_SCOPE,
} from './authority' 

const DEV_SEED_CATALOG_OWNERSHIP_REF = 'own_d2000000000000000000000000000001'
// Each provision refreshes the fixture grant's live window so a deployment that
// sat idle past a previous TTL self-heals on the next seed run instead of
// failing delegation admission with dev_seed_catalog_authority_denied.
const DEV_SEED_CATALOG_GRANT_TTL_MS = 60 * 60 * 1000

// Self-healing bootstrap for the dev-catalog seed's fixed machine identity
// (prn_d200…/acc_d200…/own_d200…/grt_d200…). admitDevSeedCatalogAuthority
// remains the sole authority sink: this only inserts the canonical rows it
// consumes (same shapes as tests/integration/dev-seed-public-catalog-facts.test.ts)
// when absent, so it is safe to run on every stack bring-up.
export async function provisionDevSeedCatalogIdentityRows(ctx: MutationCtx): Promise<string[]> {
  const now = Date.now()
  const created: string[] = []
  const principal = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', DEV_SEED_CATALOG_PRINCIPAL_REF))
    .unique()
  if (principal === null) {
    await ctx.db.insert('principals', {
      principalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      kind: 'workload',
      displayName: DEV_SEED_CATALOG_PRINCIPAL_NAME,
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    created.push('principal')
  }
  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', DEV_SEED_CATALOG_ACCOUNT_REF))
    .unique()
  if (account === null) {
    await ctx.db.insert('accounts', {
      accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      displayName: DEV_SEED_CATALOG_ACCOUNT_NAME,
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      creationIdempotencyRef: 'dev-seed-account:create',
      initialOwnershipRef: DEV_SEED_CATALOG_OWNERSHIP_REF,
      currentOwnershipRef: DEV_SEED_CATALOG_OWNERSHIP_REF,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      lastAction: {
        actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
        activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
        correlationRef: 'dev-seed-account:create',
        idempotencyRef: 'dev-seed-account:create',
      },
    })
    created.push('account')
  }
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', DEV_SEED_CATALOG_OWNERSHIP_REF))
    .unique()
  if (ownership === null) {
    await ctx.db.insert('accountOwnerships', {
      ownershipRef: DEV_SEED_CATALOG_OWNERSHIP_REF,
      accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      ownerPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: now,
      createdBy: {
        actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
        activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
        correlationRef: 'dev-seed-ownership:create',
        idempotencyRef: 'dev-seed-ownership:create',
      },
    })
    created.push('ownership')
  }
  const grant = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', DEV_SEED_CATALOG_GRANT_REF))
    .unique()
  if (grant === null) {
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef: DEV_SEED_CATALOG_GRANT_REF,
      accountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
      actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      subjectPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
      scopes: [DEV_SEED_CATALOG_SCOPE],
      resourceRefs: [DEV_SEED_CATALOG_RESOURCE],
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt: now + DEV_SEED_CATALOG_GRANT_TTL_MS,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: now,
      createdBy: {
        actorPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
        activeAccountRef: DEV_SEED_CATALOG_ACCOUNT_REF,
        correlationRef: 'dev-seed-grant:create',
        idempotencyRef: 'dev-seed-grant:create',
      },
    })
    created.push('grant')
  } else if (grant.lifecycle !== 'active' || grant.expiresAt <= now) {
    await ctx.db.patch(grant._id, {
      lifecycle: 'active',
      expiresAt: now + DEV_SEED_CATALOG_GRANT_TTL_MS,
      revision: grant.revision + 1,
    })
    created.push('grant')
  }
  return created
}

/*
 * Local-E2E owner identity.
 *
 * Shape (a): the local Clerk-bypass `ae connect` already creates the canonical
 * agent identity Quote needs. `src/lib/server/agent-access-oauth-api.ts`
 * (issueGrantKey -> issueAgentAccessKey) calls
 * `agentAccessPrincipals.registerIssuedAgentBindingForServer`, and that one
 * mutation writes the whole chain in a single transaction: the `prn_` agent
 * Principal, its Membership in the owner Account, the `clerk/api-key`
 * externalIdentityBinding, the api_key Credential, the root
 * authorityDelegationGrants row (DelegationService.issueRoot), the
 * agentAccessGrants row and the agentAccessPrincipals row. It is the ONLY
 * writer of an `agent` Principal in the product.
 *
 * So the seed must not mint an agent identity of its own:
 *   - that mutation is public and gated on a verified Clerk identity plus an
 *     HMAC service assertion, so an internal seed mutation cannot call it, and
 *   - the credential id is minted per consent by `issueAgentAccessKey`
 *     (src/modules/agent-access/agent-access.ts, called via issueGrantKey
 *     above), so there is no fixed local credential to pre-bind.
 * The previous fabricated `clerk_api_key:ak_local_e2e_owner` principal could
 * never be admitted anyway: `candidateMatchesCanonical`
 * (convex/lib/capabilityExecution/callLifecycle/agentCallAuthority.ts) requires
 * `principalId === canonical.principalRef`, and a principalRef must match the
 * `prn_...` pattern.
 *
 * What the seed owns instead is the OWNER side that `ae connect` attaches to:
 * the interactive owner identity for the fixed bypass session token
 * (`src/lib/server/convex-source.ts` sets subject `dev-seed-owner-session`),
 * provisioned through the same product helper the interactive path uses
 * (`ensureOwnerIdentityForAuthenticatedIdentity`,
 * convex/interactiveAuthority.ts), plus that account's legal-customer binding.
 * Because provisioning is keyed on the provider token identifier, a later
 * `ae connect` finds and reuses this exact Principal + Account rather than
 * creating a second identity.
 */
const LOCAL_E2E_OPERATOR_SUBJECT = 'dev-seed-owner-session'
const LOCAL_E2E_OWNER_IDENTITY: UserIdentity = Object.freeze({
  subject: LOCAL_E2E_OPERATOR_SUBJECT,
  issuer: 'https://convex.test',
  tokenIdentifier: `https://convex.test|${LOCAL_E2E_OPERATOR_SUBJECT}`,
  name: 'Dev Seed Owner',
})

type LocalE2EOwnerAuthority = Readonly<{ principalRef: string; accountRef: string }>

/**
 * Idempotently ensure the bypass owner's canonical interactive identity and
 * return its current Principal + Account. Both sandbox seed commands below
 * write only sandbox-scoped facts, so a deployment whose owner account already
 * carries a production agent refuses instead of seeding into it.
 */
export async function requireLocalE2EOwnerAuthority(ctx: MutationCtx): Promise<LocalE2EOwnerAuthority> {
  const refs = await ensureOwnerIdentityForAuthenticatedIdentity(ctx, LOCAL_E2E_OWNER_IDENTITY)
  if (refs === null) throw new Error('dev_seed_local_e2e_owner_identity_unavailable')
  const accountRef = refs.accountRef ?? (await ctx.db.query('accountOwnerships')
    .withIndex('by_ownerPrincipalRef_and_lifecycle', (query) => query
      .eq('ownerPrincipalRef', refs.principalRef)
      .eq('lifecycle', 'active'))
    .unique())?.accountRef
  if (accountRef === undefined) throw new Error('dev_seed_local_e2e_owner_account_missing')
  const production = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_ownerId_and_lifecycle', (query) => query
      .eq('ownerId', accountRef)
      .eq('lifecycle', 'active'))
    .take(50)
  const offending = production.find(({ environment }) => environment !== 'sandbox')
  if (offending !== undefined) {
    throw new Error(
      `dev_seed_requires_sandbox_principal: ${offending.principalId} is ${offending.environment}, not sandbox`,
    )
  }
  return { principalRef: refs.principalRef, accountRef }
}
