import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { buildDevSeedCatalogState } from '@/modules/dev/public'
import { persistDevSeedCatalogState } from '../../../devSeedStore'
import { upsertDevSeedSandboxAccessPath } from './accessPath'
import { seedBusinessOfferings } from './catalog'
import { sandboxToolAccessPathRef, sandboxToolFixture, type SandboxToolCatalogOrigin, type SandboxToolSpec } from './sandboxFixture' 

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
export async function ensureSandboxToolCatalogOrigin(
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
