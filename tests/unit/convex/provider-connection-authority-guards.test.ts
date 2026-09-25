import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createProviderConnection } from '@/modules/capability-supply/provider-connection'
import {
  toDomain,
  type ProviderConnectionAuthorityCompatibilityRow,
} from '../../../convex/lib/capabilitySupply/providerConnections/codecs'

const RESOURCE_URL = 'https://api.example.test/x402'
const BUSINESS_ID = 'business_facilitator_discovery'
const IDENTITY_DIGEST = canonicalDigest({ businessId: BUSINESS_ID, resourceUrl: RESOURCE_URL })

function legacyRow() {
  return {
    _id: 'provider_connection_legacy',
    _creationTime: 1,
    connectionRef: `connection:x402:${IDENTITY_DIGEST}`,
    businessId: BUSINESS_ID,
    providerRef: 'provider:x402:api.example.test',
    providerAccountRef: `x402:${RESOURCE_URL}`,
    adapterId: 'x402-fetch:v2',
    credentialRef: null,
    grantedScopes: [],
    grantedResources: [RESOURCE_URL],
    authorityGeneration: 1,
    authorityDigest: canonicalDigest('legacy-authority-shape'),
    lifecycle: 'active' as const,
    observedAt: 1,
    evidenceRefs: ['source:facilitator-discovery'],
    createdAt: 1,
    updatedAt: 1,
    lastCommandId: `facilitator-discovery:connection:${IDENTITY_DIGEST.slice(7)}`,
    lastCommandDigest: canonicalDigest('legacy-command'),
  }
}

describe('provider connection authority guards', () => {

  it('fails closed when a legacy row reaches the domain codec', () => {
    expect(() => toDomain(
      legacyRow() as unknown as ProviderConnectionAuthorityCompatibilityRow,
    )).toThrowError('provider_connection_authority_provenance_missing')
  })

  it('keeps the command model strict for all new writes', () => {
    const result = createProviderConnection({
      commandId: 'command:missing-authority',
      connectionRef: 'connection:new',
      businessId: BUSINESS_ID,
      providerRef: 'provider:new',
      providerAccountRef: 'provider-account:new',
      adapterId: 'adapter:new',
      credentialRef: null,
      requestedScopes: [],
      grantedScopes: [],
      requestedResources: [],
      grantedResources: [],
      evidenceRefs: [],
    } as never, 1)

    expect(result).toEqual({ kind: 'refused', code: 'invalid_identity' })
  })
})
