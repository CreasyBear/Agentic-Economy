import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { markPublicOfferingRevisionWithdrawn } from '../../../convex/catalogSupplyProjection'
import type { RuntimeDb } from '../../../convex/source_state'
import {
  resolveHistoricalPublicOffering,
  type BusinessOfferingRecord,
  type BusinessOfferingRevisionRecord,
  type OfferingPublicRevisionHistoryRecord,
} from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'

const businessId = brandNonEmpty('business:studio', 'BusinessId')
const otherBusinessId = brandNonEmpty('business:other', 'BusinessId')
const offeringRef = brandNonEmpty('offering:studio:website', 'OfferingRef')
const selectedHash = brandNonEmpty('sha256:selected', 'SourceHash')
const currentHash = brandNonEmpty('sha256:current', 'SourceHash')

const offering: BusinessOfferingRecord = {
  businessId,
  offeringRef,
  currentRevision: 2,
  status: 'published',
  createdAt: 1,
  updatedAt: 20,
}

const selectedRevision: BusinessOfferingRevisionRecord = {
  businessId,
  offeringRef,
  revision: 1,
  name: 'Brochure website',
  category: 'Professional service',
  summary: 'A small informational website.',
  sourceHash: selectedHash,
  createdAt: 10,
}

const currentRevision: BusinessOfferingRevisionRecord = {
  ...selectedRevision,
  revision: 2,
  name: 'Brochure and commerce website',
  sourceHash: currentHash,
  createdAt: 20,
}

const history: OfferingPublicRevisionHistoryRecord = {
  businessId,
  offeringRef,
  revision: 1,
  offeringSourceHash: selectedHash,
  publishedAt: 11,
  withdrawnAt: 18,
  safeDisplayDisposition: 'retain_safe_history',
}

type HistoricalResolveInput = Parameters<typeof resolveHistoricalPublicOffering>[0]
type HistoricalResolveOverrides =
  & Omit<Partial<HistoricalResolveInput>, 'history'>
  & { history?: HistoricalResolveInput['history'] | undefined }

function resolve(overrides: HistoricalResolveOverrides = {}) {
  const { history: historyOverride, ...remainingOverrides } = overrides
  const includeHistory = !Object.prototype.hasOwnProperty.call(overrides, 'history')
    || historyOverride !== undefined

  return resolveHistoricalPublicOffering({
    selection: { businessId, offeringRef, revision: 1, offeringSourceHash: selectedHash },
    business: { businessId, isPublic: true, isSuppressed: false },
    offering,
    selectedRevision,
    currentRevision,
    ...(includeHistory ? { history: historyOverride ?? history } : {}),
    ...remainingOverrides,
  })
}

describe('historical public Offering resolution', () => {
  it('returns the exact previously public revision and reports a newer current revision separately', () => {
    const result = resolve()

    expect(result).toEqual({
      kind: 'resolved',
      revision: selectedRevision,
      publication: {
        publishedAt: 11,
        withdrawnAt: 18,
        safeDisplayDisposition: 'retain_safe_history',
      },
      newerCurrentRevision: {
        businessId,
        offeringRef,
        revision: 2,
        offeringSourceHash: currentHash,
      },
    })
    expect(result.kind === 'resolved' ? result.revision.revision : undefined).toBe(1)
  })

  const unavailableCases: ReadonlyArray<readonly [
    string,
    HistoricalResolveOverrides,
  ]> = [
    ['never_public', { history: undefined }],
    ['business_mismatch', {
      history: { ...history, businessId: otherBusinessId },
    }],
    ['source_hash_mismatch', {
      history: { ...history, offeringSourceHash: currentHash },
    }],
    ['legacy_reference', {
      selection: {
        businessId,
        offeringRef: brandNonEmpty('legacy-offering:service-1', 'OfferingRef'),
        revision: 1,
        offeringSourceHash: selectedHash,
      },
    }],
  ]

  it.each(unavailableCases)('refuses %s without revealing selected facts', (reason, overrides) => {
    expect(resolve(overrides)).toEqual({ kind: 'unavailable', reason })
  })

  it.each([
    ['business_not_public', { business: { businessId, isPublic: false, isSuppressed: false } }],
    ['business_suppressed', { business: { businessId, isPublic: true, isSuppressed: true } }],
    ['privacy_withdrawn', {
      history: { ...history, safeDisplayDisposition: 'hidden_privacy' },
    }],
    ['safety_withdrawn', {
      history: { ...history, safeDisplayDisposition: 'hidden_safety' },
    }],
  ] as const)('applies live or retained-history suppression before returning facts: %s', (reason, overrides) => {
    expect(resolve(overrides)).toEqual({ kind: 'unavailable', reason })
  })

  it('uses one exact bounded history index and checks live suppression before revision reads', () => {
    const source = readFileSync(
      new URL('../../../convex/catalog.ts', import.meta.url),
      'utf8',
    )
    const queryStart = source.indexOf('export const readHistoricalPublicOfferingRevision')
    const queryEnd = source.indexOf('export const retryBusinessSupplyProjection', queryStart)
    const query = source.slice(queryStart, queryEnd)

    expect(query).toContain(
      'by_businessId_and_offeringRef_and_revision_and_offeringSourceHash',
    )
    expect(query).toContain('.unique()')
    expect(query).not.toContain('.collect()')
    expect(query.indexOf('hasActiveBusinessSuppression')).toBeLessThan(
      query.indexOf("db.query('offeringPublicRevisionHistory')"),
    )
    expect(query.indexOf("db.query('offeringPublicRevisionHistory')")).toBeLessThan(
      query.indexOf("db.query('businessOfferingRevisions')"),
    )
  })

  it('uses a bounded three-field history prefix for comparison reads without public source hashes', () => {
    const source = readFileSync(
      new URL('../../../convex/catalog.ts', import.meta.url),
      'utf8',
    )
    const queryStart = source.indexOf('export const readPublicComparisonOfferingReference')
    const queryEnd = source.indexOf('export const readHistoricalPublicOfferingRevision', queryStart)
    const query = source.slice(queryStart, queryEnd)

    expect(queryStart).toBeGreaterThan(-1)
    expect(query).toContain('businessId: v.string()')
    expect(query).toContain('.eq(\'businessId\', businessId)')
    expect(query).toContain('.eq(\'offeringRef\', args.offeringRef)')
    expect(query).toContain('.eq(\'revision\', args.revision)')
    expect(query).toContain('historyQuery.take(2)')
    expect(query).not.toContain('.collect()')
    expect(query).not.toContain('.filter(')
    expect(query).not.toContain('offeringSourceHash: v.string()')
    expect(query.indexOf('hasActiveBusinessSuppression')).toBeLessThan(
      query.indexOf("query('offeringPublicRevisionHistory')"),
    )
  })

  it.each(['hidden_privacy', 'hidden_safety'] as const)(
    'keeps %s monotonic across a later ordinary withdrawal',
    async (safeDisplayDisposition) => {
      const patches: Array<Record<string, unknown>> = []
      const row = { _id: 'history:1', safeDisplayDisposition }
      type HistoryQuery = {
        eq: () => HistoryQuery
        withIndex: (_name: string, select: (builder: HistoryQuery) => HistoryQuery) => HistoryQuery
        unique: () => Promise<typeof row>
      }
      const query: HistoryQuery = {
        eq: () => query,
        withIndex: (_name, select) => select(query),
        unique: async () => row,
      }
      const db = {
        query: () => query,
        patch: async (_id: string, value: Record<string, unknown>) => {
          patches.push(value)
        },
      } as unknown as RuntimeDb

      await markPublicOfferingRevisionWithdrawn(db, {
        businessId,
        offeringRef,
        revision: 1,
        offeringSourceHash: selectedHash,
        withdrawnAt: 30,
      })

      expect(patches).toEqual([{
        withdrawnAt: 30,
        safeDisplayDisposition,
      }])
    },
  )
})
