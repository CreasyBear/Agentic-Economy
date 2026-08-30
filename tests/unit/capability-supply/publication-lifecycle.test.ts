import { describe, expect, it } from 'vitest'

import {
  connectionAuthoritySnapshotFromProviderConnection,
  type CapabilityBindingRow,
} from '@/modules/capability-supply/internal/binding'
import type { CapabilityOfferingRow } from '@/modules/capability-supply/internal/offering'
import {
  createProviderConnection,
  type CreateProviderConnectionCommand,
} from '@/modules/capability-supply/provider-connection'
import {
  capabilityBindingEligibilityHash,
  capabilityOfferingEligibilityHash,
  capabilityOperationId,
  createPublicOperationRef,
} from '@/modules/capability-supply/public'
import {
  INITIAL_PUBLICATION_LIFECYCLE,
  decodeConvexPublicationSource,
  isDirectPublicationSource,
  publicationLifecycle,
  publicationProjection,
} from '@/modules/capability-supply/internal/publication'

const digest = `sha256:${'1'.repeat(64)}`
const operationRef = createPublicOperationRef({
  operationId: capabilityOperationId('cap.demo'),
  publicationRef: 'offering-1',
  publicationRevision: 1,
  contractRef: { capabilityId: 'cap.demo', version: 1, contractDigest: digest },
})
const providerConnectionCommand: CreateProviderConnectionCommand = {
  commandId: 'command:create:demo',
  connectionRef: 'connection:demo',
  owningAccountRef: 'account:owner',
  installedByPrincipalRef: 'principal:owner',
  authorityGrantRef: 'grant:connection',
  authorityGrantGeneration: 1,
  secretRef: 'env:DEMO_PROVIDER_SECRET',
  businessId: 'business-1',
  providerRef: 'provider:demo',
  providerAccountRef: 'account:demo',
  adapterId: 'http-json:v1',
  credentialRef: 'env:DEMO_PROVIDER_SECRET',
  requestedScopes: ['demo:read'],
  grantedScopes: ['demo:read'],
  requestedResources: ['account:demo'],
  grantedResources: ['account:demo'],
  evidenceRefs: ['evidence:connection'],
}

function providerConnection() {
  const result = createProviderConnection(providerConnectionCommand, 1)
  if (result.kind !== 'applied') throw new Error(`provider connection fixture failed: ${result.kind}`)
  return result.connection
}

function offeringRow(status: 'active' | 'inactive' = 'active'): CapabilityOfferingRow {
  const registrationHash = digest
  const admissionEvidenceRefs = ['evidence:admission']
  return {
    offeringId: 'offering-1',
    businessId: 'business-1',
    networkId: 'network-1',
    capabilityId: 'cap.demo',
    version: 1,
    contractDigest: digest,
    presentation: {
      label: 'Demo',
      summary: 'Demo',
      price: { kind: 'on_request' },
      materialTerms: [],
      commercialRelationship: {
        kind: 'none',
        summary: 'Independent',
        influencesEligibility: false,
        influencesInclusion: false,
        influencesOrder: false,
        evidenceRefs: ['evidence:commercial'],
      },
    },
    searchTerms: ['demo'],
    registrationEvidenceRefs: ['evidence:registration'],
    registrationHash,
    status,
    admissionEvidenceRefs,
    eligibilityHash: capabilityOfferingEligibilityHash({
      offeringId: 'offering-1',
      registrationHash,
      status,
      admissionEvidenceRefs,
    }),
    registeredAt: 1,
    updatedAt: 1,
  }
}

function bindingRow(
  admission: 'admitted' | 'not_admitted' = 'admitted',
  conformance: 'conformant' | 'not_conformant' = 'conformant',
  connectionAuthority?: CapabilityBindingRow['connectionAuthority'],
): CapabilityBindingRow {
  const registrationHash = digest
  const admissionEvidenceRefs = ['evidence:admission']
  const conformanceEvidenceRefs = ['evidence:conformance']
  return {
    _id: 'row-1',
    _creationTime: 1,
    bindingId: 'binding-1',
    offeringId: 'offering-1',
    networkId: 'network-1',
    capabilityId: 'cap.demo',
    version: 1,
    contractDigest: digest,
    endpointUrl: 'https://example.test',
    authority: { kind: 'provider_connection', connectionRef: 'connection:demo', providerRef: 'provider:demo' },
    ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
    continuation: { kind: 'single_response', evidenceRefs: ['evidence:continuation'] },
    cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
    adapterId: 'http-json:v1',
    configJson: '{}',
    configDigest: digest,
    registrationEvidenceRefs: ['evidence:binding'],
    registrationHash,
    admission,
    conformance,
    admissionEvidenceRefs,
    conformanceEvidenceRefs,
    eligibilityHash: capabilityBindingEligibilityHash({
      bindingId: 'binding-1',
      registrationHash,
      admission,
      conformance,
      admissionEvidenceRefs,
      conformanceEvidenceRefs,
    }),
    registeredAt: 1,
    updatedAt: 1,
  }
}

describe('capability-supply publication lifecycle', () => {
  it('projects published results and starts from the inactive initial lifecycle', () => {
    expect(INITIAL_PUBLICATION_LIFECYCLE.state).toBe('inactive')
    expect(publicationProjection(
      { capabilityId: 'cap.demo', version: 1, contractDigest: digest },
      'offering-1',
      'binding-1',
    )).toMatchObject({
      kind: 'published',
      publicationRef: 'offering-1',
      lifecycle: INITIAL_PUBLICATION_LIFECYCLE,
    })
  })

  it('marks withdrawn and incompatible dispositions immediately', () => {
    expect(publicationLifecycle(
      { disposition: 'withdrawn', credentialState: 'ready', healthState: 'healthy' },
      offeringRow(),
      bindingRow(),
      100,
    )).toEqual({ state: 'withdrawn', reasons: ['withdrawn'] })
    expect(publicationLifecycle(
      { disposition: 'incompatible', credentialState: 'ready', healthState: 'healthy' },
      offeringRow(),
      bindingRow(),
      100,
    )).toEqual({ state: 'incompatible', reasons: ['incompatible_revision'] })
  })

  it('requires admission, conformance, credential, and health readiness for active', () => {
    const connection = providerConnection()
    const connectionAuthority = connectionAuthoritySnapshotFromProviderConnection(connection, operationRef)
    expect(publicationLifecycle(
      {
        disposition: 'current',
        credentialState: 'ready',
        healthState: 'healthy',
        readinessObservedAt: 100,
        readinessValidUntil: 200,
        connectionAuthority,
      },
      offeringRow('active'),
      bindingRow('admitted', 'conformant', connectionAuthority),
      100,
      connection,
    )).toEqual({ state: 'active', reasons: [] })
    const readinessConnection = providerConnection()
    const readinessAuthority = connectionAuthoritySnapshotFromProviderConnection(readinessConnection, operationRef)
    expect(publicationLifecycle(
      {
        disposition: 'current',
        credentialState: 'unobserved',
        healthState: 'unobserved',
        connectionAuthority: readinessAuthority,
      },
      offeringRow('inactive'),
      bindingRow('not_admitted', 'not_conformant', readinessAuthority),
      100,
      readinessConnection,
    ).reasons).toEqual(expect.arrayContaining([
      'admission_unproven',
      'conformance_unproven',
      'credential_readiness_unobserved',
      'health_unobserved',
    ]))
  })
  it('keeps first observations inactive and rejects stale or unbounded freshness', () => {
    const connection = providerConnection()
    const authority = connectionAuthoritySnapshotFromProviderConnection(connection, operationRef)
    const first = publicationLifecycle({
      disposition: 'current',
      credentialState: 'unobserved',
      healthState: 'unobserved',
      connectionAuthority: authority,
    }, offeringRow(), bindingRow('admitted', 'conformant', authority), 100, connection)
    expect(first.state).toBe('inactive')
    expect(first.reasons).toEqual(expect.arrayContaining([
      'credential_readiness_unobserved', 'health_unobserved',
    ]))

    const expired = publicationLifecycle({
      disposition: 'current',
      credentialState: 'ready',
      healthState: 'healthy',
      readinessObservedAt: 50,
      readinessValidUntil: 100,
      connectionAuthority: authority,
    }, offeringRow(), bindingRow('admitted', 'conformant', authority), 100, connection)
    expect(expired.reasons).toContain('health_stale')

    const unbounded = publicationLifecycle({
      disposition: 'current',
      credentialState: 'ready',
      healthState: 'healthy',
      readinessObservedAt: 100,
      readinessValidUntil: 100 + 24 * 60 * 60_000 + 1,
      connectionAuthority: authority,
    }, offeringRow(), bindingRow('admitted', 'conformant', authority), 100, connection)
    expect(unbounded.reasons).toContain('health_stale')

    const staleAuthority = publicationLifecycle({
      disposition: 'current',
      credentialState: 'ready',
      healthState: 'healthy',
      readinessObservedAt: 50,
      readinessValidUntil: 200,
      connectionAuthority: { ...authority, authorityDigest: `sha256:${'2'.repeat(64)}` },
    }, offeringRow(), bindingRow('admitted', 'conformant', authority), 100, connection)
    expect(staleAuthority).toEqual({
      state: 'inactive',
      reasons: ['eligibility_integrity_failure'],
    })

    const recovered = publicationLifecycle({
      disposition: 'current',
      credentialState: 'ready',
      healthState: 'healthy',
      readinessObservedAt: 110,
      readinessValidUntil: 200,
      connectionAuthority: authority,
    }, offeringRow(), bindingRow('admitted', 'conformant', authority), 110, connection)
    expect(recovered).toEqual({ state: 'active', reasons: [] })
  })

  it('decodes convex publication sources and recognizes direct envelopes', () => {
    expect(isDirectPublicationSource({ kind: 'ae_envelope', documentJson: '{}' })).toBe(true)
    expect(isDirectPublicationSource({ kind: 'openapi_http' })).toBe(false)
    expect(decodeConvexPublicationSource({
      kind: 'openapi_http',
      documentJson: '{"paths":{}}',
      other: true,
    })).toEqual({ kind: 'openapi_http', other: true, document: { paths: {} } })
    expect(decodeConvexPublicationSource({
      kind: 'mcp',
      toolJson: '{"name":"demo"}',
    })).toEqual({ kind: 'mcp', tool: { name: 'demo' } })
    expect(decodeConvexPublicationSource({
      kind: 'agent_plugin_mcp',
      manifestJson: '{"name":"demo","mcpServers":{"reference":{"type":"http","url":"https://tools.example.test/mcp"}}}',
      serverName: 'reference',
      toolJson: '{"name":"demo"}',
      protocolVersion: '2025-06-18',
    })).toEqual({
      kind: 'agent_plugin_mcp',
      serverName: 'reference',
      protocolVersion: '2025-06-18',
      manifest: { name: 'demo', mcpServers: { reference: { type: 'http', url: 'https://tools.example.test/mcp' } } },
      tool: { name: 'demo' },
    })
  })
})
