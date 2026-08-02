import { describe, expect, it } from 'vitest'

import type { PublicBusinessCatalogApiV2Page } from '@/modules/registry/public'
import { projectPublicServicesPage, toConsumerSupplyOption } from '@/modules/registry/public'
import { isOpenSandboxEndpoint } from '@/modules/sandbox-supply/public'

describe('public services API projection', () => {
  it('flattens each offering and classifies open and external endpoints', () => {
    const result = projectPublicServicesPage(page())

    expect(result.services).toHaveLength(2)
    expect(result.services[0]).toMatchObject({
      id: 'offering-open',
      revision: 3,
      business: {
        slug: 'acme-plumbing',
        name: 'Acme Plumbing',
        suburb: 'Fremantle',
        stateTerritory: 'WA',
      },
      category: 'plumbing',
      summary: 'A rapid plumbing checkup.',
      price: { kind: 'fixed', currency: 'AUD', amountMinor: 8000, unit: 'job', taxTreatment: 'inclusive' },
      endpoints: [
        {
          url: '/api/sandbox/acme-plumbing/checkup-quote',
          access: 'open',
        },
        {
          url: 'https://provider.example/operations/emergency-checkup',
          access: 'external',
        },
      ],
      links: {
        business: '/api/businesses/acme-plumbing',
        manifest: '/acme-plumbing/ucp',
      },
    })
    expect(result.services[1]).toMatchObject({ id: 'offering-empty', endpoints: [] })
  })

  it('carries exact published availability and observation into the consumer supply adapter', () => {
    const result = toConsumerSupplyOption(projectPublicServicesPage(page()).services[0]!)

    expect(result).toMatchObject({
      optionRef: 'offering-open',
      availability: { kind: 'published', summary: 'Weekdays by appointment' },
      evidence: { source: 'ae_sandbox', observedAt: 1_700_000_000_001 },
    })
  })

  it('passes source cursor state through', () => {
    const source = page()
    const result = projectPublicServicesPage(source)

    expect(result).toMatchObject({
      kind: 'ok',
      schemaVersion: 'public-services-api:v1',
      isDone: false,
      continueCursor: 'cursor-out',
    })
    expect(result.isDone).toBe(source.isDone)
    expect(result.continueCursor).toBe(source.continueCursor)
  })

  it('opens only the exact keyless POST quote path', () => {
    const path = '/api/sandbox/acme-plumbing/checkup-quote'
    expect(isOpenSandboxEndpoint(`https://other.example${path}`, 'acme-plumbing')).toBe(true)
    expect(isOpenSandboxEndpoint(path, 'acme-plumbing', 'POST')).toBe(true)
    expect(isOpenSandboxEndpoint(path, 'acme-plumbing', 'GET')).toBe(false)
    expect(isOpenSandboxEndpoint(`${path}?source=catalog`, 'acme-plumbing')).toBe(false)
    expect(isOpenSandboxEndpoint(`${path}#fragment`, 'acme-plumbing')).toBe(false)
    expect(isOpenSandboxEndpoint(`https://user:pass@other.example${path}`, 'acme-plumbing')).toBe(false)
  })
})

function page(): PublicBusinessCatalogApiV2Page {
  return {
    kind: 'ok',
    schemaVersion: 'public-business-catalog-api:v2',
    page: [
      {
        schemaVersion: 'public-business-catalog-api:v2',
        businessId: 'business-acme',
        slug: 'acme-plumbing',
        name: 'Acme Plumbing',
        category: 'plumbing',
        suburb: 'Fremantle',
        stateTerritory: 'WA',
        publicUrl: 'https://acme.example',
        trustTier: 'listed',
        photos: [],
        observedAt: 1_700_000_000_000,
        disposition: 'current',
        offerings: [
          {
            offeringRef: 'offering-open',
            revision: 3,
            name: 'Emergency checkup',
            category: 'plumbing',
            summary: 'A rapid plumbing checkup.',
            availabilitySummary: 'Weekdays by appointment',
            pricingSummary: 'From $80',
            price: {
              kind: 'fixed',
              currency: 'AUD',
              amountMinor: 8000,
              unit: 'job',
              taxTreatment: 'inclusive',
            },
            accessPaths: [
              {
                accessPathRef: 'path-open',
                kind: 'external_operation',
                name: 'Get a checkup quote',
                summary: 'Returns a sandbox quote.',
                url: 'https://another-origin.example/api/sandbox/acme-plumbing/checkup-quote',
                method: 'POST',
                authenticationSummary: 'No API key required in the sandbox.',
                provenance: 'business_declared',
              },
              {
                accessPathRef: 'path-external',
                kind: 'external_operation',
                name: 'Provider operation',
                summary: 'Provider-owned operation.',
                url: 'https://provider.example/operations/emergency-checkup',
                method: 'POST',
                provenance: 'publicly_observed',
              },
              {
                accessPathRef: 'path-human',
                kind: 'human_request',
                channel: 'website',
                disclosure: 'Use the website.',
              },
            ],
            support: { integrated: false, aeSupportedAction: false, observedAt: 1_700_000_000_001 },
          },
          {
            offeringRef: 'offering-empty',
            revision: 1,
            name: 'Inspection',
            category: 'plumbing',
            summary: 'An inspection by request.',
            accessPaths: [],
            support: { integrated: false, aeSupportedAction: false },
          },
        ],
        accessSummary: { humanRequest: true, externalOperation: true, aeSupportedAction: false },
      },
    ],
    isDone: false,
    continueCursor: 'cursor-out',
  }
}
