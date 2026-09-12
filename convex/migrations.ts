import { Migrations } from '@convex-dev/migrations'

import { directoryProviderKey, directorySlugBase, directorySlugWithMethod, isDirectoryEntryEligible } from '@/modules/market/x402-directory-index'
import { sourceRouteRef } from '@/modules/capability-supply/public'
import { components } from './_generated/api'
import { eligibleFacetsNamespace } from './lib/x402DirectoryIndex/analytics'
import { directoryFacets } from './lib/x402DirectoryIndex/facets'
import schema from './schema'

export const migrations = new Migrations(components.migrations, { schema })

/**
 * C14 (Well 4, D7): capabilityOfferings.presentation.price is being retired.
 * Unsets price on every offering so the validator can drop it from the schema
 * (C15) once production's remaining count is 0. Idempotent: docs that have
 * already been migrated (or never had a price) are skipped.
 */
export const removeOfferingPrice = migrations.define({
  table: 'capabilityOfferings',
  migrateOne: (_ctx, doc) => {
    const { price, ...presentationWithoutPrice } = doc.presentation
    if (price === undefined) return
    return { presentation: presentationWithoutPrice }
  },
})

/**
 * Well-7 Lane 1 (docs/architecture/catalogue-distillation.md#9): backfills
 * `eligible`/`providerKey` on existing marketDirectorySearchEntries rows
 * across every generation, so the new fields can be tightened from optional
 * to required once this completes. Computed entirely from columns already
 * stored at write time (hasOutputSchema/hasOutputExample/payersOrder/
 * provider) via the same predicate applied going forward
 * (src/modules/market/x402-directory-index.ts:isDirectoryEntryEligible) —
 * no re-fetch of the source entry needed. Idempotent: already-backfilled
 * rows are skipped.
 */
export const backfillDirectoryEligibility = migrations.define({
  table: 'marketDirectorySearchEntries',
  migrateOne: (_ctx, doc) => {
    if (doc.eligible !== undefined && doc.providerKey !== undefined) return
    return {
      eligible: isDirectoryEntryEligible({
        hasOutputSchema: doc.hasOutputSchema === true, hasOutputExample: doc.hasOutputExample === true, payersOrder: doc.payersOrder ?? -1,
      }),
      providerKey: directoryProviderKey(doc.provider),
    }
  },
})

/**
 * Well-7 Lane 1 follow-up: the eligible-only facet counts read by
 * `x402DirectoryIndex:facets`/`overview` (convex/lib/x402DirectoryIndex/
 * facets.ts, eligibleFacetsNamespace) are normally maintained by
 * writeFacetMembership at write time. Existing rows backfilled by
 * `backfillDirectoryEligibility` above never went through that write path
 * with `eligible` set, so their facet membership is missing from the
 * eligible-only namespace until this runs (or the generation is refreshed).
 * Run this only after `backfillDirectoryEligibility` completes.
 * `insertIfDoesNotExist` (the component's documented backfill primitive) is
 * idempotent per (namespace, key, id), so re-running is safe and repeated
 * category/provider inserts across a resource's several network-variant
 * rows are deduplicated for free.
 *
 * Ordering is enforced in code, not just in this comment: every batch reads
 * `backfillDirectoryEligibility`'s status via the migrations component's own
 * `getStatus` API and throws (refusing to write) unless that migration has
 * completed. A direct `npx convex run migrations:backfillEligibleFacetMembership`
 * run out of order fails closed instead of writing incomplete facet
 * membership; re-running once the prerequisite is done resumes from where it
 * left off.
 */
export const backfillEligibleFacetMembership = migrations.define({
  table: 'marketDirectorySearchEntries',
  migrateOne: async (ctx, doc) => {
    if (doc.eligible !== true) return
    const [prerequisite] = await migrations.getStatus(ctx, {
      migrations: ['migrations:backfillDirectoryEligibility'],
    })
    if (prerequisite?.isDone !== true) {
      throw new Error('backfill_eligible_facet_membership_requires_backfill_directory_eligibility_done')
    }
    const namespace = eligibleFacetsNamespace(doc.generation)
    if (doc.network === '*') {
      await directoryFacets.insertIfDoesNotExist(ctx, { namespace, key: ['category', doc.category], id: doc.resource })
      await directoryFacets.insertIfDoesNotExist(ctx, { namespace, key: ['provider', doc.provider], id: doc.resource })
    } else {
      await directoryFacets.insertIfDoesNotExist(ctx, { namespace, key: ['network', doc.network], id: doc.resource })
    }
  },
})

/**
 * Well-7 (canonical Tool URLs): backfills `sourceRouteRef`/`slug` on existing
 * marketDirectorySearchEntries rows, computed the same way
 * x402DirectoryIndexStore.writeSource computes them going forward -
 * `sourceRouteRef` from the entry's retained raw source JSON
 * (marketExternalRegistryEntries.directorySourceJson, same input
 * admitFacilitatorDiscoveryItems sees at admission time so the digest matches
 * capabilityPublications.sourceRouteRef bit-for-bit), and `slug` from the
 * resource path, method-qualified only against whichever same-host resource
 * already holds that base slug. The collision check queries by network='*'
 * regardless of the row being migrated, so every network-variant row of one
 * resource computes the identical slug independently - no ordering
 * dependency between a resource's '*' row and its per-network rows.
 * Idempotent: rows that already have both fields are skipped.
 */
export const backfillDirectorySourceRouteRefAndSlug = migrations.define({
  table: 'marketDirectorySearchEntries',
  migrateOne: async (ctx, doc) => {
    if (doc.sourceRouteRef !== undefined && doc.slug !== undefined) return
    const providerKey = doc.providerKey ?? directoryProviderKey(doc.provider)
    const entry = await ctx.db.get(doc.entryId)
    const sourceRouteRefValue = entry?.directorySourceJson === undefined ? undefined : sourceRouteRef({
      sourceKind: 'x402', sourceSelector: {}, sourceDescriptorJson: entry.directorySourceJson, endpointUrl: doc.resource,
    })
    let slug = doc.slug
    if (slug === undefined) {
      const base = directorySlugBase(doc.resource)
      const collision = await ctx.db.query('marketDirectorySearchEntries')
        .withIndex('by_generation_and_providerKey_and_slug', (q) => q.eq('generation', doc.generation).eq('providerKey', providerKey).eq('slug', base))
        .filter((q) => q.eq(q.field('network'), '*'))
        .first()
      slug = collision !== null && collision.resource !== doc.resource ? directorySlugWithMethod(doc.resource, entry?.method) : base
    }
    return {
      ...(providerKey === doc.providerKey ? {} : { providerKey }),
      slug,
      ...(sourceRouteRefValue === undefined ? {} : { sourceRouteRef: sourceRouteRefValue }),
    }
  },
})
