import { degradeBackend } from '@/lib/observability/degrade-backend'
import { env, internalMutation, type MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { v } from 'convex/values'
import type { UserIdentity } from 'convex/server'

import {
  buildDevSeedCatalogState,
  DEV_SEED_BUSINESS_FIXTURES,
} from '../src/modules/dev/public'
import {
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
} from '@/modules/capability-supply/convex'
import {
  createX402ProviderConnection,
  isCanonicalCredentiallessX402ProviderConnection,
} from '@/modules/capability-supply/provider-connection'
import { toDomain, toRow } from './lib/providerConnections/lifecycle'
import { publicationPorts, publishCapabilityForSeed } from './capabilitySupplyPublish'
import { ensureOwnerIdentityForAuthenticatedIdentity } from './interactiveAuthority'
import { resolveAndBindLegalCustomer } from './lib/moneyLegalCustomer'
import { persistDevSeedCatalogState } from './devSeedStore'
import { upsertProviderDirectoryRows } from './x402DirectoryIndexStore'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { refreshCapabilityCommand } from '@/modules/capability-supply/public'
import {
  MAX_ACCESS_PATHS_PER_OFFERING,
  type OfferingPrice,
} from '@/modules/catalog/public'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  readCatalogDescriptor,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from './catalog'
import { resolveDevSeedOwningAccountRef } from './lib/catalog/devSeedAuthority'
import { upsertDevSeedSandboxAccessPath, upsertDevSeedSandboxProviderToolProjection } from './lib/catalog/devSeedAccessPath'
import {
  admitDevSeedCatalogAuthority,
  DEV_SEED_CATALOG_ACCOUNT_NAME,
  DEV_SEED_CATALOG_ACCOUNT_REF,
  DEV_SEED_CATALOG_PRINCIPAL_NAME,
  DEV_SEED_CATALOG_PRINCIPAL_REF,
  DEV_SEED_CATALOG_RESOURCE,
  DEV_SEED_CATALOG_SCOPE,
  reviseBusinessOfferingCommand,
  upsertOfferingAccessPathCommand,
} from './catalogOfferingMutations'
import {
  DEV_SEED_PRICE_BY_SLUG,
  DEV_SEED_PRICING_BY_SLUG,
  SANDBOX_TESTNET_ORIGIN_ENV,
  SANDBOX_TESTNET_PAY_TO_ENV,
  SANDBOX_TESTNET_ROUTE_PATH,
  SANDBOX_TESTNET_BUSINESS_SLUG,
  SANDBOX_TESTNET_CAPABILITY_ID,
  SANDBOX_TESTNET_CONNECTION_REF,
  SANDBOX_TESTNET_PROVIDER_REF,
  SANDBOX_TESTNET_SKIP_ORIGIN_MISSING,
  SANDBOX_TESTNET_SKIP_PAY_TO_MISSING,
  SANDBOX_TOOL_BUSINESS_SLUG,
  SANDBOX_TOOL_CAPABILITY_ID,
  SANDBOX_TOOL_NETWORK_ID,
  sandboxReferenceEndpointUrl,
  sandboxReferenceToolSpec,
  sandboxTestnetToolSpec,
  sandboxToolAccessPathRef,
  sandboxToolBindingId,
  sandboxToolContractDocumentJson,
  sandboxToolContractMetadata,
  sandboxToolEvidenceRef,
  sandboxToolFixture,
  sandboxToolOfferingId,
  sandboxToolSourceRevision,
  type SandboxToolCatalogOrigin,
  type SandboxToolSpec,
  type SandboxToolTransport,
} from './devSeedFixtures'

export {
  DEV_SEED_PRICE_BY_SLUG,
  SANDBOX_TESTNET_SKIP_ORIGIN_MISSING,
  SANDBOX_TESTNET_SKIP_PAY_TO_MISSING,
} from './devSeedFixtures'

const DEV_SEED_CATALOG_OWNERSHIP_REF = 'own_d2000000000000000000000000000001'
const DEV_SEED_CATALOG_GRANT_REF = 'grt_d2000000000000000000000000000001'
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

export const provisionDevSeedCatalogIdentity = internalMutation({
  args: {},
  returns: v.object({
    kind: v.literal('ensured'),
    created: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const created = await provisionDevSeedCatalogIdentityRows(ctx)
    return { kind: 'ensured' as const, created }
  },
})

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
 * (convex/lib/callLifecycle/authorityHandlers.ts) requires
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

type SeedDevCatalogResult = Readonly<{
  kind: 'seeded'
  seededSlugs: string[]
  businessIdsBySlug: Record<string, string>
}>

export const seedDevCatalog = internalMutation({
  args: {},
  returns: v.object({
    kind: v.literal('seeded'),
    seededSlugs: v.array(v.string()),
    businessIdsBySlug: v.record(v.string(), v.string()),
  }),
  handler: async (ctx): Promise<SeedDevCatalogResult> => {
    // Self-heal the fixed dev-seed identity before authority admission.
    await provisionDevSeedCatalogIdentityRows(ctx)
    const authority = await admitDevSeedCatalogAuthority(ctx, 'seedDevCatalog')
    // The development catalog owns only its declared fixtures. Market
    // Operations are admitted through supplier/facilitator flows, so startup
    // must never sweep or rewrite unrelated supplier businesses.
    const bundle = buildDevSeedCatalogState(DEV_SEED_BUSINESS_FIXTURES, authority.accountRef)
    const result = await persistDevSeedCatalogState(ctx.db, bundle, authority.accountRef)
    return {
      ...result,
      kind: 'seeded' as const,
      seededSlugs: [...result.seededSlugs],
      businessIdsBySlug: { ...result.businessIdsBySlug },
    }
  },
})

export const seedOfferingSupply = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    processed: v.number(),
    seeded: v.number(),
    errors: v.array(v.string()),
    nextCursor: v.union(v.string(), v.null()),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await admitDevSeedCatalogAuthority(ctx, `seedOfferingSupply:${args.cursor ?? 'start'}`)
    const now = Date.now()
    const page = await ctx.db.query('businesses').paginate({ cursor: args.cursor, numItems: 10 })
    const errors: string[] = []
    let seeded = 0
    for (const business of page.page) {
      const result = await seedBusinessOfferings(
        ctx,
        business,
        now,
        DEV_SEED_PRICING_BY_SLUG,
        DEV_SEED_PRICE_BY_SLUG,
      )
      if (result.kind === 'error') {
        errors.push(`${business.slug}:${result.code}`)
        continue
      }
      seeded += result.seeded
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.devSeed.seedOfferingSupply, { cursor: page.continueCursor })
    }
    return {
      processed: page.page.length,
      seeded,
      errors,
      nextCursor: page.isDone ? null : page.continueCursor,
      done: page.isDone,
    }
  },
})

export async function seedBusinessOfferings(
  ctx: MutationCtx,
  business: Doc<'businesses'>,
  now: number,
  pricingBySlug: Readonly<Record<string, string>>,
  priceBySlug: Readonly<Record<string, OfferingPrice>>,
): Promise<{ kind: 'ok'; seeded: number } | { kind: 'error'; code: string }> {
  const offerings = await ctx.db
    .query('businessOfferings')
    .withIndex('by_businessId_and_status', (query) => query.eq('businessId', business._id))
    .collect()
  let seeded = 0

  for (const offering of offerings) {
    let revision = await ctx.db
      .query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => (
        query.eq('offeringRef', offering.offeringRef).eq('revision', offering.currentRevision)
      ))
      .unique()
    if (revision === null) return { kind: 'error', code: 'revision_not_found' }
    const pricingSummary = pricingBySlug[business.slug]
    const price = priceBySlug[business.slug]
    if (pricingSummary !== undefined) {
      const facts = {
        name: revision.name,
        category: revision.category,
        summary: revision.summary,
        ...(revision.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: revision.serviceAreaSummary }),
        ...(revision.availabilitySummary === undefined ? {} : { availabilitySummary: revision.availabilitySummary }),
        pricingSummary,
        ...(price === undefined ? {} : { price }),
      }
      const priceMatches = canonicalDigest(revision.price ?? null) === canonicalDigest(price ?? null)
      if (revision.pricingSummary !== pricingSummary || !priceMatches) {
        const revised = await reviseBusinessOfferingCommand(ctx, {
          businessId: business._id,
          offeringRef: offering.offeringRef,
          expectedRevision: revision.revision,
          operationKey: `seed:offering-pricing:${business.slug}:${offering.offeringRef}:${canonicalDigest({ pricingSummary, price: price ?? null })}`,
          facts,
        }, now)
        if (revised.kind === 'error') return { kind: 'error', code: `pricing_${revised.code}` }
        revision = await ctx.db
          .query('businessOfferingRevisions')
          .withIndex('by_offeringRef_and_revision', (query) => (
            query.eq('offeringRef', offering.offeringRef).eq('revision', revised.currentRevision ?? offering.currentRevision)
          ))
          .unique()
        if (revision === null) return { kind: 'error', code: 'revision_not_found_after_pricing' }
      }
      const accessPaths = await ctx.db.query('offeringAccessPaths')
        .withIndex('by_offeringRef_and_status', (query) => query.eq('offeringRef', offering.offeringRef))
        .take(MAX_ACCESS_PATHS_PER_OFFERING + 1)
      if (accessPaths.length > MAX_ACCESS_PATHS_PER_OFFERING) {
        return { kind: 'error', code: 'access_path_capacity_exceeded' }
      }
      for (const accessPath of accessPaths) {
        if (accessPath.status === 'withdrawn') continue
        if (
          accessPath.offeringRevision === revision.revision
          && accessPath.offeringSourceHash === revision.sourceHash
        ) {
          continue
        }
        const updated = await upsertOfferingAccessPathCommand(ctx, {
          businessId: business._id,
          offeringRef: offering.offeringRef,
          accessPathRef: accessPath.accessPathRef,
          expectedRevision: revision.revision,
          operationKey: `seed:offering-access-path:${business.slug}:${accessPath.accessPathRef}:${revision.revision}`,
          descriptor: readCatalogDescriptor(accessPath.descriptor),
        }, now)
        if (updated.kind === 'error') return { kind: 'error', code: `access_path_${updated.code}` }
      }
    }

    seeded += 1
  }
  const sourceDb = ctx.db
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(sourceDb, business._id, now)
  const rebuilt = await rebuildBusinessSupplyProjectionSnapshotCommand({
    db: sourceDb,
    sourceDb,
    businessId: business._id,
    support,
    now,
  })
  if (rebuilt.kind === 'error') return { kind: 'error', code: `projection_${rebuilt.code}` }
  return { kind: 'ok', seeded }
}

function readSeedEnvironmentValue(name: string): string | undefined {
  const value = (env as Readonly<Record<string, string | undefined>>)[name]?.trim()
  return value === undefined || value.length === 0 ? undefined : value
}

function sandboxTestnetEndpointUrl(): string | undefined {
  const origin = readSeedEnvironmentValue(SANDBOX_TESTNET_ORIGIN_ENV)
  if (origin === undefined) return undefined
  try {
    const url = new URL(SANDBOX_TESTNET_ROUTE_PATH, origin)
    return url.protocol === 'https:' && url.username === '' && url.password === ''
      ? url.toString()
      : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'sandboxTestnetEndpointUrl', reason: 'invalid_response' })
  }
}


/**
 * Publishes the catalog side of a sandbox Tool through the same system
 * offering commands the dev catalog already uses, then returns the exact
 * catalog origin the publication must bind to.
 *
 * The price twin is seeded here, BEFORE the publication binds its origin: the
 * revise that carries `price` mints a new Offering revision and source hash,
 * so pricing afterwards would leave the publication bound to a revision that
 * no longer exists and the Tool would stop qualifying as routeable.
 */
async function ensureSandboxToolCatalogOrigin(
  ctx: MutationCtx,
  spec: SandboxToolSpec,
  owningAccountRef: string,
  now: number,
): Promise<{ businessId: Id<'businesses'>; origin: SandboxToolCatalogOrigin }> {
  const accessPathRef = sandboxToolAccessPathRef(spec)
  const bundle = buildDevSeedCatalogState([sandboxToolFixture(spec)], owningAccountRef)
  const persisted = await persistDevSeedCatalogState(ctx.db, bundle, owningAccountRef)
  const businessId = persisted.businessIdsBySlug[spec.businessSlug]
  if (businessId === undefined) throw new Error('dev_seed_sandbox_tool_business_missing')
  const offeringRef = bundle.state.offerings[0]?.offeringRef
  if (offeringRef === undefined) throw new Error('dev_seed_sandbox_tool_offering_missing')

  const business = await ctx.db.get(businessId)
  if (business === null) throw new Error('dev_seed_sandbox_tool_business_missing')
  const priced = await seedBusinessOfferings(
    ctx,
    business,
    now,
    { [spec.businessSlug]: spec.pricingSummary },
    { [spec.businessSlug]: spec.offeringPrice },
  )
  if (priced.kind === 'error') throw new Error(`dev_seed_sandbox_tool_pricing_${priced.code}`)

  const offering = await ctx.db.query('businessOfferings')
    .withIndex('by_offeringRef', (query) => query.eq('offeringRef', offeringRef))
    .unique()
  if (offering === null) throw new Error('dev_seed_sandbox_tool_offering_missing')
  await upsertDevSeedSandboxAccessPath(ctx, {
    businessId,
    offeringRef,
    accessPathRef,
    offeringRevision: offering.currentRevision,
    name: spec.label,
    summary: spec.accessPathSummary,
    url: spec.endpointUrl,
    method: spec.method,
    authenticationSummary: spec.authenticationSummary,
    now,
  })

  const [revision, accessPath] = await Promise.all([
    ctx.db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => (
        query.eq('offeringRef', offeringRef).eq('revision', offering.currentRevision)
      ))
      .unique(),
    ctx.db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', accessPathRef))
      .unique(),
  ])
  if (revision === null) throw new Error('dev_seed_sandbox_tool_revision_missing')
  if (accessPath === null) throw new Error('dev_seed_sandbox_tool_access_path_missing')
  return {
    businessId,
    origin: {
      kind: 'catalog_offering',
      offeringRef,
      offeringRevision: offering.currentRevision,
      offeringSourceHash: revision.sourceHash,
      declaredAccessPathRef: accessPath.accessPathRef,
      accessPathSourceHash: accessPath.sourceHash,
    },
  }
}

type SeededSandboxTool = Readonly<{
  created: boolean
  publicationRef: string
  publicationRevision: number
  toolRef: string
}>

/**
 * Publishes one sandbox Tool: catalog origin, publication.
 *
 * The catalog side runs on EVERY invocation: the publication is created once,
 * but the priced Offering revision it binds to and the business's search
 * documents have to be re-asserted on each boot. Readiness is never written
 * here — the hourly `refresh capability supply readiness` workload is the
 * only writer of the readiness fact.
 */
async function publishSeededSandboxTool(
  ctx: MutationCtx,
  spec: SandboxToolSpec,
  owningAccountRef: string,
  now: number,
  prepareBusiness?: (businessId: Id<'businesses'>) => Promise<void>,
): Promise<SeededSandboxTool> {
  const publicationRef = sandboxToolOfferingId(spec)
  const evidenceRefs = [sandboxToolEvidenceRef(spec)]
  const { businessId, origin } = await ensureSandboxToolCatalogOrigin(ctx, spec, owningAccountRef, now)
  if (prepareBusiness !== undefined) await prepareBusiness(businessId)
  const existing = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', publicationRef).eq('revision', 1)
    ))
    .unique()

  const target: SeededSandboxTool = existing !== null
    ? await refreshLegacySandboxTestnetPublication(ctx, spec, existing, origin, evidenceRefs, now)
    : await createSandboxToolPublication(ctx, spec, evidenceRefs, businessId, origin, now)
  if (existing !== null) {
    const current = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => query
        .eq('publicationRef', target.publicationRef)
        .eq('revision', target.publicationRevision))
      .unique()
    if (current === null || current.disposition !== 'current') {
      throw new Error('dev_seed_sandbox_tool_current_projection_missing')
    }
    await upsertDevSeedSandboxProviderToolProjection(ctx, current, origin.offeringRef, origin.offeringRevision, now)
    await upsertProviderDirectoryRows(ctx, current)
  }
  return target
}

async function refreshLegacySandboxTestnetPublication(
  ctx: MutationCtx,
  spec: SandboxToolSpec,
  legacy: Doc<'capabilityPublications'>,
  origin: SandboxToolCatalogOrigin,
  evidenceRefs: readonly string[],
  now: number,
): Promise<SeededSandboxTool> {
  if (spec.businessSlug !== SANDBOX_TESTNET_BUSINESS_SLUG) {
    return {
      created: false,
      publicationRef: legacy.publicationRef,
      publicationRevision: legacy.revision,
      toolRef: legacy.toolRef,
    }
  }
  const publications = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', legacy.publicationRef))
    .collect()
  const current = publications.filter((publication) => publication.disposition === 'current')
  if (current.length !== 1) throw new Error('dev_seed_sandbox_testnet_current_revision_conflict')
  const active = current[0]
  if (active === undefined) throw new Error('dev_seed_sandbox_testnet_current_revision_missing')
  await assertExactSandboxTestnetPublicationMaterial(ctx, spec, active, legacy.businessId, origin)

  const desiredDocumentJson = sandboxToolContractDocumentJson(spec, 2)
  if (active.revision === 2) {
    const desiredContract = await ctx.db.query('capabilityContractDocuments')
      .withIndex('by_capabilityId_and_version', (query) => query
        .eq('capabilityId', SANDBOX_TESTNET_CAPABILITY_ID)
        .eq('version', 2))
      .unique()
    if (active.version !== 2
      || desiredContract === null
      || active.contractDigest !== desiredContract.contractDigest
      || canonicalDigest(JSON.parse(desiredContract.documentJson)) !== canonicalDigest(JSON.parse(desiredDocumentJson))) {
      throw new Error('dev_seed_sandbox_testnet_revision_two_drift')
    }
    await admitExactSandboxTestnetRevision(ctx, active, evidenceRefs, now)
    return {
      created: false,
      publicationRef: active.publicationRef,
      publicationRevision: active.revision,
      toolRef: active.toolRef,
    }
  }
  if (active._id !== legacy._id || active.revision !== 1 || active.version !== 1
    || active.offeringId !== sandboxToolOfferingId(spec)
    || active.bindingId !== sandboxToolBindingId(spec)) {
    throw new Error('dev_seed_sandbox_testnet_legacy_material_drift')
  }
  const legacyContract = await ctx.db.query('capabilityContractDocuments')
    .withIndex('by_capabilityId_and_version', (query) => query
      .eq('capabilityId', SANDBOX_TESTNET_CAPABILITY_ID)
      .eq('version', 1))
    .unique()
  if (legacyContract === null
    || legacyContract.contractDigest !== active.contractDigest
  ) {
    throw new Error('dev_seed_sandbox_testnet_legacy_contract_drift')
  }
  if (canonicalDigest(JSON.parse(legacyContract.documentJson))
    === canonicalDigest(JSON.parse(sandboxToolContractDocumentJson(spec, 1)))) {
    return {
      created: false,
      publicationRef: active.publicationRef,
      publicationRevision: active.revision,
      toolRef: active.toolRef,
    }
  }
  const { inputExamples: _inputExamples, ...legacySpec } = spec
  if (canonicalDigest(JSON.parse(legacyContract.documentJson))
      !== canonicalDigest(JSON.parse(sandboxToolContractDocumentJson(legacySpec, 1)))) {
    throw new Error('dev_seed_sandbox_testnet_legacy_contract_drift')
  }

  const commercialRelationship = {
    kind: 'none' as const,
    summary: 'Sandbox fixture supply with no commercial influence.',
    influencesEligibility: false,
    influencesInclusion: false,
    influencesOrder: false,
    evidenceRefs: [...evidenceRefs],
  }
  const presentation = {
    label: spec.label,
    summary: spec.summary,
    materialTerms: spec.materialTerms.map((term) => ({ ...term })),
    commercialRelationship,
  }
  const publication = await publicationPorts(ctx).loadPublicationAtRevision(active.publicationRef, 1)
  if (publication === null) throw new Error('dev_seed_sandbox_testnet_legacy_publication_missing')
  const result = await refreshCapabilityCommand({
    publication,
    source: sandboxToolPublicationSource(spec, presentation, evidenceRefs, 2) as Parameters<
      typeof refreshCapabilityCommand
    >[0]['source'],
    offering: {
      offeringId: sandboxToolOfferingId(spec),
      networkId: SANDBOX_TOOL_NETWORK_ID,
      origin,
      presentation,
      searchTerms: [...spec.searchTerms],
      registrationEvidenceRefs: [...evidenceRefs],
    },
    operationKey: `seed:sandbox-tool-refresh:${spec.businessSlug}:v2`,
    correlationId: `seed:sandbox-tool:${spec.businessSlug}`,
    reasonCode: 'dev_seed_sandbox_tool_contract_example',
    evidenceRefs: [...evidenceRefs],
    now,
  }, publicationPorts(ctx))
  if (result.kind !== 'refreshed' || result.revision !== 2 || result.disposition !== 'current') {
    throw new Error(`dev_seed_sandbox_testnet_refresh_${result.kind === 'refused' ? result.reason : 'invalid'}`)
  }
  const refreshed = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', active.publicationRef)
      .eq('revision', 2))
    .unique()
  if (refreshed === null) throw new Error('dev_seed_sandbox_testnet_refresh_missing')
  await admitExactSandboxTestnetRevision(ctx, refreshed, evidenceRefs, now)
  return {
    created: false,
    publicationRef: refreshed.publicationRef,
    publicationRevision: refreshed.revision,
    toolRef: refreshed.toolRef,
  }
}

async function admitExactSandboxTestnetRevision(
  ctx: MutationCtx,
  publication: Doc<'capabilityPublications'>,
  evidenceRefs: readonly string[],
  now: number,
): Promise<void> {
  const ports = publicationPorts(ctx)
  const [offering, binding] = await Promise.all([
    ports.loadOfferingByOfferingId(publication.offeringId),
    ports.loadBindingByBindingId(publication.bindingId),
  ])
  if (offering === null || binding === null) {
    throw new Error('dev_seed_sandbox_testnet_refresh_supply_missing')
  }
  if (offering.status === 'active'
    && binding.admission === 'admitted'
    && binding.conformance === 'conformant') return
  const pristineEvidence = offering.admissionEvidenceRefs.length === 0
    && binding.admissionEvidenceRefs.length === 0
    && binding.conformanceEvidenceRefs.length === 0
  if (offering.status !== 'inactive'
    || binding.admission !== 'not_admitted'
    || binding.conformance !== 'not_conformant'
    || !pristineEvidence) {
    throw new Error('dev_seed_sandbox_testnet_refresh_eligibility_not_pristine')
  }
  const admitted = await ports.setEligibility({
    offeringId: offering.offeringId,
    bindingId: binding.bindingId,
    contractRef: {
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
    },
    decision: 'admit',
    expectedOfferingRegistrationHash: offering.registrationHash,
    expectedBindingRegistrationHash: binding.registrationHash,
    admissionEvidenceRefs: [...evidenceRefs],
    conformanceEvidenceRefs: [...evidenceRefs],
  }, now)
  if (admitted.kind !== 'eligible') {
    throw new Error(`dev_seed_sandbox_testnet_refresh_admission_${
      admitted.kind === 'refused' ? admitted.reason : admitted.kind
    }`)
  }
}

async function assertExactSandboxTestnetPublicationMaterial(
  ctx: MutationCtx,
  spec: SandboxToolSpec,
  publication: Doc<'capabilityPublications'>,
  expectedBusinessId: Id<'businesses'>,
  origin: SandboxToolCatalogOrigin,
): Promise<void> {
  if (spec.source.kind !== 'x402'
    || publication.capabilityId !== SANDBOX_TESTNET_CAPABILITY_ID
    || publication.businessId !== expectedBusinessId
    || publication.runtimeEnvironment !== 'sandbox'
    || publication.sourceKind !== 'x402'
    || publication.publisherRef !== 'system:dev-seed'
    || publication.authorityMode !== 'ae_curated_external'
    || publication.pricingConfigJson === undefined
    || canonicalDigest(JSON.parse(publication.pricingConfigJson)) !== canonicalDigest(spec.pricingConfig)) {
    throw new Error('dev_seed_sandbox_testnet_material_drift')
  }
  const [business, offering, binding] = await Promise.all([
    ctx.db.get(publication.businessId),
    ctx.db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId)).unique(),
    ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId)).unique(),
  ])
  const expectedPresentation = {
    label: spec.label,
    summary: spec.summary,
    materialTerms: spec.materialTerms.map((term) => ({ ...term })),
    commercialRelationship: {
      kind: 'none',
      summary: 'Sandbox fixture supply with no commercial influence.',
      influencesEligibility: false,
      influencesInclusion: false,
      influencesOrder: false,
      evidenceRefs: [sandboxToolEvidenceRef(spec)],
    },
  }
  if (business === null
    || business.owningAccountRef !== DEV_SEED_CATALOG_ACCOUNT_REF
    || offering === null
    || offering.capabilityId !== publication.capabilityId
    || offering.version !== publication.version
    || offering.contractDigest !== publication.contractDigest
    || offering.networkId !== SANDBOX_TOOL_NETWORK_ID
    || canonicalDigest(offering.origin ?? null) !== canonicalDigest(origin)
    || canonicalDigest(offering.presentation) !== canonicalDigest(expectedPresentation)
    || canonicalDigest(offering.searchTerms) !== canonicalDigest(spec.searchTerms)
    || binding === null
    || binding.capabilityId !== publication.capabilityId
    || binding.version !== publication.version
    || binding.contractDigest !== publication.contractDigest
    || binding.endpointUrl !== spec.endpointUrl
    || binding.networkId !== SANDBOX_TOOL_NETWORK_ID
    || binding.authority.kind !== 'provider_connection'
    || binding.authority.connectionRef !== spec.source.connectionRef
    || binding.authority.providerRef !== spec.source.providerRef
    || binding.adapterId !== 'x402-fetch:v2') {
    throw new Error('dev_seed_sandbox_testnet_supply_drift')
  }
  const config = JSON.parse(binding.configJson) as Record<string, unknown>
  if (config.method !== spec.method
    || config.network !== BASE_SEPOLIA_NETWORK
    || config.asset !== BASE_SEPOLIA_USDC_ADDRESS
    || config.payTo !== spec.source.payTo
    || config.scheme !== 'exact'
    || config.requestTimeoutMs !== spec.source.requestTimeoutMs
    || config.routeAmountExponent !== spec.source.providerPrice.exponent
    || config.assetAmountExponent !== spec.source.providerPrice.exponent
    || typeof config.paymentRequiredJson !== 'string'
    || canonicalDigest(JSON.parse(config.paymentRequiredJson))
      !== canonicalDigest(spec.source.paymentRequired)) {
    throw new Error('dev_seed_sandbox_testnet_transport_drift')
  }
}

const seededSandboxToolValue = v.union(
  v.object({ capabilityId: v.string(), toolRef: v.string(), created: v.boolean() }),
  v.object({ capabilityId: v.string(), skipped: v.string() }),
)
export const publishSandboxTool = internalMutation({
  args: { owningAccountRef: v.optional(v.string()) },
  returns: v.object({
    created: v.boolean(),
    publicationId: v.string(),
    publicationRevision: v.number(),
    toolRef: v.string(),
    businessSlug: v.string(),
    tools: v.array(seededSandboxToolValue),
  }),
  handler: async (ctx, args) => {
    // Same deployment guard the money seed uses: never seed sandbox supply into
    // a deployment whose bypass owner account already carries a production agent.
    await requireLocalE2EOwnerAuthority(ctx)
    await provisionDevSeedCatalogIdentityRows(ctx)
    const authority = await admitDevSeedCatalogAuthority(ctx, 'publishSandboxTool')
    const owningAccountRef = await resolveDevSeedOwningAccountRef(ctx, args.owningAccountRef, authority.accountRef)
    const now = Date.now()

    const reference = await publishSeededSandboxTool(
      ctx,
      sandboxReferenceToolSpec(sandboxReferenceEndpointUrl()),
      owningAccountRef,
      now,
    )
    const testnet = await publishSeededSandboxTestnetTool(ctx, owningAccountRef, now)

    return {
      created: reference.created,
      publicationId: reference.publicationRef,
      publicationRevision: reference.publicationRevision,
      toolRef: reference.toolRef,
      businessSlug: SANDBOX_TOOL_BUSINESS_SLUG,
      tools: [
        { capabilityId: SANDBOX_TOOL_CAPABILITY_ID, toolRef: reference.toolRef, created: reference.created },
        testnet,
      ],
    }
  },
})

/**
 * Seeds the Base Sepolia reference provider Tool, or reports why it was not.
 *
 * A deployment without the reference provider's env has nowhere to send a paid
 * Call, so the Tool is skipped rather than published against a guessed URL: a
 * published Tool that cannot settle is worse than an absent one.
 */
async function publishSeededSandboxTestnetTool(
  ctx: MutationCtx,
  owningAccountRef: string,
  now: number,
): Promise<
  | Readonly<{ capabilityId: string; toolRef: string; created: boolean }>
  | Readonly<{ capabilityId: string; skipped: string }>
> {
  const endpointUrl = sandboxTestnetEndpointUrl()
  if (endpointUrl === undefined) {
    return { capabilityId: SANDBOX_TESTNET_CAPABILITY_ID, skipped: SANDBOX_TESTNET_SKIP_ORIGIN_MISSING }
  }
  const payTo = readSeedEnvironmentValue(SANDBOX_TESTNET_PAY_TO_ENV)
  if (payTo === undefined || !/^0x[0-9a-f]{40}$/iu.test(payTo)) {
    return { capabilityId: SANDBOX_TESTNET_CAPABILITY_ID, skipped: SANDBOX_TESTNET_SKIP_PAY_TO_MISSING }
  }
  const spec = sandboxTestnetToolSpec(endpointUrl, payTo)
  const seeded = await publishSeededSandboxTool(
    ctx,
    spec,
    owningAccountRef,
    now,
    (businessId) => ensureSandboxTestnetProviderConnection(ctx, businessId, endpointUrl, payTo, now),
  )
  return {
    capabilityId: SANDBOX_TESTNET_CAPABILITY_ID,
    toolRef: seeded.toolRef,
    created: seeded.created,
  }
}

/**
 * The credential-less x402 provider connection the binding's authority names.
 *
 * `x402-fetch:v2` never admits a keyless binding (transport-adapters.ts), so a
 * real x402 Tool needs a provider connection row exactly as facilitator
 * discovery mints one for a discovered x402 resource. Nothing secret is stored:
 * the connection carries the resource URL and the payee only.
 */
async function ensureSandboxTestnetProviderConnection(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  endpointUrl: string,
  payTo: string,
  now: number,
): Promise<void> {
  const providerAccountRef = `x402:${endpointUrl}`
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', SANDBOX_TESTNET_CONNECTION_REF))
    .unique()
  if (existing !== null) {
    const connection = toDomain(existing)
    if (connection.lifecycle === 'active'
      && connection.businessId === String(businessId)
      && connection.providerRef === SANDBOX_TESTNET_PROVIDER_REF
      && connection.providerAccountRef === providerAccountRef
      && isCanonicalCredentiallessX402ProviderConnection(connection)) return
    // The fixture moved or was revoked. Say so instead of publishing a Tool
    // bound to authority that no longer describes the endpoint.
    throw new Error('dev_seed_sandbox_testnet_connection_stale')
  }
  const business = await ctx.db.get(businessId)
  if (business === null) throw new Error('dev_seed_sandbox_testnet_business_missing')
  const commandId = `dev-seed:sandbox-testnet-connection:${canonicalDigest({ endpointUrl, payTo }).slice(7)}`
  const created = createX402ProviderConnection({
    commandId,
    connectionRef: SANDBOX_TESTNET_CONNECTION_REF,
    businessId: String(businessId),
    providerRef: SANDBOX_TESTNET_PROVIDER_REF,
    providerAccountRef,
    resourceUrl: endpointUrl,
    method: 'POST',
    payee: payTo,
    evidenceRefs: [`private:evidence:dev-seed:${SANDBOX_TESTNET_BUSINESS_SLUG}`],
    owningAccountRef: business.owningAccountRef,
    installedByPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
    authorityGrantRef: DEV_SEED_CATALOG_GRANT_REF,
    authorityGrantGeneration: 1,
  }, now)
  if (created.kind !== 'applied') {
    throw new Error(`dev_seed_sandbox_testnet_connection_${created.kind === 'refused' ? created.code : created.kind}`)
  }
  await ctx.db.insert(
    'capabilityProviderConnections',
    toRow(created.connection, commandId, created.commandDigest),
  )
}

async function createSandboxToolPublication(
  ctx: MutationCtx,
  spec: SandboxToolSpec,
  evidenceRefs: readonly string[],
  businessId: Id<'businesses'>,
  origin: SandboxToolCatalogOrigin,
  now: number,
): Promise<SeededSandboxTool & Readonly<{ created: true }>> {
  const commercialRelationship = {
    kind: 'none' as const,
    summary: 'Sandbox fixture supply with no commercial influence.',
    influencesEligibility: false,
    influencesInclusion: false,
    influencesOrder: false,
    evidenceRefs: [...evidenceRefs],
  }
  const presentation = {
    label: spec.label,
    summary: spec.summary,
    materialTerms: spec.materialTerms.map((term) => ({ ...term })),
    commercialRelationship,
  }
  // What the Tool publishes. For managed x402 that is `on_request`: the buyer
  // total is a binding Quote, not a listed number.
  const offering = {
    offeringId: sandboxToolOfferingId(spec),
    networkId: SANDBOX_TOOL_NETWORK_ID,
    origin,
    presentation: { ...presentation },
    searchTerms: [...spec.searchTerms],
    registrationEvidenceRefs: [...evidenceRefs],
  }
  const published = await publishCapabilityForSeed(ctx, {
    businessId: String(businessId),
    runtimeEnvironment: 'sandbox',
    source: sandboxToolPublicationSource(spec, presentation, evidenceRefs),
    sourceRevision: sandboxToolSourceRevision(spec),
    pricingConfig: { ...spec.pricingConfig },
    offering,
    // The x402 importer derives its own `x402-fetch:v2` binding from the
    // provider's payment terms; only the envelope Tool declares one here.
    ...(spec.source.kind === 'ae_envelope'
      ? { binding: sandboxToolEnvelopeBinding(spec, spec.source.transport, evidenceRefs) }
      : {}),
    origin,
    operationKey: `seed:sandbox-tool-publish:${spec.businessSlug}:v1`,
    correlationId: `seed:sandbox-tool:${spec.businessSlug}`,
    reasonCode: 'dev_seed_sandbox_tool',
    evidenceRefs: [...evidenceRefs],
    now,
  })
  if (published.kind === 'refused') {
    throw new Error(`dev_seed_sandbox_tool_publish_refused:${published.reason}`)
  }
  return {
    created: true,
    publicationRef: published.publicationRef,
    publicationRevision: published.publicationRevision,
    toolRef: published.toolRef,
  }
}

function sandboxToolEnvelopeBinding(
  spec: SandboxToolSpec,
  transport: SandboxToolTransport,
  evidenceRefs: readonly string[],
) {
  return {
    bindingId: sandboxToolBindingId(spec),
    endpointUrl: spec.endpointUrl,
    authority: { ...transport.authority },
    continuation: { kind: 'single_response' as const, evidenceRefs: [...evidenceRefs] },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: [...evidenceRefs] },
    adapter: {
      adapterId: transport.adapter.adapterId,
      config: { ...transport.adapter.config },
    },
    registrationEvidenceRefs: [...evidenceRefs],
  }
}

/**
 * The import the publish command normalizes.
 *
 * The x402 importer checks the *submitted* commercial price against the
 * provider's own resource price, so the source carries the atomic USDC amount
 * while the published Offering above carries `on_request`.
 */
function sandboxToolPublicationSource(
  spec: SandboxToolSpec,
  presentation: Readonly<Record<string, unknown>>,
  evidenceRefs: readonly string[],
  contractVersion = 1,
): unknown {
  const offeringId = sandboxToolOfferingId(spec)
  if (spec.source.kind === 'ae_envelope') {
    return {
      kind: 'ae_envelope',
      documentJson: sandboxToolContractDocumentJson(spec, contractVersion),
      offering: {
        offeringId,
        networkId: SANDBOX_TOOL_NETWORK_ID,
        presentation: { ...presentation },
        searchTerms: [...spec.searchTerms],
        registrationEvidenceRefs: [...evidenceRefs],
      },
      binding: sandboxToolEnvelopeBinding(spec, spec.source.transport, evidenceRefs),
      evidenceRefs: [...evidenceRefs],
    }
  }
  const source = spec.source
  return {
    kind: 'x402',
    resource: {
      resourceUrl: spec.endpointUrl,
      price: { ...source.providerPrice },
      method: spec.method,
      scheme: 'exact',
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      payTo: source.payTo,
      routeAmountExponent: source.providerPrice.exponent,
      assetAmountExponent: source.providerPrice.exponent,
      paymentRequired: source.paymentRequired,
      inputSchema: spec.inputSchema,
      outputSchema: spec.outputSchema,
    },
    contract: sandboxToolContractMetadata(spec, contractVersion),
    commercial: {
      offering: {
        offeringId,
        networkId: SANDBOX_TOOL_NETWORK_ID,
        presentation: { ...presentation, price: { kind: 'fixed', amount: { ...source.providerPrice } } },
        searchTerms: [...spec.searchTerms],
        registrationEvidenceRefs: [...evidenceRefs],
      },
      bindingId: sandboxToolBindingId(spec),
      authority: {
        kind: 'provider_connection',
        connectionRef: source.connectionRef,
        providerRef: source.providerRef,
      },
      registrationEvidenceRefs: [...evidenceRefs],
      requestTimeoutMs: source.requestTimeoutMs,
    },
    evidenceRefs: [...evidenceRefs],
  }
}

/*
 * Sandbox money authority for the local bypass owner.
 *
 * The agent side of Quote authority belongs to `ae connect` (see the shape (a)
 * note above `requireLocalE2EOwnerAuthority`): that flow writes the canonical
 * agent Principal, its delegation root and its agentAccessGrants row, and Quote
 * resolves all three live. The one fact `ae connect` never writes is the owning
 * account's money identity, so this seeds exactly that - the
 * moneyLegalCustomerBindings row `capabilityQuotes.prepareFinancialSubjects`
 * reads - through its own command (`resolveAndBindLegalCustomer`,
 * convex/lib/moneyLegalCustomer.ts). Nothing behind that command is patched,
 * and no secret material is written.
 */
export const seedSandboxSpendingPolicy = internalMutation({
  args: {},
  returns: v.object({
    created: v.boolean(),
    accountRef: v.string(),
    legalCustomerRef: v.string(),
  }),
  handler: async (ctx) => {
    const owner = await requireLocalE2EOwnerAuthority(ctx)
    const existing = await ctx.db.query('moneyLegalCustomerBindings')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', owner.accountRef))
      .unique()
    const bound = await resolveAndBindLegalCustomer(ctx, owner.accountRef, Date.now())
    if (bound.kind === 'refused') {
      throw new Error(`dev_seed_sandbox_legal_customer_${bound.code}`)
    }
    return {
      created: existing === null,
      accountRef: owner.accountRef,
      legalCustomerRef: bound.legalCustomerRef,
    }
  },
})
