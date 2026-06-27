import { describe, expect, it } from 'vitest'

import { validateServiceCatalogInput } from '@/modules/catalog/public'

describe('service catalog validation', () => {
  it('requires at least one valid service', () => {
    expect(validateServiceCatalogInput([])).toEqual({ kind: 'invalid', reason: 'empty_services' })
    expect(
      validateServiceCatalogInput([
        {
          name: '',
          category: 'Emergency plumbing',
          summary: 'Burst pipe repairs.',
          serviceArea: 'Parramatta',
          hoursOrUnknown: 'Hours unknown',
          firstRequest: {
            mode: 'not_available_yet',
            publicChannel: 'not_available',
            noContactReason: 'Owner has not supplied public contact instructions.',
          },
        },
      ])
    ).toEqual({ kind: 'invalid', reason: 'invalid_service' })
  })

  it('excludes raw contact values from public first-request disclosure', () => {
    const result = validateServiceCatalogInput([
      {
        name: 'Emergency pipe repair',
        category: 'Emergency plumbing',
        summary: 'Burst pipe triage and repair.',
        serviceArea: 'Parramatta and nearby suburbs',
        hoursOrUnknown: 'Hours supplied by owner',
        firstRequest: {
          mode: 'inquiry_available',
          publicChannel: 'public_business_contact',
          publicDisclosure: 'Use the public business contact listed on the catalog.',
          rawContactValue: 'sam-owner@example.test',
        },
      },
    ])

    expect(result).toMatchObject({
      kind: 'valid',
      services: [
        {
          firstRequest: {
            mode: 'inquiry_available',
            publicChannel: 'public_business_contact',
            rawContactExcluded: true,
          },
        },
      ],
    })
    expect(JSON.stringify(result)).not.toContain('sam-owner@example.test')
  })

  it('requires unavailable first-request modes to carry public reasons', () => {
    expect(
      validateServiceCatalogInput([
        {
          name: 'Emergency pipe repair',
          category: 'Emergency plumbing',
          summary: 'Burst pipe triage and repair.',
          serviceArea: 'Parramatta and nearby suburbs',
          hoursOrUnknown: 'Hours supplied by owner',
          firstRequest: {
            mode: 'not_available_yet',
            publicChannel: 'not_available',
            noContactReason: '',
          },
        },
      ])
    ).toEqual({ kind: 'invalid', reason: 'invalid_first_request' })
  })
})
