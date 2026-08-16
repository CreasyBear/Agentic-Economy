import { beforeEach, describe, expect, it } from 'vitest'

import {
  publicOwnerDefaultClaimInput,
  resetPublicOwnerRouteReadbacksForTest,
  submitDurablePublicOwnerClaimFlow,
  validatePublicOwnerClaimFlowInput,
} from '@/modules/catalog/public'
import {
  getPublicBusinessPageReadback,
  getPublicOwnerStatusReadbackBySlug,
} from '../helpers/owner-default-claim'

describe('durable public owner claim route readbacks', () => {
  beforeEach(() => {
    resetPublicOwnerRouteReadbacksForTest()
  })

  it('uses the submitted no-ABN catalog for success, owner status, and public page readback', () => {
    const customInput = {
      ...publicOwnerDefaultClaimInput,
      businessName: 'Fremantle Priority Electrical',
      category: 'Emergency electrical',
      businessContext: {
        kind: 'local_human' as const,
        suburb: 'Fremantle',
        stateTerritory: 'WA',
      },
      requestedSlug: 'fremantle-priority-electrical',
      ownerMessage: 'Owner supplied switchboard repair facts for the public service page.',
      sourceLabel: 'Owner supplied electrical service facts',
      serviceName: 'After-hours switchboard repair',
      serviceCategory: 'Emergency electrical',
      serviceSummary: 'Urgent switchboard fault triage for Fremantle homes and shops.',
      serviceArea: 'Fremantle, South Fremantle, and Beaconsfield',
      hoursOrUnknown: 'After-hours availability supplied by owner',
      publicDisclosure: 'This business has not published a request path.',
      noContactReason: 'Owner has not supplied a public contact path yet.',
    }

    const result = submitDurablePublicOwnerClaimFlow(customInput)
    if (result.kind !== 'ok') {
      throw new Error(`Expected durable owner claim to publish, got ${result.kind}.`)
    }

    expect(result).toMatchObject({
      kind: 'ok',
      catalog: {
        slug: 'fremantle-priority-electrical',
        name: 'Fremantle Priority Electrical',
        category: 'Emergency electrical',
        businessContext: {
          kind: 'local_human',
          suburb: 'Fremantle',
          stateTerritory: 'WA',
        },
        offerings: [
          {
            name: 'After-hours switchboard repair',
            category: 'Emergency electrical',
            serviceAreaSummary: 'Fremantle, South Fremantle, and Beaconsfield',
            accessPaths: [],
            support: { integrated: false, aeSupportedAction: false },
          },
        ],
      },
    })

    const status = getPublicOwnerStatusReadbackBySlug(result.catalog, 'fremantle-priority-electrical')
    expect(status).toMatchObject({
      catalog: {
        slug: 'fremantle-priority-electrical',
        name: 'Fremantle Priority Electrical',
        offerings: [{ summary: 'Urgent switchboard fault triage for Fremantle homes and shops.' }],
      },
    })
    expect(status?.catalog.name).not.toBe(publicOwnerDefaultClaimInput.businessName)

    const page = getPublicBusinessPageReadback(result.catalog, 'fremantle-priority-electrical')
    expect(page).toMatchObject({
      kind: 'available',
      catalog: {
        name: 'Fremantle Priority Electrical',
        offerings: [{ category: 'Emergency electrical' }],
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
