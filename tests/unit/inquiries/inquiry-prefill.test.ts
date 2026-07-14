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
import { stableHash } from '@/modules/common/stable-hash'
import * as inquiries from '@/modules/inquiries/public'
import type { CapabilityLaunchSupportRecord, InquirySourceState } from '@/modules/inquiries/public'
import type { PublicRouteCatalogContract, PublicRouteServiceContract } from '@/modules/catalog/public'

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
  it('carries a sanitized draft and preselected service', () => {
    expect(
      buildInquiryPrefillHref({ slug: 'plumbing-demo', draft: 'Leaking tap', service: 'emergency-plumbing' }),
    ).toBe('/plumbing-demo/inquiry?draft=Leaking%20tap&service=emergency-plumbing')
  })

  it('keeps the base path when there is nothing usable to carry', () => {
    expect(buildInquiryPrefillHref({ slug: 'plumbing-demo' })).toBe('/plumbing-demo/inquiry')
    expect(buildInquiryPrefillHref({ slug: 'plumbing-demo', draft: '   ', service: 'Bad Slug' })).toBe(
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

function inquiryService(slug: string, name: string): PublicRouteServiceContract {
  const serviceId = brandNonEmpty(`service:${slug}`, 'ServiceId')
  return {
    serviceId,
    serviceSlug: brandNonEmpty(slug, 'Slug'),
    businessId: DEMO_BUSINESS_ID,
    name,
    category: name,
    summary: `${name} triage.`,
    serviceArea: 'Parramatta',
    hoursOrUnknown: 'Hours supplied by owner',
    firstRequest: {
      mode: 'inquiry_available',
      publicChannel: 'public_business_contact',
      publicDisclosure: 'Use the source-owned inquiry form for a first contact.',
      rawContactExcluded: true,
    },
    status: 'published',
    capabilities: [
      {
        serviceId,
        kind: 'phone_inquiry',
        status: 'available',
        firstRequest: {
          mode: 'inquiry_available',
          publicChannel: 'public_business_contact',
          publicDisclosure: 'Use the source-owned inquiry form for a first contact.',
          rawContactExcluded: true,
        },
        callable: false,
        paymentRequired: false,
      },
    ],
  }
}

function twoServiceCatalog(): PublicRouteCatalogContract {
  return {
    businessId: DEMO_BUSINESS_ID,
    slug: brandNonEmpty('plumbing-demo', 'Slug'),
    name: 'Demo Plumbing',
    category: 'Plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicUrl: '/plumbing-demo',
    publicStatus: 'published',
    trustTier: 'contact_confirmed',
    indexStatus: 'queued',
    discoveryStatus: 'degraded',
    schemaVersion: 'public-catalog:v1',
    updatedAt: 1_900_000_000_000,
    photos: [],
    services: [inquiryService('emergency-plumbing', 'Emergency plumbing'), inquiryService('blocked-drains', 'Blocked drains')],
  }
}

function admittedInquiryState(catalog: PublicRouteCatalogContract): InquirySourceState {
  return inquiries.createEmptyInquirySourceState({
    businesses: [
      {
        businessId: catalog.businessId,
        ownerId: DEMO_OWNER_ID,
        slug: catalog.slug,
        name: catalog.name,
        normalizedName: catalog.name.toLowerCase(),
        category: catalog.category,
        suburb: catalog.suburb,
        stateTerritory: catalog.stateTerritory,
        publicStatus: 'published',
        trustTier: catalog.trustTier,
        claimStatus: 'published',
        sourceHash: stableHash({ businessId: catalog.businessId }),
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    businessServices: catalog.services.map((service, sortOrder) => ({
      serviceId: service.serviceId,
      serviceSlug: service.serviceSlug,
      businessId: catalog.businessId,
      name: service.name,
      category: service.category,
      summary: service.summary,
      serviceArea: service.serviceArea,
      hoursOrUnknown: service.hoursOrUnknown,
      status: service.status,
      sortOrder,
      sourceHash: stableHash({ serviceId: service.serviceId }),
      createdAt: NOW,
      updatedAt: NOW,
    })),
    serviceCapabilities: catalog.services.flatMap((service) => service.capabilities.map((capability) => ({
      businessId: catalog.businessId,
      serviceId: service.serviceId,
      kind: capability.kind,
      status: capability.status,
      firstRequest: capability.firstRequest,
      callable: capability.callable,
      paymentRequired: capability.paymentRequired,
      sourceHash: stableHash({ serviceId: service.serviceId, capability: capability.kind }),
      createdAt: NOW,
      updatedAt: NOW,
      ...(capability.reason === undefined ? {} : { reason: capability.reason }),
    }))),
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
        businessId: catalog.businessId,
        slug: catalog.slug,
        status: 'published',
        submittedFactsHash: stableHash({ claimId: DEMO_CLAIM_ID }),
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
    claimDisablePath: 'Disable the demo inquiry capability.',
    perChannelKillRules: [
      {
        channel: 'public_claim',
        trigger: 'Inquiry admission becomes unavailable.',
        action: 'Hide inquiry availability.',
      },
    ],
    evidenceRefs: ['tests/unit/inquiries/inquiry-prefill.test.ts'],
    sourceHash: stableHash({ support: 'demo-inquiry' }),
    correlationId: brandNonEmpty('correlation:demo-inquiry', 'CorrelationId'),
    lastReviewedAt: NOW,
  }
}

describe('buildPublicInquiryAffordance service preselection', () => {
  it('resolves the first inquiry-ready service from canonical admission by default', () => {
    const catalog = twoServiceCatalog()
    const target = selectPublicInquiryTarget(catalog)
    if (target === undefined) throw new Error('Expected an inquiry target.')
    const admission = inquiries.evaluateR1TargetAdmission(admittedInquiryState(catalog), target)
    expect(buildPublicInquiryAffordance(catalog, undefined, admission)).toMatchObject({
      kind: 'available',
      serviceName: 'Emergency plumbing',
      target: { serviceId: 'service:emergency-plumbing' },
    })
  })

  it('preselects a published service when the prefill names it', () => {
    const catalog = twoServiceCatalog()
    expect(buildPublicInquiryAffordance(catalog, 'blocked-drains', admittedInquiryState(catalog))).toMatchObject({
      kind: 'available',
      serviceName: 'Blocked drains',
      target: { serviceId: 'service:blocked-drains' },
    })
  })

  it('falls back to the first inquiry-ready service when the preselect is unknown', () => {
    const catalog = twoServiceCatalog()
    expect(buildPublicInquiryAffordance(catalog, 'does-not-exist', admittedInquiryState(catalog))).toMatchObject({
      kind: 'available',
      serviceName: 'Emergency plumbing',
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
        service: 'emergency-plumbing',
        evil: 'x',
      }),
    ).toEqual({ from: 'thread', id: 't1', draft: 'Leaking tap under the sink', service: 'emergency-plumbing' })
  })

  it('caps the draft and drops malformed from/id/service', () => {
    const result = validate({ from: 'nope', id: '   ', draft: 'a'.repeat(MAX_INQUIRY_DRAFT_CHARS + 300), service: 'Bad Slug' })
    expect(result.from).toBeUndefined()
    expect(result.id).toBeUndefined()
    expect(result.service).toBeUndefined()
    expect(result.draft).toHaveLength(MAX_INQUIRY_DRAFT_CHARS)
  })

  it('authors no duplicate, success, or result state from the url', () => {
    const result = validate({ draft: 'Leaking tap', submitted: true, threadId: 'abc', receipt: 'r', kind: 'ok' })
    expect(Object.keys(result).sort()).toEqual(['draft'])
  })
})
