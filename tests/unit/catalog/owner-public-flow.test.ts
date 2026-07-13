import { describe, expect, it } from 'vitest'

import {
  getDefaultPublicOwnerStatusReadback,
  getPublicBusinessPageReadback,
  publicOwnerDefaultClaimInput,
  submitPublicOwnerClaimFlow,
  validatePublicOwnerClaimFlowInput,
} from '@/modules/catalog/public'
import {
  confirmStorefrontImportDraft,
  extractStorefrontDraftFromHtml,
} from '@/modules/storefront/public'

describe('public owner claim flow', () => {
  it('publishes the Sam service page from browser-safe facts only', () => {
    const result = submitPublicOwnerClaimFlow(publicOwnerDefaultClaimInput)

    expect(result).toMatchObject({
      kind: 'ok',
      catalog: {
        slug: 'parramatta-emergency-plumbing',
        stateTerritory: 'NSW',
        publicStatus: 'published',
        indexStatus: 'queued',
        discoveryStatus: 'degraded',
        services: [
          {
            firstRequest: {
              mode: 'not_available_yet',
              rawContactExcluded: true,
            },
            capabilities: [
              {
                status: 'unavailable',
                callable: false,
                paymentRequired: false,
              },
            ],
          },
        ],
      },
      readback: {
        publicUrl: '/parramatta-emergency-plumbing',
        noindex: true,
      },
    })
    expect(JSON.stringify(publicOwnerDefaultClaimInput)).not.toMatch(/actor|ownerId|adminId|clerk/i)
    expect(JSON.stringify(result)).not.toContain('source-owned-owner-session')
  })

  it('returns field errors without losing entered values', () => {
    const input = {
      ...publicOwnerDefaultClaimInput,
      businessName: '  ',
      noContactReason: ' ',
    }

    const validation = validatePublicOwnerClaimFlowInput(input)

    expect(validation).toEqual({
      kind: 'invalid',
      errors: [
        { field: 'businessName', message: 'Business name is required.' },
        { field: 'noContactReason', message: 'Explain why a first request is not available yet.' },
      ],
    })
    expect(input.serviceName).toBe(publicOwnerDefaultClaimInput.serviceName)
  })

  it('trims and publishes an owner-entered Australian phone, and rejects invalid shapes', () => {
    const published = submitPublicOwnerClaimFlow({
      ...publicOwnerDefaultClaimInput,
      publishedPhone: '  +61 412 345 678  ',
    })

    expect(published).toMatchObject({
      kind: 'ok',
      catalog: { publishedPhone: '+61 412 345 678' },
    })

    expect(validatePublicOwnerClaimFlowInput({
      ...publicOwnerDefaultClaimInput,
      publishedPhone: 'owner@example.test',
    })).toEqual({
      kind: 'invalid',
      errors: [{ field: 'publishedPhone', message: 'Enter a valid Australian phone number.' }],
    })
  })

  it('publishes a website import only after the owner confirms the reviewed draft', () => {
    const draftResult = extractStorefrontDraftFromHtml({
      websiteUrl: 'https://northside.example/',
      html: '<title>Northside Plumbing</title><meta name="description" content="Hot water repairs for local homes."><h1>Hot water repairs</h1>',
    })

    if (draftResult.kind !== 'ok') {
      throw new Error('Expected draft import to succeed.')
    }

    expect(confirmStorefrontImportDraft(draftResult.draft, false)).toMatchObject({
      kind: 'error',
      code: 'storefront_import_unconfirmed',
    })

    const confirmed = confirmStorefrontImportDraft(draftResult.draft, true)
    if (confirmed.kind !== 'confirmed') {
      throw new Error('Expected owner confirmation to produce claim input.')
    }

    const result = submitPublicOwnerClaimFlow({
      ...confirmed.input,
      suburb: 'Preston',
      stateTerritory: 'VIC',
      serviceArea: 'Preston and nearby suburbs',
      hoursOrUnknown: 'Owner confirmed hours are not listed yet',
      noContactReason: 'Owner has not supplied public contact instructions.',
    })

    expect(result).toMatchObject({
      kind: 'ok',
      catalog: {
        slug: 'northside-plumbing',
        publicStatus: 'published',
        services: [
          {
            name: 'Hot water repairs',
            firstRequest: {
              mode: 'not_available_yet',
              publicDisclosure: 'First request instructions are not available yet.',
            },
          },
        ],
      },
    })
  })

  it('serves the default public page by slug and hides unknown slugs', () => {
    expect(getDefaultPublicOwnerStatusReadback().catalog.name).toBe('Parramatta Emergency Plumbing')
    expect(getPublicBusinessPageReadback('parramatta-emergency-plumbing')).toMatchObject({ kind: 'available' })
    expect(getPublicBusinessPageReadback('unknown-service')).toEqual({ kind: 'not_found', reason: 'not_public' })
  })
})
