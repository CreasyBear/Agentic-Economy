import { describe, expect, it } from 'vitest'

import {
  publicOwnerDefaultClaimInput,
  submitPublicOwnerClaimFlow,
  validatePublicOwnerClaimFlowInput,
} from '@/modules/catalog/public'
import {
  confirmStorefrontImportDraft,
  extractStorefrontDraftFromHtml,
} from '@/modules/storefront/public'
import {
  getDefaultPublicOwnerStatusReadback,
  getPublicBusinessPageReadback,
} from '../../helpers/owner-default-claim'

describe('public owner claim flow', () => {
  it('publishes the Sam service page from browser-safe facts only', () => {
    const result = submitPublicOwnerClaimFlow(publicOwnerDefaultClaimInput)

    expect(result).toMatchObject({
      kind: 'ok',
      catalog: {
        slug: 'parramatta-emergency-plumbing',
        businessContext: {
          kind: 'local_human',
          suburb: 'Parramatta',
          stateTerritory: 'NSW',
        },
        offerings: [
          {
            name: 'Emergency pipe repair',
            category: 'Emergency plumbing',
            summary: 'Burst pipe triage and repair for urgent local plumbing jobs.',
            serviceAreaSummary: 'Parramatta and nearby suburbs',
            accessPaths: [],
            support: { integrated: false, aeSupportedAction: false },
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
        { field: 'noContactReason', message: 'Explain why no request path is published.' },
      ],
    })
    expect(input.serviceName).toBe(publicOwnerDefaultClaimInput.serviceName)
  })

  it('trims and publishes an owner-entered Australian phone, and rejects invalid shapes', () => {
    const published = submitPublicOwnerClaimFlow({
      ...publicOwnerDefaultClaimInput,
      businessContext: {
        ...publicOwnerDefaultClaimInput.businessContext,
        publishedPhone: '  +61 412 345 678  ',
      },
    })

    expect(published).toMatchObject({
      kind: 'ok',
      catalog: { businessContext: { publishedPhone: '+61 412 345 678' } },
    })

    expect(validatePublicOwnerClaimFlowInput({
      ...publicOwnerDefaultClaimInput,
      businessContext: {
        ...publicOwnerDefaultClaimInput.businessContext,
        publishedPhone: 'owner@example.test',
      },
    })).toEqual({
      kind: 'invalid',
      errors: [{ field: 'businessContext', message: 'Enter a valid Australian phone number.' }],
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
      businessContext: {
        kind: 'local_human',
        suburb: 'Preston',
        stateTerritory: 'VIC',
      },
      serviceArea: 'Preston and nearby suburbs',
      hoursOrUnknown: 'Owner confirmed hours are not listed yet',
      noContactReason: 'Owner has not supplied public contact instructions.',
    })

    expect(result).toMatchObject({
      kind: 'ok',
      catalog: {
        slug: 'northside-plumbing',
        offerings: [
          {
            name: 'Hot water repairs',
            category: 'Plumbing',
            summary: 'Hot water repairs for local homes.',
            serviceAreaSummary: 'Preston and nearby suburbs',
            accessPaths: [],
            support: { integrated: false, aeSupportedAction: false },
          },
        ],
      },
    })
  })


  it('serves the default public page by slug and reports unknown slugs as no such business', () => {
    const readback = getDefaultPublicOwnerStatusReadback()
    expect(readback.catalog.name).toBe('Parramatta Emergency Plumbing')
    expect(getPublicBusinessPageReadback(readback.catalog, 'parramatta-emergency-plumbing')).toMatchObject({ kind: 'available' })
    expect(getPublicBusinessPageReadback(readback.catalog, 'unknown-service')).toEqual({ kind: 'not_found', reason: 'no_such_business' })
  })
})
