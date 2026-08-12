import { describe, expect, it } from 'vitest'

import {
  buildBusinessSupplyProjection,
  buildPublicOfferingSupplyProjection,
  validateOfferingAccessPath,
  type BusinessOfferingRecord,
  type BusinessOfferingRevisionRecord,
  type OfferingAccessPathRecord,
} from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'

const businessId = brandNonEmpty('business:meridian', 'BusinessId')
const offeringRef = brandNonEmpty('offering:meridian:subgraph-query', 'OfferingRef')
const offeringSourceHash = brandNonEmpty('sha256:offering-v2', 'SourceHash')

const offering: BusinessOfferingRecord = {
  offeringRef,
  businessId,
  currentRevision: 2,
  status: 'published',
  createdAt: 1,
  updatedAt: 2,
}

const revision: BusinessOfferingRevisionRecord = {
  offeringRef,
  businessId,
  revision: 2,
  name: 'Subgraph query',
  category: 'Blockchain data',
  summary: 'Query indexed blockchain data by subgraph.',
  pricingSummary: 'Usage priced per request.',
  sourceHash: offeringSourceHash,
  createdAt: 2,
}

describe('integrated Offering supply projection', () => {
  it('keeps a public business visible with zero Offerings', () => {
    const result = buildBusinessSupplyProjection({
      business: { businessId, slug: 'meridian-labs', name: 'Meridian Labs', category: 'Data', businessContext: { kind: 'local_human', suburb: 'Perth', stateTerritory: 'WA' }, publicUrl: '/meridian-labs', trustTier: 'claimed' },
      businessIsPublic: true,
      offerings: [],
      sourceRevision: 1,
      observedAt: 100,
    })
    expect(result).toMatchObject({ kind: 'available', projection: { offerings: [], disposition: 'current' } })
  })
  it('shows simultaneous human and declared agent access without claiming AE support', () => {
    const accessPaths: OfferingAccessPathRecord[] = [
      {
        accessPathRef: brandNonEmpty('access:meridian:quote', 'AccessPathRef'),
        businessId,
        offeringRef,
        offeringRevision: 2,
        offeringSourceHash,
        status: 'published',
        descriptor: {
          kind: 'human_request',
          channel: 'ae_inquiry',
          disclosure: 'Ask the business for a scoped estimate.',
        },
        sourceHash: brandNonEmpty('sha256:human-path', 'SourceHash'),
        createdAt: 2,
        updatedAt: 2,
      },
      {
        accessPathRef: brandNonEmpty('access:meridian:graphql', 'AccessPathRef'),
        businessId,
        offeringRef,
        offeringRevision: 2,
        offeringSourceHash,
        status: 'published',
        descriptor: {
          kind: 'external_operation',
          name: 'Query a subgraph',
          summary: 'Submit a GraphQL query for one subgraph.',
          url: 'https://api.meridian.example/subgraphs/{id}',
          method: 'POST',
          documentationUrl: 'https://docs.meridian.example/subgraphs',
          interfaceDescription: { format: 'graphql' },
          authenticationSummary: 'API key required.',
          pricingSummary: 'Usage priced per request.',
          provenance: 'business_declared',
        },
        sourceHash: brandNonEmpty('sha256:external-path', 'SourceHash'),
        createdAt: 2,
        updatedAt: 2,
      },
    ]

    const result = buildPublicOfferingSupplyProjection({
      offering,
      revision,
      accessPaths,
      support: { integrated: false, routeable: false, reasons: ['not_integrated'] },
    })

    expect(result).toMatchObject({
      kind: 'available',
      projection: {
        offering: { offeringRef, revision: 2, name: 'Subgraph query' },
        accessPaths: [
          { descriptor: { kind: 'human_request', channel: 'ae_inquiry' } },
          {
            descriptor: {
              kind: 'external_operation',
              method: 'POST',
              provenance: 'business_declared',
            },
          },
        ],
        support: { integrated: false, routeable: false, reasons: ['not_integrated'] },
      },
    })
    expect(JSON.stringify(result)).not.toMatch(/credentialRef|configJson|evidenceRefs/)
  })

  it('keeps the offering and human path when the declared endpoint is withdrawn', () => {
    const accessPaths: OfferingAccessPathRecord[] = [
      humanPath(),
      { ...externalPath(), status: 'withdrawn' },
    ]

    const result = buildPublicOfferingSupplyProjection({
      offering,
      revision,
      accessPaths,
      support: { integrated: true, routeable: false, reasons: ['publication_inactive'] },
    })

    expect(result.kind).toBe('available')
    if (result.kind !== 'available') return
    expect(result.projection.accessPaths).toHaveLength(1)
    expect(result.projection.accessPaths[0]?.descriptor.kind).toBe('human_request')
    expect(result.projection.support).toEqual({
      integrated: true,
      routeable: false,
      reasons: ['publication_inactive'],
    })
  })

  it('refuses stale or mismatched Offering lineage instead of joining by presentation text', () => {
    const mismatched = buildPublicOfferingSupplyProjection({
      offering,
      revision: { ...revision, sourceHash: brandNonEmpty('sha256:other', 'SourceHash') },
      accessPaths: [externalPath()],
      support: { integrated: true, routeable: true, reasons: [], observedAt: 10, validUntil: 20 },
    })

    expect(mismatched).toEqual({ kind: 'unavailable', reason: 'offering_lineage_mismatch' })
  })

  it('rejects an executable-looking directory path that is not a bounded public HTTPS description', () => {
    expect(validateOfferingAccessPath({
      kind: 'external_operation',
      name: 'Internal probe',
      summary: 'Do not publish this.',
      url: 'http://127.0.0.1/admin',
      method: 'POST',
      provenance: 'business_declared',
    })).toEqual({ kind: 'invalid', reason: 'external_operation_url_invalid' })
    expect(validateOfferingAccessPath({
      kind: 'external_operation', name: 'Local', summary: 'Do not publish this.', url: 'https://localhost./admin', provenance: 'business_declared',
    })).toEqual({ kind: 'invalid', reason: 'external_operation_url_invalid' })
    expect(validateOfferingAccessPath({
      kind: 'external_operation', name: 'Mapped', summary: 'Do not publish this.', url: 'https://[::ffff:7f00:1]/admin', provenance: 'business_declared',
    })).toEqual({ kind: 'invalid', reason: 'external_operation_url_invalid' })
  })
})

function humanPath(): OfferingAccessPathRecord {
  return {
    accessPathRef: brandNonEmpty('access:meridian:quote', 'AccessPathRef'),
    businessId,
    offeringRef,
    offeringRevision: 2,
    offeringSourceHash,
    status: 'published',
    descriptor: {
      kind: 'human_request',
      channel: 'ae_inquiry',
      disclosure: 'Ask the business for a scoped estimate.',
    },
    sourceHash: brandNonEmpty('sha256:human-path', 'SourceHash'),
    createdAt: 2,
    updatedAt: 2,
  }
}

function externalPath(): OfferingAccessPathRecord {
  return {
    accessPathRef: brandNonEmpty('access:meridian:graphql', 'AccessPathRef'),
    businessId,
    offeringRef,
    offeringRevision: 2,
    offeringSourceHash,
    status: 'published',
    descriptor: {
      kind: 'external_operation',
      name: 'Query a subgraph',
      summary: 'Submit a GraphQL query for one subgraph.',
      url: 'https://api.meridian.example/subgraphs/{id}',
      method: 'POST',
      provenance: 'business_declared',
    },
    sourceHash: brandNonEmpty('sha256:external-path', 'SourceHash'),
    createdAt: 2,
    updatedAt: 2,
  }
}
