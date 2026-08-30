import { describe, expect, it } from 'vitest'
import type { Doc } from '../../../convex/_generated/dataModel'
import {
  ownerSupplyAuthority,
  ownerSupplyPublicationDetails,
} from '../../../convex/capabilitySupplyOwnerFunnelProjection/offering_projection'

describe('owner supply funnel projection', () => {
  it('retains the exact bound connection reference independently of provider host identity', () => {
    const connectionRef = 'connection:exact'
    const providerRef = 'provider:shared-host'
    const publication = {
      disposition: 'current',
      publicationRef: 'publication:one',
      revision: 1,
      operationRef: 'operation:one',
      authorityMode: 'provider_owned',
      capabilityId: 'weather.lookup',
      version: 1,
      contractDigest: 'sha256:contract',
      sourceKind: 'openapi_http',
      sourceSelector: { path: '/weather', method: 'get' },
      sourceRevision: 'source:one',
      sourceDigest: 'sha256:source',
      connectionAuthority: {
        connectionRef,
        providerRef,
        authorityGeneration: 4,
        authorityDigest: 'sha256:authority',
      },
    } as unknown as Doc<'capabilityPublications'>
    const binding = {
      bindingId: 'binding:one',
      registrationHash: 'sha256:binding',
      endpointUrl: 'https://provider.example/weather',
      adapterId: 'http-json:v1',
      admission: 'admitted',
      conformance: 'conformant',
      authority: { kind: 'provider_connection', connectionRef, providerRef },
    } as unknown as Doc<'capabilityTransportBindings'>
    const details = ownerSupplyPublicationDetails({
      publication,
      binding,
      pricing: undefined,
      lifecycle: { state: 'inactive', reasons: ['health_unobserved'] },
      readiness: { outcome: 'unobserved', evidenceRefs: [] },
    })

    expect(details?.binding.authority).toEqual({
      kind: 'provider_connection',
      connectionRef,
      providerRef,
    })
    expect(ownerSupplyAuthority(details)).toMatchObject({
      kind: 'provider_connection',
      connectionRef,
      providerRef,
    })
  })
})
