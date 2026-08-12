import { describe, expect, it } from 'vitest'

import { buildAnswerInquiryHref } from '@/modules/answer/public'
import {
  MAX_INQUIRY_DRAFT_CHARS,
  buildInquiryPrefillHref,
  sanitizeInquiryDraft,
  sanitizeInquirySlug,
  validateInquirySearch,
} from '@/modules/inquiries/inquiry-prefill'
import { buildPublicInquiryAffordance, selectPublicInquiryTarget } from '@/modules/inquiries/route-readbacks'
import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import * as inquiries from '@/modules/inquiries/public'
import type { CapabilityLaunchSupportRecord, InquirySourceState } from '@/modules/inquiries/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

describe('sanitizeInquiryDraft', () => {
  it('trims, collapses whitespace, and keeps a normal stated need', () => {
    expect(sanitizeInquiryDraft('  Leaking   tap\n\nunder the sink  ')).toBe('Leaking tap under the sink')
  })

  it('caps at the draft maximum', () => {
    expect(sanitizeInquiryDraft('a'.repeat(MAX_INQUIRY_DRAFT_CHARS + 200))).toHaveLength(MAX_INQUIRY_DRAFT_CHARS)
  })

  it('strips control characters', () => {
    expect(sanitizeInquiryDraft('need\u0000 help\u0007 now')).toBe('need help now')
  })

  it('drops empty, whitespace-only, and non-string input', () => {
    expect(sanitizeInquiryDraft('')).toBeUndefined()
    expect(sanitizeInquiryDraft('   ')).toBeUndefined()
    expect(sanitizeInquiryDraft(undefined)).toBeUndefined()
    expect(sanitizeInquiryDraft(42)).toBeUndefined()
    expect(sanitizeInquiryDraft({ body: 'x' })).toBeUndefined()
  })
})

describe('sanitizeInquirySlug', () => {
  it('accepts lowercase kebab slugs', () => {
    expect(sanitizeInquirySlug('emergency-plumbing')).toBe('emergency-plumbing')
    expect(sanitizeInquirySlug('  abc123  ')).toBe('abc123')
  })

  it('drops malformed, unsafe, oversized, or non-string slugs', () => {
    expect(sanitizeInquirySlug('Emergency-Plumbing')).toBeUndefined()
    expect(sanitizeInquirySlug('../evil')).toBeUndefined()
    expect(sanitizeInquirySlug('a b')).toBeUndefined()
    expect(sanitizeInquirySlug('-leading')).toBeUndefined()
    expect(sanitizeInquirySlug('a--b')).toBeUndefined()
    expect(sanitizeInquirySlug('a'.repeat(200))).toBeUndefined()
    expect(sanitizeInquirySlug(undefined)).toBeUndefined()
    expect(sanitizeInquirySlug(99)).toBeUndefined()
  })
})

describe('buildInquiryPrefillHref', () => {
  it('carries a sanitized draft', () => {
    expect(
      buildInquiryPrefillHref({ slug: 'plumbing-demo', draft: 'Leaking tap' }),
    ).toBe('/plumbing-demo/inquiry?draft=Leaking%20tap')
  })

  it('keeps the base path when there is nothing usable to carry', () => {
    expect(buildInquiryPrefillHref({ slug: 'plumbing-demo' })).toBe('/plumbing-demo/inquiry')
    expect(buildInquiryPrefillHref({ slug: 'plumbing-demo', draft: '   ' })).toBe(
      '/plumbing-demo/inquiry',
    )
  })

  it('returns undefined for a malformed slug rather than a broken url', () => {
    expect(buildInquiryPrefillHref({ slug: '../../etc', draft: 'x' })).toBeUndefined()
  })

  it('caps the draft it encodes into the url', () => {
    const href = buildInquiryPrefillHref({ slug: 'plumbing-demo', draft: 'a'.repeat(MAX_INQUIRY_DRAFT_CHARS + 100) })
    expect(href).toBeDefined()
    const draftParam = new URL(`https://ae.example${href ?? ''}`).searchParams.get('draft')
    expect(draftParam).toHaveLength(MAX_INQUIRY_DRAFT_CHARS)
  })
})

describe('buildAnswerInquiryHref', () => {
  it('carries the answer origin and the customer draft', () => {
    expect(
      buildAnswerInquiryHref({ inquiryUrl: '/plumbing-demo/inquiry', threadId: 'thread-1', draft: 'Leaking tap' }),
    ).toBe('/plumbing-demo/inquiry?from=thread&id=thread-1&draft=Leaking%20tap')
  })

  it('keeps the existing thread origin shape when there is no usable draft', () => {
    expect(buildAnswerInquiryHref({ inquiryUrl: '/plumbing-demo/inquiry', threadId: 'thread-1', draft: '   ' })).toBe(
      '/plumbing-demo/inquiry?from=thread&id=thread-1',
    )
  })

  it('carries only the draft when there is no thread yet', () => {
    expect(buildAnswerInquiryHref({ inquiryUrl: '/plumbing-demo/inquiry', draft: 'Leaking tap' })).toBe(
      '/plumbing-demo/inquiry?draft=Leaking%20tap',
    )
  })

  it('returns the bare inquiry url when there is nothing to carry', () => {
    expect(buildAnswerInquiryHref({ inquiryUrl: '/plumbing-demo/inquiry' })).toBe('/plumbing-demo/inquiry')
  })
})

const DEMO_BUSINESS_ID = brandNonEmpty('business:demo', 'BusinessId')
const DEMO_OWNER_ID = brandNonEmpty('owner:demo', 'OwnerId')
const DEMO_CLAIM_ID = brandNonEmpty('claim:demo', 'ClaimId')
const NOW = 1_900_000_000_000

function inquiryOffering(slug: string, name: string): PublicBusinessCatalogApiV2Dto['offerings'][number] {
  const offeringRef = brandNonEmpty(`offering:${slug}`, 'OfferingRef')
  const accessPathRef = brandNonEmpty(`access:ae:${slug}`, 'AccessPathRef')
  const descriptor = {
    kind: 'human_request' as const,
    channel: 'ae_inquiry' as const,
    disclosure: 'Use the source-owned inquiry form for a first contact.',
  }
  return {
    offeringRef,
    revision: 1,
    name,
    category: name,
    summary: `${name} triage.`,
    serviceAreaSummary: 'Parramatta',
    availabilitySummary: 'Hours supplied by owner',
    accessPaths: [{
      accessPathRef,
      offeringRevision: 1,
      ...descriptor,
    }],
    support: { integrated: false, aeSupportedAction: false },
  }
}

function twoOfferingCatalog(): PublicBusinessCatalogApiV2Dto {
  return {
    schemaVersion: 'public-business-catalog-api:v2',
    businessId: DEMO_BUSINESS_ID,
    slug: brandNonEmpty('plumbing-demo', 'Slug'),
    name: 'Demo Plumbing',
    category: 'Plumbing',
    businessContext: { kind: 'local_human', suburb: 'Parramatta', stateTerritory: 'NSW' },
    publicUrl: '/plumbing-demo',
    trustTier: 'contact_confirmed',
    observedAt: NOW,
    disposition: 'current',
    photos: [],
    offerings: [
      inquiryOffering('emergency-plumbing', 'Emergency plumbing'),
      inquiryOffering('blocked-drains', 'Blocked drains'),
    ],
    accessSummary: {
      humanRequest: true,
      externalOperation: false,
      aeSupportedAction: false,
    },
  }
}

function admittedInquiryState(catalog: PublicBusinessCatalogApiV2Dto): InquirySourceState {
  const businessId = brandNonEmpty(catalog.businessId, 'BusinessId')
  const slug = brandNonEmpty(catalog.slug, 'Slug')
  return inquiries.createEmptyInquirySourceState({
    businesses: [
      {
        businessId,
        ownerId: DEMO_OWNER_ID,
        slug,
        name: catalog.name,
        normalizedName: catalog.name.toLowerCase(),
        category: catalog.category,
        businessContext: catalog.businessContext,
        publicStatus: 'published',
        trustTier: catalog.trustTier,
        claimStatus: 'published',
        sourceHash: canonicalDigest({ businessId }),
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    businessOfferings: catalog.offerings.map((offering) => ({
      offeringRef: brandNonEmpty(offering.offeringRef, 'OfferingRef'),
      businessId,
      currentRevision: offering.revision,
      status: 'published',
      createdAt: NOW,
      updatedAt: NOW,
    })),
    businessOfferingRevisions: catalog.offerings.map((offering) => {
      const offeringRef = brandNonEmpty(offering.offeringRef, 'OfferingRef')
      return {
        offeringRef,
        businessId,
        revision: offering.revision,
        name: offering.name,
        category: offering.category,
        summary: offering.summary,
        ...(offering.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: offering.serviceAreaSummary }),
        ...(offering.availabilitySummary === undefined ? {} : { availabilitySummary: offering.availabilitySummary }),
        ...(offering.pricingSummary === undefined ? {} : { pricingSummary: offering.pricingSummary }),
        sourceHash: canonicalDigest({ offeringRef, revision: offering.revision }),
        createdAt: NOW,
      }
    }),
    offeringAccessPaths: catalog.offerings.flatMap((offering) => {
      const offeringRef = brandNonEmpty(offering.offeringRef, 'OfferingRef')
      const offeringSourceHash = canonicalDigest({ offeringRef, revision: offering.revision })
      return offering.accessPaths.map((path) => ({
        accessPathRef: brandNonEmpty(path.accessPathRef, 'AccessPathRef'),
        businessId,
        offeringRef,
        offeringRevision: offering.revision,
        offeringSourceHash,
        status: 'published' as const,
        descriptor: path,
        sourceHash: canonicalDigest({
          accessPathRef: path.accessPathRef,
          offeringSourceHash,
          descriptor: path.kind === 'human_request'
            ? {
                kind: 'human_request',
                channel: path.channel,
                disclosure: path.disclosure,
                ...(path.url === undefined ? {} : { url: path.url }),
              }
            : path,
        }),
        createdAt: NOW,
        updatedAt: NOW,
      }))
    }),
    owners: [
      {
        ownerId: DEMO_OWNER_ID,
        clerkUserId: 'clerk:owner-demo',
        displayName: 'Demo Plumbing Owner',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    claims: [
      {
        claimId: DEMO_CLAIM_ID,
        ownerId: DEMO_OWNER_ID,
        businessId,
        slug,
        status: 'published',
        submittedFactsHash: canonicalDigest({ claimId: DEMO_CLAIM_ID }),
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    resolvableOwnerRecipients: [
      {
        ownerId: DEMO_OWNER_ID,
        recipientRef: 'email:owner@demo-plumbing.example.test',
        resolvedAt: NOW,
      },
    ],
    capabilityLaunchSupportRecords: [inquirySupportRecord()],
  })
}

function inquirySupportRecord(): CapabilityLaunchSupportRecord {
  return {
    capability: 'human_inquiry_owner_inbox',
    primaryOwnerRef: 'owner:demo',
    primaryAdminOperatorRef: 'admin:demo-primary',
    backupOwnerRef: 'owner:demo-backup',
    backupAdminOperatorRef: 'admin:demo-backup',
    supportedStage: 'manual_support',
    supportedChannels: ['public_inquiry'],
    capacityThreshold: { maxOpenThreads: 10, maxFailedNotifications: 2 },
    backlogAgeThresholdMs: 86_400_000,
    phaseIncidentCounts: {
      retryExhausted: 0,
      noRepair: 0,
      unresolvedDeliveryFailures: 0,
      abuseBlocked: 0,
      privacyDeletes: 0,
    },
    supportEscalationPath: 'Demo inquiry support queue.',
    claimDisablePath: 'Disable the published Offering inquiry access path.',
    perChannelKillRules: [
      {
        channel: 'public_claim',
        trigger: 'Inquiry admission becomes unavailable.',
        action: 'Hide inquiry availability.',
      },
    ],
    evidenceRefs: ['tests/unit/inquiries/inquiry-prefill.test.ts'],
    sourceHash: canonicalDigest({ support: 'demo-inquiry' }),
    correlationId: brandNonEmpty('correlation:demo-inquiry', 'CorrelationId'),
    lastReviewedAt: NOW,
  }
}

describe('buildPublicInquiryAffordance Offering preselection', () => {
  it('resolves the first inquiry-ready Offering from canonical admission by default', () => {
    const catalog = twoOfferingCatalog()
    const target = selectPublicInquiryTarget(catalog)
    if (target === undefined) throw new Error('Expected an inquiry target.')
    const admission = inquiries.evaluateR1TargetAdmission(admittedInquiryState(catalog), target)
    expect(buildPublicInquiryAffordance(catalog, undefined, admission)).toMatchObject({
      kind: 'available',
      offeringName: 'Emergency plumbing',
      target: { offeringRef: 'offering:emergency-plumbing' },
    })
  })

  it('preselects a published Offering when the route names it', () => {
    const catalog = twoOfferingCatalog()
    const preferredOfferingRef = catalog.offerings[1]?.offeringRef
    if (preferredOfferingRef === undefined) throw new Error('Expected a second Offering.')
    expect(buildPublicInquiryAffordance(
      catalog,
      brandNonEmpty(preferredOfferingRef, 'OfferingRef'),
      admittedInquiryState(catalog),
    )).toMatchObject({
      offeringName: 'Blocked drains',
      target: { offeringRef: 'offering:blocked-drains' },
    })
  })

  it('falls back to the first inquiry-ready Offering when the preselect is unknown', () => {
    const catalog = twoOfferingCatalog()
    expect(buildPublicInquiryAffordance(catalog, brandNonEmpty('offering:does-not-exist', 'OfferingRef'), admittedInquiryState(catalog))).toMatchObject({
      kind: 'available',
      offeringName: 'Emergency plumbing',
    })
  })
})

describe('inquiry route validateSearch', () => {
  const validate = validateInquirySearch

  it('keeps declared prefill params and drops everything else', () => {
    expect(
      validate({
        from: 'thread',
        id: 't1',
        draft: 'Leaking tap under the sink',
        offeringRef: 'offering:emergency-plumbing',
        evil: 'x',
      }),
    ).toEqual({ from: 'thread', id: 't1', draft: 'Leaking tap under the sink' })
  })

  it('caps the draft and drops malformed from/id', () => {
    const result = validate({ from: 'nope', id: '   ', draft: 'a'.repeat(MAX_INQUIRY_DRAFT_CHARS + 300), offeringRef: 'offering:emergency-plumbing' })
    expect(result.from).toBeUndefined()
    expect(result.id).toBeUndefined()
    expect(result.draft).toHaveLength(MAX_INQUIRY_DRAFT_CHARS)
  })

  it('authors no duplicate, success, or result state from the url', () => {
    const result = validate({ draft: 'Leaking tap', submitted: true, threadId: 'abc', receipt: 'r', kind: 'ok' })
    expect(Object.keys(result).sort()).toEqual(['draft'])
  })
})
