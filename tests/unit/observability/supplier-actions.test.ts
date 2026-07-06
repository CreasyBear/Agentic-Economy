import { describe, expect, it } from 'vitest'

import {
  reconstructSupplierActions,
  type SupplierActionSourceRow,
} from '@/modules/observability/internal/supplier-actions'

const WINDOW_START = 1_720_000_000_000
const WINDOW_END = WINDOW_START + 14 * 24 * 60 * 60 * 1000
const BUSINESS_ID = 'business:bondi-plumbing'
const CLAIM_ID = 'claim:bondi-plumbing'
const SLUG = 'bondi-plumbing'

function claimRow(overrides: Record<string, unknown> = {}): SupplierActionSourceRow {
  return {
    sourceType: 'claim',
    status: 'authenticated',
    businessId: BUSINESS_ID,
    claimId: CLAIM_ID,
    slug: SLUG,
    createdAt: WINDOW_START + 1_000,
    ...overrides,
  } as SupplierActionSourceRow
}

function funnelRow(overrides: Record<string, unknown> = {}): SupplierActionSourceRow {
  return {
    sourceType: 'funnel_event',
    eventType: 'owner_interest_submitted',
    source: 'claim_page',
    stage: 'visitor',
    pseudonymousSessionId: 'session:owner-interest',
    businessId: BUSINESS_ID,
    redactedPayloadJson: '{}',
    consentFlag: false,
    correlationId: 'corr:owner-interest',
    createdAt: WINDOW_START + 2_000,
    ...overrides,
  } as SupplierActionSourceRow
}

function directRecruitmentRow(overrides: Record<string, unknown> = {}): SupplierActionSourceRow {
  return {
    sourceType: 'recruitment',
    ledgerType: 'direct_recruitment',
    businessId: BUSINESS_ID,
    claimId: CLAIM_ID,
    slug: SLUG,
    outreachRef: 'outreach:bondi-plumbing',
    providerRef: BUSINESS_ID,
    createdAt: WINDOW_START - 60_000,
    ...overrides,
  } as SupplierActionSourceRow
}

function operatorEvidenceRow(overrides: Record<string, unknown> = {}): SupplierActionSourceRow {
  return {
    sourceType: 'operator_evidence',
    evidenceType: 'provider_maintenance',
    evidenceStatus: 'accepted',
    actionType: 'listing_request',
    targetType: 'business',
    targetRef: BUSINESS_ID,
    businessId: BUSINESS_ID,
    claimId: CLAIM_ID,
    slug: SLUG,
    operatorRef: 'operator:g3-dry-run',
    createdAt: WINDOW_START - 30_000,
    ...overrides,
  } as SupplierActionSourceRow
}

function securityDisputeRow(overrides: Record<string, unknown> = {}): SupplierActionSourceRow {
  return {
    sourceType: 'audit_event',
    eventType: 'dispute.opened',
    actorKind: 'anonymous',
    actorRef: 'privacy-requester:hash',
    businessId: BUSINESS_ID,
    slug: SLUG,
    targetType: 'dispute',
    targetRef: 'privacy/remove-business:bondi-plumbing',
    reasonCode: 'privacy_remove_business',
    evidenceRefs: ['privacy-remove-business:submitted'],
    correlationId: 'corr:privacy-dispute',
    createdAt: WINDOW_START + 3_000,
    ...overrides,
  } as SupplierActionSourceRow
}

describe('reconstructSupplierActions', () => {
  it('counts recruited or operator-evidenced authenticated and published claims, deduplicating repeated source rows', () => {
    const publishedBusinessId = 'business:published-provider'
    const publishedClaimId = 'claim:published-provider'
    const publishedSlug = 'published-provider'

    const result = reconstructSupplierActions(
      [
        directRecruitmentRow(),
        claimRow({ createdAt: WINDOW_START + 1_000 }),
        claimRow({ createdAt: WINDOW_START + 5_000 }),
        operatorEvidenceRow({
          businessId: publishedBusinessId,
          claimId: publishedClaimId,
          slug: publishedSlug,
          targetRef: publishedBusinessId,
        }),
        claimRow({
          businessId: publishedBusinessId,
          claimId: publishedClaimId,
          slug: publishedSlug,
          status: 'published',
          createdAt: WINDOW_START + 6_000,
        }),
      ],
      {
        windowStartMs: WINDOW_START,
        windowEndMs: WINDOW_END,
      },
    )

    expect(result.count).toBe(2)
    expect(result.actions).toEqual([
      expect.objectContaining({
        type: 'listing_request',
        businessId: BUSINESS_ID,
        claimId: CLAIM_ID,
        slug: SLUG,
        firstSeenAt: WINDOW_START + 1_000,
        lastSeenAt: WINDOW_START + 5_000,
        rowCount: 2,
      }),
      expect.objectContaining({
        type: 'listing_request',
        businessId: publishedBusinessId,
        claimId: publishedClaimId,
        slug: publishedSlug,
        firstSeenAt: WINDOW_START + 6_000,
      }),
    ])
  })

  it('does not count otherwise valid claim rows without business-scoped matching recruitment or operator evidence', () => {
    const result = reconstructSupplierActions(
      [
        claimRow({ businessId: undefined, claimId: 'claim:no-business', slug: 'no-business' }),
        directRecruitmentRow({ businessId: undefined, claimId: 'claim:no-business', slug: 'no-business' }),
        claimRow({
          businessId: 'business:mismatched-recruitment-evidence',
          claimId: 'claim:mismatched-recruitment-evidence',
          slug: 'mismatched-recruitment-evidence',
        }),
        directRecruitmentRow({
          businessId: 'business:wrong-recruitment-evidence',
          claimId: 'claim:mismatched-recruitment-evidence',
          slug: 'mismatched-recruitment-evidence',
        }),
        claimRow({
          businessId: 'business:mismatched-operator-evidence',
          claimId: 'claim:mismatched-operator-evidence',
          slug: 'mismatched-operator-evidence',
        }),
        operatorEvidenceRow({
          businessId: 'business:wrong-operator-evidence',
          claimId: 'claim:mismatched-operator-evidence',
          slug: 'mismatched-operator-evidence',
        }),
        claimRow({ claimId: 'claim:no-evidence', slug: 'no-evidence' }),
        operatorEvidenceRow({
          businessId: 'business:other-provider',
          claimId: 'claim:other-provider',
          slug: 'other-provider',
          targetRef: 'business:other-provider',
        }),
        claimRow({
          sourceType: 'listing',
          businessId: BUSINESS_ID,
          claimId: 'claim:mismatched-operator-evidence',
          slug: 'mismatched-operator-evidence',
        }),
      ],
      {
        windowStartMs: WINDOW_START,
        windowEndMs: WINDOW_END,
      },
    )

    expect(result).toMatchObject({ count: 0, actions: [] })
  })

  it('counts only authenticated or published claim statuses even with matching recruitment evidence', () => {
    const rejectedStatuses = ['contested', 'disputed', 'suppressed', 'submitted', undefined]
    const rows = rejectedStatuses.flatMap((status, index) => {
      const businessId = `business:rejected-status-${index}`
      const claimId = `claim:rejected-status-${index}`
      const slug = `rejected-status-${index}`

      return [
        directRecruitmentRow({ businessId, claimId, slug }),
        claimRow({
          businessId,
          claimId,
          slug,
          status,
          createdAt: WINDOW_START + 1_000 + index,
        }),
      ]
    })

    const result = reconstructSupplierActions(rows, {
      windowStartMs: WINDOW_START,
      windowEndMs: WINDOW_END,
    })

    expect(result).toMatchObject({ count: 0, actions: [] })
  })

  it('counts business-scoped owner interest only with matching operator evidence', () => {
    const result = reconstructSupplierActions(
      [
        operatorEvidenceRow({ claimId: undefined }),
        operatorEvidenceRow({
          businessId: 'business:other-provider',
          claimId: undefined,
          slug: 'other-provider',
          targetRef: 'business:other-provider',
        }),
        funnelRow({ businessId: undefined, correlationId: 'corr:unlinked-interest' }),
        funnelRow({ businessId: BUSINESS_ID, correlationId: 'corr:business-interest' }),
        funnelRow({ businessId: 'business:no-evidence', correlationId: 'corr:no-evidence-interest' }),
      ],
      {
        windowStartMs: WINDOW_START,
        windowEndMs: WINDOW_END,
      },
    )

    expect(result.count).toBe(1)
    expect(result.actions).toEqual([
      expect.objectContaining({
        type: 'owner_interest',
        businessId: BUSINESS_ID,
        correlationId: 'corr:business-interest',
        firstSeenAt: WINDOW_START + 2_000,
      }),
    ])
  })

  it('does not treat privacy or removal disputes as supplier-maintenance proof', () => {
    const result = reconstructSupplierActions(
      [
        securityDisputeRow(),
        operatorEvidenceRow({
          actionType: 'privacy_remove_business',
          evidenceStatus: 'accepted',
          targetType: 'dispute',
          targetRef: 'privacy/remove-business:bondi-plumbing',
          reasonCode: 'privacy_remove_business',
        }),
        funnelRow({ eventType: 'dispute_opened', correlationId: 'corr:funnel-dispute' }),
        funnelRow({ eventType: 'refund_or_dispute_recorded', correlationId: 'corr:billing-dispute' }),
      ],
      {
        windowStartMs: WINDOW_START,
        windowEndMs: WINDOW_END,
      },
    )

    expect(result).toMatchObject({ count: 0, actions: [] })
  })

  it('filters otherwise countable rows outside the explicit dry-run window', () => {
    const result = reconstructSupplierActions(
      [
        directRecruitmentRow({
          businessId: 'business:before-window',
          claimId: 'claim:before-window',
          slug: 'before-window',
        }),
        claimRow({
          businessId: 'business:before-window',
          claimId: 'claim:before-window',
          slug: 'before-window',
          createdAt: WINDOW_START - 1,
        }),
        operatorEvidenceRow({
          businessId: 'business:inside-window',
          claimId: undefined,
          slug: 'inside-window',
          targetRef: 'business:inside-window',
        }),
        funnelRow({
          businessId: 'business:inside-window',
          correlationId: 'corr:inside-window',
          createdAt: WINDOW_START + 10_000,
        }),
        directRecruitmentRow({
          businessId: 'business:after-window',
          claimId: 'claim:after-window',
          slug: 'after-window',
        }),
        claimRow({
          businessId: 'business:after-window',
          claimId: 'claim:after-window',
          slug: 'after-window',
          createdAt: WINDOW_END + 1,
        }),
      ],
      {
        windowStartMs: WINDOW_START,
        windowEndMs: WINDOW_END,
      },
    )

    expect(result.count).toBe(1)
    expect(result.actions).toEqual([
      expect.objectContaining({
        type: 'owner_interest',
        businessId: 'business:inside-window',
        correlationId: 'corr:inside-window',
        firstSeenAt: WINDOW_START + 10_000,
      }),
    ])
  })
})
