import { describe, expect, it } from 'vitest'

import { buildAnswerInquiryHref } from '@/modules/answer/public'
import {
  MAX_INQUIRY_DRAFT_CHARS,
  buildInquiryPrefillHref,
  sanitizeInquiryDraft,
  sanitizeInquirySlug,
  validateInquirySearch,
} from '@/modules/inquiries/inquiry-prefill'
import { buildPublicInquiryAffordance } from '@/modules/inquiries/route-readbacks'
import { brandNonEmpty } from '@/modules/common/ids'
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

describe('buildPublicInquiryAffordance service preselection', () => {
  it('resolves the first inquiry-ready service by default', () => {
    expect(buildPublicInquiryAffordance(twoServiceCatalog())).toMatchObject({
      kind: 'available',
      serviceName: 'Emergency plumbing',
      target: { serviceId: 'service:emergency-plumbing' },
    })
  })

  it('preselects a published service when the prefill names it', () => {
    expect(buildPublicInquiryAffordance(twoServiceCatalog(), 'blocked-drains')).toMatchObject({
      kind: 'available',
      serviceName: 'Blocked drains',
      target: { serviceId: 'service:blocked-drains' },
    })
  })

  it('falls back to the first inquiry-ready service when the preselect is unknown', () => {
    expect(buildPublicInquiryAffordance(twoServiceCatalog(), 'does-not-exist')).toMatchObject({
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
