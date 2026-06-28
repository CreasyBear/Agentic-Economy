import { describe, expect, it } from 'vitest'

import {
  getDefaultPublicOwnerStatusReadback,
  getPublicBusinessPageReadback,
  publicOwnerDefaultClaimInput,
  submitPublicOwnerClaimFlow,
  validatePublicOwnerClaimFlowInput,
} from '@/modules/catalog/public'

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

  it('serves the default public page by slug and hides unknown slugs', () => {
    expect(getDefaultPublicOwnerStatusReadback().catalog.name).toBe('Parramatta Emergency Plumbing')
    expect(getPublicBusinessPageReadback('parramatta-emergency-plumbing')).toMatchObject({ kind: 'available' })
    expect(getPublicBusinessPageReadback('unknown-service')).toEqual({ kind: 'not_found', reason: 'not_public' })
  })
})
