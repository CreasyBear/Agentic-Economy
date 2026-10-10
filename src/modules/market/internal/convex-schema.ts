import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const marketTables = {
  marketSavedTools: defineTable({
    ownerId: v.string(),
    kind: v.union(v.literal('ae_callable'), v.literal('external_listing')),
    identityRef: v.string(),
    createdAt: v.number(),
  })
    .index('by_owner_kind_ref', ['ownerId', 'kind', 'identityRef'])
    .index('by_owner_created', ['ownerId', 'createdAt']),
  marketExternalRegistryState: defineTable({
    key: v.literal('coinbase'),
    activeGeneration: v.optional(v.string()),
    refreshGeneration: v.optional(v.string()),
    // Well 8 Lane B: the current run's start time, threaded through to every
    // touched row's lastSeenRunAt and used as the removal sweep's staleness
    // threshold (x402DirectoryIndexStore.cleanup). Set on every begin(), kept
    // (not cleared) after completion as a "last refresh started at" record.
    runStartedAt: v.optional(v.number()),
    lastAttemptAt: v.number(),
    lastAttemptStatus: v.union(
      v.literal('refreshing'),
      v.literal('complete'),
      v.literal('failed'),
    ),
    lastError: v.optional(v.string()),
  }).index('by_key', ['key']),
  marketExternalRegistryGenerations: defineTable({
    generation: v.string(),
    source: v.optional(v.literal('coinbase')),
    status: v.union(
      v.literal('refreshing'),
      v.literal('complete'),
      v.literal('failed'),
    ),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    ingestedCount: v.number(),
    nextOffset: v.optional(v.number()),
    pageItemCursor: v.optional(v.number()),
    analyticsVersion: v.optional(v.number()),
    analyticsCursor: v.optional(v.string()),
    analyticsProcessed: v.optional(v.number()),
    analyticsStatus: v.optional(v.union(v.literal('building'), v.literal('ready'))),
    sourceReportedInitial: v.optional(v.number()),
    sourceReportedLatest: v.optional(v.number()),
    sourceReportedMinimum: v.optional(v.number()),
    sourceReportedMaximum: v.optional(v.number()),
    pagesFetched: v.optional(v.number()),
    observations: v.optional(v.number()),
    duplicateObservations: v.optional(v.number()),
    terminalObserved: v.optional(v.boolean()),
    analyticsStatsStatus: v.optional(v.union(v.literal('pending'), v.literal('ready'))),
  }).index('by_generation', ['generation']),
  marketExternalRegistryEntries: defineTable({
    generation: v.string(),
    documentId: v.string(),
    // Well 8 Lane C: 'provider' rows are the reviewed-tier (provider_owned/
    // ae_curated_external) publication projection written by
    // x402DirectoryIndexStore.upsertProviderDirectoryRows - a synthetic
    // Coinbase-shaped entry so storedDirectoryEntry/indexedDirectoryEntry and
    // every browse/search/facets/bySlug/canonical reader need no
    // provider-specific branch. Keyed by a documentId digest over
    // sourceRouteRef (not resource), a wholly separate identity namespace
    // from Coinbase's resource-keyed rows.
    source: v.union(v.literal('coinbase'), v.literal('provider')),
    upstreamServiceId: v.string(),
    upstreamEndpointId: v.string(),
    sourceUrl: v.string(),
    endpointUrl: v.optional(v.string()),
    name: v.string(),
    summary: v.string(),
    provider: v.string(),
    category: v.string(),
    method: v.optional(v.string()),
    tags: v.array(v.string()),
    actionClass: v.optional(v.union(v.literal('retrieve'), v.literal('transform'), v.literal('analyze'), v.literal('create'), v.literal('mutate'), v.literal('other'), v.literal('unclassified'))),
    objectClass: v.optional(v.union(v.literal('web'), v.literal('document'), v.literal('image'), v.literal('location'), v.literal('chain'), v.literal('data'), v.literal('other'), v.literal('unclassified'))),
    networks: v.array(v.string()),
    access: v.union(
      v.literal('x402'),
      v.literal('provider_account'),
      v.literal('unknown'),
    ),
    authority: v.literal('source_metadata_only'),
    sourceDigest: v.string(),
    searchText: v.string(),
    updatedAt: v.number(),
    directoryEntryJson: v.optional(v.string()),
    directorySourceJson: v.optional(v.string()),
    directoryCategory: v.optional(v.string()),
    directorySourceUpdatedAt: v.optional(v.number()),
    directoryCalls30d: v.optional(v.number()),
    // Well 8 Lane B (one live generation updated in place): digest over
    // listing-identity fields only (resource, method, description, accepts,
    // metadata flags, category, tags, bundleSlugs, curated) - never
    // calls30d/payers30d/lastCalledAt. Comparing this against the freshly
    // computed value on each refresh is what lets an unchanged listing skip
    // the expensive rewrite/facet-delta path (x402DirectoryIndexStore.ts).
    listingDigest: v.optional(v.string()),
    // Stamped to the run's start time (marketExternalRegistryState.
    // runStartedAt) on every resource this run actually observed upstream.
    // The removal sweep (x402DirectoryIndexStore.cleanup) deletes rows whose
    // lastSeenRunAt is older than the current run's start - i.e. resources
    // the upstream directory no longer reports.
    lastSeenRunAt: v.optional(v.number()),
  })
    .index('by_generation_and_documentId', ['generation', 'documentId'])
    .index('by_generation_source_and_documentId', [
      'generation',
      'source',
      'documentId',
    ])
    .index('by_generation_access_and_documentId', [
      'generation',
      'access',
      'documentId',
    ])
    .index('by_generation_and_lastSeenRunAt', ['generation', 'lastSeenRunAt'])
    .searchIndex('search_searchText_by_generation_source', {
      searchField: 'searchText',
      filterFields: ['generation', 'source', 'access'],
    }),
  // Compact native search projections: one all-network row and one row per
  // supported network for each observed resource. No publication or admission.
  marketDirectorySearchEntries: defineTable({
    generation: v.string(),
    resource: v.string(),
    entryId: v.id('marketExternalRegistryEntries'),
    network: v.string(),
    category: v.string(),
    documentId: v.optional(v.string()),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    provider: v.string(),
    actionClass: v.optional(v.union(v.literal('retrieve'), v.literal('transform'), v.literal('analyze'), v.literal('create'), v.literal('mutate'), v.literal('other'), v.literal('unclassified'))),
    objectClass: v.optional(v.union(v.literal('web'), v.literal('document'), v.literal('image'), v.literal('location'), v.literal('chain'), v.literal('data'), v.literal('other'), v.literal('unclassified'))),
    // Normalised host (lowercase, no port, no trailing dot). Optional until the
    // backfill migration (convex/migrations.ts:backfillDirectoryEligibility)
    // completes on every existing generation, then tightened to required.
    providerKey: v.optional(v.string()),
    // Directory quality bar (src/modules/market/x402-directory-index.ts:
    // isDirectoryEntryEligible), computed once per resource at write time and
    // copied onto every network-variant row. Optional for the same backfill
    // reason as providerKey.
    eligible: v.optional(v.boolean()),
    // Stable route identity for the resource, computed the same way
    // capability-supply computes `capabilityPublications.sourceRouteRef`
    // (src/modules/capability-supply/internal/source-route-identity.ts). Lets
    // the canonical Tool URL join to an admitted publication without storing
    // a toolRef that would go stale across admission/withdrawal.
    sourceRouteRef: v.optional(v.string()),
    // Kebab slug for the canonical `/tools/<providerKey>/<slug>` URL, derived
    // from the resource path at write time (method-qualified only when two
    // resources on the same host collide). Optional for the same backfill
    // reason as providerKey/eligible.
    slug: v.optional(v.string()),
    // Well 8 Lane C: 'provider' rows are written from a current reviewed-tier
    // publication (provider_owned/ae_curated_external) by
    // x402DirectoryIndexStore.upsertProviderDirectoryRows; optional and
    // absent on every pre-existing row, which means 'coinbase'. A provider
    // row wins a shared sourceRouteRef over a Coinbase-sourced one (see
    // upsertProviderDirectoryRows and the suppression check in writeSource).
    source: v.optional(v.union(v.literal('coinbase'), v.literal('provider'))),
    searchText: v.string(),
    popularOrder: v.number(),
    updatedOrder: v.number(),
    minimumUsdPrice: v.optional(v.string()),
    minimumUsdPriceOrder: v.number(),
    payersOrder: v.optional(v.number()),
    priceOrder: v.optional(v.number()),
    priceBand: v.optional(v.string()),
    adoptionBand: v.optional(v.string()),
    curated: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    bundleSlugs: v.optional(v.array(v.string())),
    hasInputFields: v.optional(v.boolean()),
    hasOutputFields: v.optional(v.boolean()),
    hasInputSchema: v.optional(v.boolean()),
    hasOutputSchema: v.optional(v.boolean()),
    hasOutputExample: v.optional(v.boolean()),
    payerDepth: v.optional(v.number()),
    depthBand: v.optional(v.string()),
    lastActivatedAt: v.optional(v.number()),
    lastCalledBand: v.optional(v.string()),
    callDelta: v.optional(v.number()),
    payerDelta: v.optional(v.number()),
    momentumOrder: v.optional(v.number()),
    momentumBand: v.optional(v.string()),
    // Lowest exact Base USDC payTo, stored on the '*' row only. Optional until
    // the next directory refresh writes it. Volume joins on this address.
    basePayTo: v.optional(v.string()),
    // Whether Quote can admit this resource, decided at index time by the same
    // admitFacilitatorDiscoveryItems path Quote runs. Optional until the next
    // directory refresh writes it; Quote re-decides regardless.
    admission: v.optional(v.union(v.object({ kind: v.literal('quotable') }), v.object({ kind: v.literal('unavailable'), reason: v.string() }))),
  })
    .index('by_generation_and_resource', ['generation', 'resource'])
    .index('by_generation_and_network_and_payersOrder', ['generation', 'network', 'payersOrder'])
    .index('by_generation_and_network_and_momentumOrder', ['generation', 'network', 'momentumOrder'])
    .index('by_generation_and_network_and_category_and_payersOrder', ['generation', 'network', 'category', 'payersOrder'])
    .index('by_generation_and_network_and_provider_and_payersOrder', ['generation', 'network', 'provider', 'payersOrder'])
    .index('by_generation_and_network_and_priceOrder', ['generation', 'network', 'priceOrder'])
    .index('by_generation_and_network_and_category_and_priceOrder', ['generation', 'network', 'category', 'priceOrder'])
    .index('by_generation_and_network_and_provider_and_priceOrder', ['generation', 'network', 'provider', 'priceOrder'])
    .index('by_generation_and_network_and_curated_and_payersOrder', ['generation', 'network', 'curated', 'payersOrder'])
    .index('by_generation_and_network_and_resource', ['generation', 'network', 'resource'])
    .index('by_generation_and_network_and_popularOrder', ['generation', 'network', 'popularOrder'])
    .index('by_generation_and_network_and_category_and_popularOrder', ['generation', 'network', 'category', 'popularOrder'])
    .index('by_generation_and_network_and_provider_and_popularOrder', ['generation', 'network', 'provider', 'popularOrder'])
    .index('by_generation_and_network_and_provider_and_lastActivatedAt', ['generation', 'network', 'provider', 'lastActivatedAt'])
    .index('by_generation_and_network_and_provider_and_payerDepth', ['generation', 'network', 'provider', 'payerDepth'])
    // Eligible-narrowed variants for default no-provider browse/search.
    // Provider-filtered browse reads the un-narrowed indexes above.
    .index('by_generation_and_network_and_elig_and_payersOrder', ['generation', 'network', 'eligible', 'payersOrder'])
    .index('by_generation_and_network_and_elig_and_category_and_payersOrder', ['generation', 'network', 'eligible', 'category', 'payersOrder'])
    .index('by_generation_and_network_and_elig_and_priceOrder', ['generation', 'network', 'eligible', 'priceOrder'])
    .index('by_generation_and_network_and_elig_and_category_and_priceOrder', ['generation', 'network', 'eligible', 'category', 'priceOrder'])
    .index('by_generation_and_network_and_elig_and_popularOrder', ['generation', 'network', 'eligible', 'popularOrder'])
    .index('by_generation_and_network_and_elig_and_lastActivatedAt', ['generation', 'network', 'eligible', 'lastActivatedAt'])
    .index('by_gen_net_elig_cat_lastActivated', ['generation', 'network', 'eligible', 'category', 'lastActivatedAt'])
    .index('by_generation_and_network_and_elig_and_payerDepth', ['generation', 'network', 'eligible', 'payerDepth'])
    .index('by_gen_net_elig_cat_payerDepth', ['generation', 'network', 'eligible', 'category', 'payerDepth'])
    // Abbreviated (fields still present, just shortened): the unabbreviated
    // name for this field set ran to exactly 64 characters, at the edge of
    // Convex's index name length ceiling.
    .index('by_gen_net_elig_cat_popular', ['generation', 'network', 'eligible', 'category', 'popularOrder'])
    // Canonical Tool URL lookup: providerKey+slug within one generation, then
    // filtered to the '*' network row in the query (minimal compound index -
    // no network segment needed since slug is generation/resource-scoped,
    // not network-scoped).
    .index('by_generation_and_providerKey_and_slug', ['generation', 'providerKey', 'slug'])
    // Reverse lookup for the `/tools/$toolRef` redirect: an admitted
    // publication's sourceRouteRef back to its directory entry's slug.
    .index('by_generation_and_sourceRouteRef', ['generation', 'sourceRouteRef'])
    .index('by_generation_and_basePayTo', ['generation', 'basePayTo'])
    .searchIndex('search_text_by_generation_network_category_provider', {
      searchField: 'searchText',
      filterFields: ['generation', 'network', 'category', 'provider', 'eligible'],
    }),
  marketDirectoryFacets: defineTable({
    generation: v.string(),
    kind: v.union(v.literal('category'), v.literal('provider'), v.literal('network'), v.literal('tag'), v.literal('bundle'), v.literal('depth'), v.literal('recency')),
    key: v.string(),
    label: v.string(),
    iconUrl: v.optional(v.string()),
    // Provider rows only. The busiest Tool on that host, so the Providers
    // list can sort without reading every Tool. -1 means no reported calls.
    leadCalls: v.optional(v.number()),
    leadPayers: v.optional(v.number()),
    leadTitle: v.optional(v.string()),
    leadPrice: v.optional(v.string()),
    leadSlug: v.optional(v.string()),
  }).index('by_generation_and_kind_and_key', ['generation', 'kind', 'key'])
    .index('by_generation_and_kind_and_leadCalls', ['generation', 'kind', 'leadCalls']),
  // Derived category concentration over the completed generation's '*' search
  // projections. Replaced wholesale by finalizeCategoryStats after backfill.
  marketDirectoryCategoryStats: defineTable({
    generation: v.string(), network: v.string(), category: v.string(), label: v.string(),
    toolCount: v.number(), documentedPayers: v.number(),
    totalCalls: v.number(), totalPayers: v.number(),
    top3Share: v.number(), hhi: v.number(), computedAt: v.number(),
  }).index('by_generation_and_network', ['generation', 'network']),
  marketEvidenceFacts: defineTable({
    kind: v.union(
      v.literal('ae_invocation'),
      v.literal('ae_answer_reported'),
      v.literal('ae_invocation_completed'),
      v.literal('ae_invocation_refused'),
      v.literal('ae_settlement'),
      v.literal('ae_qualified_use'),
      v.literal('ae_reconciliation_required'),
    ),
    sourceRef: v.string(),
    reporterRef: v.optional(v.string()),
    toolRef: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    // ae_invocation_refused only: the public refusal category.
    refusalCode: v.optional(v.string()),
    occurredAt: v.number(),
  })
    .index('by_kind_and_sourceRef', ['kind', 'sourceRef'])
    .index('by_kind_and_toolRef_and_occurredAt', [
      'kind',
      'toolRef',
      'occurredAt',
    ]),
  marketToolCategories: defineTable({
    toolRef: v.string(),
    categoryId: v.string(),
    assignedBy: v.string(),
    assignedAt: v.number(),
  })
    .index('by_toolRef', ['toolRef'])
    .index('by_categoryId_and_toolRef', ['categoryId', 'toolRef']),
  marketToolRatings: defineTable({
    toolRef: v.string(),
    reviewerRef: v.string(),
    score: v.number(),
    review: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_toolRef_and_reviewerRef', ['toolRef', 'reviewerRef'])
    .index('by_reviewerRef_and_updatedAt', ['reviewerRef', 'updatedAt']),
  marketActiveTools: defineTable({
    toolRef: v.string(),
    businessId: v.id('businesses'),
    activatedAt: v.number(),
  })
    .index('by_toolRef', ['toolRef'])
    .index('by_businessId', ['businessId']),
  marketActiveProviders: defineTable({
    businessId: v.id('businesses'),
    activatedAt: v.number(),
  }).index('by_businessId', ['businessId']),
  // One grouped Base USDC print per recipient, facilitator, and closed UTC day.
  // Summing Tool rows is not this total: several Tools can pay one recipient.
  marketFlowDaily: defineTable({
    recipient: v.string(),
    chain: v.literal('eip155:8453'),
    asset: v.string(),
    facilitator: v.string(),
    day: v.string(),
    amountAtomic: v.string(),
    transferCount: v.number(),
    uniqueBuyers: v.number(),
    latestAt: v.number(),
  })
    .index('by_recipient_facilitator_and_day', ['recipient', 'facilitator', 'day'])
    .index('by_day', ['day']),
  marketFlowCheckpoint: defineTable({
    key: v.string(),
    lastClosedDay: v.optional(v.string()),
    windowStart: v.optional(v.string()),
    facilitatorSetDigest: v.string(),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_key', ['key']),
  // Maintained 30-day sum of marketFlowDaily, so the Tools page does not scan every print.
  // uniqueBuyers is summed across facilitators and overcounts a buyer who used two of them.
  marketFlowRecipient: defineTable({
    recipient: v.string(),
    chain: v.literal('eip155:8453'),
    asset: v.string(),
    amountAtomic: v.string(),
    transferCount: v.number(),
    uniqueBuyers: v.number(),
    rankKey: v.string(),
  })
    .index('by_recipient', ['recipient'])
    .index('by_rankKey', ['rankKey']),
  // On-demand 30-day amount for the payees on the tools currently shown.
  // Kept apart from marketFlowRecipient so a page lookup cannot double a daily print.
  marketFlowPayeeVolume: defineTable({
    recipient: v.string(),
    windowEnd: v.string(),
    amountAtomic: v.string(),
    fetchedAt: v.number(),
  }).index('by_recipient', ['recipient']),
} as const
