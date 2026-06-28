import { beforeEach, describe, expect, it } from 'vitest'

import {
  getPublicBusinessPageReadback,
  getPublicOwnerStatusReadbackBySlug,
  publicOwnerDefaultClaimInput,
  resetPublicOwnerRouteReadbacksForTest,
  submitDurablePublicOwnerClaimFlow,
  validatePublicOwnerClaimFlowInput,
} from '@/modules/catalog/public'

describe('durable public owner claim route readbacks', () => {
  beforeEach(() => {
    resetPublicOwnerRouteReadbacksForTest()
  })

  it('uses the submitted no-ABN catalog for success, owner status, and public page readback', () => {
    const customInput = {
      ...publicOwnerDefaultClaimInput,
      businessName: 'Fremantle Priority Electrical',
      category: 'Emergency electrical',
      suburb: 'Fremantle',
      stateTerritory: 'WA',
      requestedSlug: 'fremantle-priority-electrical',
      ownerMessage: 'Owner supplied switchboard repair facts for the public service page.',
      sourceLabel: 'Owner supplied electrical service facts',
      serviceName: 'After-hours switchboard repair',
      serviceCategory: 'Emergency electrical',
      serviceSummary: 'Urgent switchboard fault triage for Fremantle homes and shops.',
      serviceArea: 'Fremantle, South Fremantle, and Beaconsfield',
      hoursOrUnknown: 'After-hours availability supplied by owner',
      publicDisclosure: 'First request instructions are not available yet.',
      noContactReason: 'Owner has not supplied a public contact path yet.',
    }

    const result = submitDurablePublicOwnerClaimFlow(customInput)

    expect(result).toMatchObject({
      kind: 'ok',
      catalog: {
        slug: 'fremantle-priority-electrical',
        name: 'Fremantle Priority Electrical',
        category: 'Emergency electrical',
        suburb: 'Fremantle',
        stateTerritory: 'WA',
        services: [
          {
            name: 'After-hours switchboard repair',
            category: 'Emergency electrical',
            serviceArea: 'Fremantle, South Fremantle, and Beaconsfield',
            firstRequest: {
              mode: 'not_available_yet',
              noContactReason: 'Owner has not supplied a public contact path yet.',
            },
            capabilities: [{ status: 'unavailable' }],
          },
        ],
      },
    })

    const status = getPublicOwnerStatusReadbackBySlug('fremantle-priority-electrical')
    expect(status).toMatchObject({
      catalog: {
        slug: 'fremantle-priority-electrical',
        name: 'Fremantle Priority Electrical',
        services: [{ summary: 'Urgent switchboard fault triage for Fremantle homes and shops.' }],
      },
    })
    expect(status?.catalog.name).not.toBe(publicOwnerDefaultClaimInput.businessName)

    const page = getPublicBusinessPageReadback('fremantle-priority-electrical')
    expect(page).toMatchObject({
      kind: 'available',
      catalog: {
        name: 'Fremantle Priority Electrical',
        services: [{ category: 'Emergency electrical' }],
      },
    })
  })

  it('keeps validation failures typed before route submission reaches durable writes', () => {
    const emptyService = validatePublicOwnerClaimFlowInput({
      ...publicOwnerDefaultClaimInput,
      serviceName: '',
    })

    expect(emptyService).toEqual({
      kind: 'invalid',
      errors: [{ field: 'serviceName', message: 'Service name is required.' }],
    })
  })
})
