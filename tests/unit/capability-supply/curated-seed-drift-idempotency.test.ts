import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { defineCapabilityContract } from '@/modules/capability-contract/public'
import {
  capabilityOfferingRegistrationHash,
  CURATED_PROVIDER_PUBLICATIONS,
  defineCapabilityOfferingRegistration,
  normalizeCapabilityPublication,
} from '@/modules/capability-supply/public'
import schema from '../../../convex/schema'
import { convexModules as modules } from '../../helpers/convex-fixtures'

type CuratedSeedPublication = Pick<Doc<'capabilityPublications'>, 'capabilityId' | 'publicationRef'>

// The canonical seed (devSeed:seedDevCatalog -> internal.curatedProviders.seed)
// must be idempotent across the SOURCE's own drift: when the source content for
// a curated capabilityId+version changes, the seed retires the stale
// source-owned stored state and re-admits the current source-authoritative
// content, instead of bouncing on contract_identity_conflict. This test
// corrupts the stored contract/offering/binding digests to simulate an earlier
// source revision and asserts the reseed self-heals back to the source.
describe('curated seed idempotency across source drift', () => {
  it('retires stale curated state and re-admits the current source content', async () => {
    const backend = convexTest(schema, modules)

    const first = await backend.mutation(internal.curatedProviders.seed, {})
    expect(first.publications).toHaveLength(20)
    // The 20-op catalog is uniquely identified by capabilityId.
    const firstCapabilityIds = first.publications.map((publication: CuratedSeedPublication) => publication.capabilityId).sort()
    expect(new Set(firstCapabilityIds).size).toBe(20)

    // Current source-authoritative digests for the two contracts we will drift.
    const sourceDigests = new Map<string, string>()
    for (const entry of CURATED_PROVIDER_PUBLICATIONS) {
      const normalized = await normalizeCapabilityPublication(entry.publication)
      if (normalized.kind !== 'normalized') throw new Error(`curated_digest_normalization_${normalized.reason}`)
      const contract = defineCapabilityContract(JSON.parse(normalized.draft.documentJson))
      sourceDigests.set(contract.ref.capabilityId, contract.ref.contractDigest)
    }
    const exaSearchDigest = sourceDigests.get('exa.search')
    const frankfurterDigest = sourceDigests.get('frankfurter.single-rate')
    if (exaSearchDigest === undefined || frankfurterDigest === undefined) {
      throw new Error('curated_digest_source_missing')
    }

    // Simulate an earlier seed revision that registered DIFFERENT contract
    // content for exa.search and frankfurter: corrupt the stored contract,
    // offering, binding, and publication digests so the stored state no longer
    // matches what the current source produces.
    const bogus = 'sha256:0000000000000000000000000000000000000000000000000000000000000000'
    const driftTargets = [
      { capabilityId: 'exa.search', version: 2, offeringId: 'offering:agentic-market-exa:search:v2', bindingId: 'binding:agentic-market-exa:search:api-key:v2' },
      { capabilityId: 'frankfurter.single-rate', version: 1, offeringId: 'offering:frankfurter-ecb-rates:single-rate:v1', bindingId: 'binding:frankfurter-ecb-rates:single-rate:v1' },
    ] as const
    await backend.run(async (ctx) => {
      for (const target of driftTargets) {
        const contractDoc = await ctx.db.query('capabilityContractDocuments')
          .withIndex('by_capabilityId_and_version', (q) => (
            q.eq('capabilityId', target.capabilityId).eq('version', target.version)
          )).unique()
        if (contractDoc !== null) await ctx.db.patch(contractDoc._id, { contractDigest: bogus })
        const offering = await ctx.db.query('capabilityOfferings')
          .withIndex('by_offeringId', (q) => q.eq('offeringId', target.offeringId)).unique()
        if (offering !== null) await ctx.db.patch(offering._id, { contractDigest: bogus })
        const binding = await ctx.db.query('capabilityTransportBindings')
          .withIndex('by_bindingId', (q) => q.eq('bindingId', target.bindingId)).unique()
        if (binding !== null) await ctx.db.patch(binding._id, { contractDigest: bogus })
        const publication = await ctx.db.query('capabilityPublications')
          .withIndex('by_publicationRef_and_revision', (q) => (
            q.eq('publicationRef', target.offeringId).eq('revision', 1)
          )).unique()
        if (publication !== null) await ctx.db.patch(publication._id, {
          contractDigest: bogus,
          sourceDigest: bogus,
        })
      }
      // The earlier source revision also wrote supply-audit events for the
      // purged operations; corrupt the exa.search publish audit to model the
      // real drift (stale payload written by the older revision).
      const exaSearchPublishAuditId = `audit:capability_supply:${canonicalDigest({
        action: 'publish_capability',
        eventType: 'capability_publication.published',
        targetType: 'capability_publication',
        targetRef: 'offering:agentic-market-exa:search:v2',
        actorKind: 'system',
        actorRef: 'system:curated-provider-bootstrap',
        operationKey: 'curated-provider:publish:offering:agentic-market-exa:search:v2',
      })}`
      const staleAudit = await ctx.db.query('auditEvents')
        .withIndex('by_eventId', (q) => q.eq('eventId', exaSearchPublishAuditId))
        .unique()
      if (staleAudit !== null) {
        await ctx.db.patch(staleAudit._id, { redactedPayloadJson: bogus, payloadHash: bogus })
      }
    })

    // The reseed must self-heal: retire the stale curated state and re-admit
    // the current source content rather than throwing contract_identity_conflict.
    const reseeded = await backend.mutation(internal.curatedProviders.seed, {})
    expect(reseeded.publications).toHaveLength(20)
    expect(new Set(reseeded.publications.map((publication: CuratedSeedPublication) => publication.capabilityId)).size).toBe(20)

    // A capabilityId+version still maps to exactly one (source-authoritative)
    // content: the exa.search and frankfurter contracts are re-registered with
    // the current source digests, and exa.contents (never drifted) is untouched.
    const registered = await backend.run(async (ctx) => ({
      contracts: await ctx.db.query('capabilityContractDocuments').collect(),
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
      publications: await ctx.db.query('capabilityPublications').collect(),
    }))
    const contractByCapability = new Map(
      registered.contracts.map((row) => [row.capabilityId, row]),
    )
    expect(contractByCapability.get('exa.search')?.contractDigest).toBe(exaSearchDigest)
    expect(contractByCapability.get('frankfurter.single-rate')?.contractDigest).toBe(frankfurterDigest)
    expect(contractByCapability.get('exa.contents')?.contractDigest).not.toBe(bogus)
    // Every op in the 20-op catalog has exactly one source-authoritative contract.
    expect(registered.contracts).toHaveLength(20)
    expect(registered.contracts.every((row) => row.contractDigest !== bogus)).toBe(true)
    // No stale current publication remains for the drifted ops, and the
    // re-admitted ones carry the source digests.
    expect(registered.publications.filter((row) => row.disposition === 'current')).toHaveLength(20)
    expect(registered.offerings.filter((row) => row.contractDigest === bogus)).toHaveLength(0)
    expect(registered.bindings.filter((row) => row.contractDigest === bogus)).toHaveLength(0)

    // The stale publish audit for exa.search was retired and rewritten with the
    // current source payload (no bogus audit rows remain).
    const rewrittenAudit = await backend.run(async (ctx) => {
      const row = await ctx.db.query('auditEvents')
        .withIndex('by_eventId', (q) => q.eq('eventId', `audit:capability_supply:${canonicalDigest({
          action: 'publish_capability',
          eventType: 'capability_publication.published',
          targetType: 'capability_publication',
          targetRef: 'offering:agentic-market-exa:search:v2',
          actorKind: 'system',
          actorRef: 'system:curated-provider-bootstrap',
          operationKey: 'curated-provider:publish:offering:agentic-market-exa:search:v2',
        })}`))
          .unique()
      return row
    })
    expect(rewrittenAudit).not.toBeNull()
    expect(rewrittenAudit?.payloadHash).not.toBe(bogus)
    expect(rewrittenAudit?.payloadHash).toMatch(/^sha256:/)

    // The whole thing is idempotent: running the seed a third time is a no-op.
    const third = await backend.mutation(internal.curatedProviders.seed, {})
    expect(third.publications).toHaveLength(20)

    // The re-admitted ops are discoverable through the live registry search.
    const exa = await backend.query(api.capabilitySupplyOperations.search, {
      query: 'Research the latest official guidance on AI agent payments and summarize the sources',
      limit: 10,
    })
    expect(exa).toMatchObject({ kind: 'ok', items: expect.arrayContaining([
      expect.objectContaining({ contract: expect.objectContaining({ capabilityId: 'exa.search' }) }),
    ]) })
  })

  it('self-heals a drifted curated OFFERING (registrationHash) and is a no-op on a third seed', async () => {
    const backend = convexTest(schema, modules)

    const first = await backend.mutation(internal.curatedProviders.seed, {})
    expect(first.publications).toHaveLength(20)

    // Capture the source-authoritative registrationHash and identity of one
    // curated offering (e.g. coingecko/open-meteo whose searchTerms were
    // enriched to make the engine resolve natural-language queries).
    const capture = await backend.run(async (ctx) => {
      const target = (await ctx.db.query('capabilityOfferings').collect())[0]
      if (target === undefined) throw new Error('curated_seed_drift_test_no_offering')
      return {
        offeringId: target.offeringId,
        sourceHash: target.registrationHash,
      } as const
    })

    // Simulate an earlier seed revision that registered the SAME offeringId with
    // DIFFERENT searchTerms: patch the stored offering so its registrationHash
    // remains integrity-valid but no longer matches what current source
    // produces. This is the pre-condition for offering_identity_conflict.
    const driftedSearchTerms = ['__drifted-offering-search-term__']
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (q) => q.eq('offeringId', capture.offeringId)).unique()
      if (row === null) throw new Error('curated_drift_offering_missing')
      const drifted = defineCapabilityOfferingRegistration({
        offeringId: row.offeringId,
        businessId: row.businessId,
        networkId: row.networkId,
        contractRef: {
          capabilityId: row.capabilityId,
          version: row.version,
          contractDigest: row.contractDigest,
        },
        presentation: row.presentation,
        ...(row.origin === undefined ? {} : { origin: row.origin }),
        searchTerms: driftedSearchTerms,
        registrationEvidenceRefs: row.registrationEvidenceRefs,
      })
      await ctx.db.patch(row._id, {
        searchTerms: driftedSearchTerms,
        registrationHash: capabilityOfferingRegistrationHash(drifted),
      })
    })

    // The reseed must self-heal (retire-and-replace the stale offering via
    // offering_identity_conflict) rather than bounce.
    const reseeded = await backend.mutation(internal.curatedProviders.seed, {})
    expect(reseeded.publications).toHaveLength(20)
    expect(new Set(reseeded.publications.map((publication: CuratedSeedPublication) => publication.capabilityId)).size).toBe(20)

    // The offering registrationHash is restored to the source-authoritative value.
    const healed = await backend.run(async (ctx) => {
      return await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (q) => q.eq('offeringId', capture.offeringId)).unique()
    })
    expect(healed?.registrationHash).toBe(capture.sourceHash)
    expect(healed?.searchTerms).not.toEqual(driftedSearchTerms)

    // A third seed is a no-op: the offering stays at the source hash.
    const third = await backend.mutation(internal.curatedProviders.seed, {})
    expect(third.publications).toHaveLength(20)
    const still = await backend.run(async (ctx) => {
      return await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (q) => q.eq('offeringId', capture.offeringId)).unique()
    })
    expect(still?.registrationHash).toBe(capture.sourceHash)
  })
})