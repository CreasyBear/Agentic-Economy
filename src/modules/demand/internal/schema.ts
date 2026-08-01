import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { literalUnion } from '@/modules/common/convex-literals'
import {
  SearchGapFactValues,
  SearchGapSurfaceValues,
} from './search-gap'

export const demandTables = {
  demandSignals: defineTable({
    service: v.string(),
    suburb: v.string(),
    note: v.optional(v.string()),
    createdAt: v.number(),
    sourceSurface: v.literal('registry'),
    queryText: v.optional(v.string()),
  })
    .index('by_sourceSurface_createdAt', ['sourceSurface', 'createdAt'])
    .index('by_service_suburb_createdAt', ['service', 'suburb', 'createdAt']),
  searchGapRecords: defineTable({
    fingerprint: v.string(),
    queryText: v.string(),
    surface: literalUnion(SearchGapSurfaceValues),
    requiredFacts: v.array(literalUnion(SearchGapFactValues)),
    candidateCount: v.number(),
    occurrences: v.number(),
    /**
     * Optional for the same reason as `factCounts`: rows predating the
     * unanswered-search reader carry no value, and a durable table must stay
     * readable across its own history. Those rows are absent from the
     * unanswered index rather than silently reclassified — deriving them would
     * require an unbounded scan, and the operator surface reports truncation.
     */
    unanswered: v.optional(v.boolean()),
    dayBucket: v.string(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index('by_fingerprint', ['fingerprint'])
    .index('by_dayBucket', ['dayBucket'])
    .index('by_unanswered_and_dayBucket', ['unanswered', 'dayBucket']),
  searchGapBusinessRecords: defineTable({
    fingerprint: v.string(),
    slug: v.string(),
    /**
     * One counter per fact. A single shared counter cannot answer
     * "how many searches mentioned price", which is the only claim the
     * owner surface makes.
     *
     * Optional because rows written before per-fact counting existed carry
     * only `missingFacts` and `occurrences`. A durable table must stay
     * readable across its own history, so readers derive the counts for those
     * rows instead of the deployment failing schema validation.
     */
    factCounts: v.optional(v.array(v.object({
      fact: literalUnion(SearchGapFactValues),
      searches: v.number(),
    }))),
    missingFacts: v.optional(v.array(literalUnion(SearchGapFactValues))),
    occurrences: v.number(),
    dayBucket: v.string(),
    lastQueryText: v.string(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index('by_fingerprint', ['fingerprint'])
    .index('by_slug_and_dayBucket', ['slug', 'dayBucket'])
    .index('by_dayBucket', ['dayBucket']),
} as const
