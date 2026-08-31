import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  FACILITATOR_DISCOVERY_PUBLISHER_REF,
} from '@/modules/capability-supply/convex'
import {
  createProviderConnection,
  providerConnectionAuthorityDigest,
} from '@/modules/capability-supply/provider-connection'
import {
  decideProviderConnectionAuthorityMigration,
} from '../../../convex/capabilityProviderConnectionMigration'
import {
  toDomain,
  type ProviderConnectionAuthorityCompatibilityRow,
} from '../../../convex/lib/providerConnections/codecs'

const RESOURCE_URL = 'https://api.example.test/x402'
const BUSINESS_ID = 'business_facilitator_discovery'
const IDENTITY_DIGEST = canonicalDigest({ businessId: BUSINESS_ID, resourceUrl: RESOURCE_URL })

function business() {
  return {
    _id: BUSINESS_ID,
    _creationTime: 1,
    owningAccountRef: 'acc_facilitator_provider',
    slug: 'x402-api-example-test',
    name: 'x402 api.example.test',
    normalizedName: 'x402 api.example.test',
    category: 'programmable provider',
    businessContext: {
      kind: 'programmable_provider' as const,
      website: 'https://api.example.test',
      providerIdentifier: 'provider:x402:api.example.test',
    },
    publicStatus: 'published' as const,
    trustTier: 'registry_verified' as const,
    sourceHash: canonicalDigest('facilitator-discovery-business'),
    createdAt: 1,
    updatedAt: 1,
  }
}

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

function migrationInput(row: unknown) {
  return row as unknown as Parameters<typeof decideProviderConnectionAuthorityMigration>[0]
}

function migrationBusiness() {
  return business() as unknown as NonNullable<Parameters<typeof decideProviderConnectionAuthorityMigration>[1]>
}

describe('provider connection authority migration', () => {
  it('backfills only the deterministic facilitator-discovery authority and recomputes its digest', () => {
    const row = legacyRow()
    const decision = decideProviderConnectionAuthorityMigration(migrationInput(row), migrationBusiness())

    expect(decision.kind).toBe('backfill')
    if (decision.kind !== 'backfill') throw new Error('expected backfill')
    expect(decision.patch).toMatchObject({
      owningAccountRef: 'acc_facilitator_provider',
      installedByPrincipalRef: FACILITATOR_DISCOVERY_PUBLISHER_REF,
      authorityGrantRef: `observed:${FACILITATOR_DISCOVERY_PUBLISHER_REF}`,
      authorityGrantGeneration: 1,
    })
    expect(decision.patch.authorityDigest).toBe(providerConnectionAuthorityDigest({
      ...row,
      ...decision.patch,
    }))
  })

  it('is idempotent after the authority fields are present', () => {
    const row = legacyRow()
    const first = decideProviderConnectionAuthorityMigration(migrationInput(row), migrationBusiness())
    if (first.kind !== 'backfill') throw new Error('expected backfill')
    const current = { ...row, ...first.patch }

    expect(decideProviderConnectionAuthorityMigration(
      migrationInput(current),
      migrationBusiness(),
    )).toEqual({ kind: 'current' })
  })

  it('blocks partial authority instead of filling around ambiguous data', () => {
    const partial = { ...legacyRow(), owningAccountRef: 'acc_unproven' }

    expect(decideProviderConnectionAuthorityMigration(
      migrationInput(partial),
      migrationBusiness(),
    )).toEqual({ kind: 'blocked', reason: 'partial_authority' })
  })

  it('blocks rows whose source label is not backed by the exact deterministic identity', () => {
    const forged = { ...legacyRow(), connectionRef: 'connection:x402:sha256:forged' }

    expect(decideProviderConnectionAuthorityMigration(
      migrationInput(forged),
      migrationBusiness(),
    )).toEqual({ kind: 'blocked', reason: 'legacy_provenance_unproven' })
  })

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
