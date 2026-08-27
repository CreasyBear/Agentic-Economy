import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { defineCapabilityContract } from '@/modules/capability-contract/public'
import {
  admitRegisteredTransport,
  capabilityBindingEligibilityHash,
  capabilityBindingRegistrationHash,
  capabilityOperationId,
  capabilityOfferingEligibilityHash,
  capabilityOfferingRegistrationHash,
  connectionAuthoritySnapshotFromProviderConnection,
  createPublicOperationRef,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
  qualifySuppliedCandidate,
  queryCapabilityGraph,
  recordCapabilityProbeResult,
  type CapabilityGraphPorts,
  type GraphCatalogAccessPath,
  type GraphPublicationRow,
  type GraphPublishedBusiness,
  type SuppliedCandidateRef,
  type CapabilityOfferingRow,
  type CapabilityBindingRow,
} from '@/modules/capability-supply/public'
import {
  createProviderConnection,
  type CreateProviderConnectionCommand,
  type ProviderConnection,
} from '@/modules/capability-supply/provider-connection'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { probeTargetDigest } from '@/modules/capability-supply/internal/graph'
import { pricingConfigDigest } from '@/modules/money/public'
import { capabilityContractV2 } from '../../fixtures/capability-contract-v2'

const now = 2_000
const contract = defineCapabilityContract(capabilityContractV2())
const candidate: SuppliedCandidateRef = {
  publicationRef: 'publication:development-reference',
  revision: 3,
  networkId: 'ae:public',
  businessId: 'business:development-supplier',
  offeringId: 'offering:development-reference',
  bindingId: 'binding:development-reference',
  contractRef: contract.ref,
}
const operationRef = createPublicOperationRef({
  operationId: capabilityOperationId(contract.capabilityId),
  publicationRef: candidate.publicationRef,
  publicationRevision: candidate.revision,
  contractRef: contract.ref,
})
const catalogOrigin = {
  kind: 'catalog_offering' as const,
  offeringRef: 'catalog-offering:development-reference',
  offeringRevision: 2,
  offeringSourceHash: canonicalDigest({
    fixture: 'catalog-offering-development-reference',
    revision: 2,
  }),
  declaredAccessPathRef: 'catalog-access-path:development-reference',
  accessPathSourceHash: canonicalDigest({
    fixture: 'catalog-access-path-development-reference',
  }),
}
const catalogAccessPath: GraphCatalogAccessPath = {
  accessPathRef: catalogOrigin.declaredAccessPathRef,
  businessId: candidate.businessId,
  offeringRef: catalogOrigin.offeringRef,
  offeringRevision: catalogOrigin.offeringRevision,
  offeringSourceHash: catalogOrigin.offeringSourceHash,
  status: 'published',
  sourceHash: catalogOrigin.accessPathSourceHash,
  descriptor: {
    kind: 'external_operation',
    name: 'Development reference lookup',
    summary: 'Fixture-only reference lookup endpoint.',
    url: 'https://development.invalid/reference',
    method: 'POST',
    provenance: 'business_declared',
  },
}
const pricingConfig = {
  version: 'pricing:v2' as const,
  unit: 'call' as const,
  paidAmount: { currency: 'USD' as const, units: '1', exponent: 2 },
}
const priceDigest = pricingConfigDigest(pricingConfig)
const providerConnectionCommand: CreateProviderConnectionCommand = {
  commandId: 'command:create:development-reference',
  connectionRef: 'connection:development',
  businessId: candidate.businessId,
  providerRef: 'provider:development',
  providerAccountRef: 'account:development',
  adapterId: 'http-json:v1',
  credentialRef: 'env:DEVELOPMENT_REFERENCE_SECRET',
  requestedScopes: ['reference:read'],
  grantedScopes: ['reference:read'],
  requestedResources: ['account:development'],
  grantedResources: ['account:development'],
  evidenceRefs: ['fixture:connection'],
}
function developmentProviderConnection(): ProviderConnection {
  const result = createProviderConnection(providerConnectionCommand, now)
  if (result.kind !== 'applied') throw new Error(`provider connection fixture failed: ${result.kind}`)
  return result.connection
}
const connectionAuthority = connectionAuthoritySnapshotFromProviderConnection(
  developmentProviderConnection(),
  operationRef,
)
const offeringRegistration = defineCapabilityOfferingRegistration({
  offeringId: candidate.offeringId,
  businessId: candidate.businessId,
  networkId: 'ae:public',
  contractRef: contract.ref,
  origin: catalogOrigin,
  presentation: {
    label: 'Development reference lookup',
    summary: 'Labelled fixture supply for qualification evaluation.',
    price: { kind: 'fixed', amount: pricingConfig.paidAmount },
    materialTerms: [],
    commercialRelationship: {
      kind: 'none',
      summary: 'No commercial influence in this development fixture.',
      influencesEligibility: false,
      influencesInclusion: false,
      influencesOrder: false,
      evidenceRefs: ['fixture:commercial'],
    },
  },
  searchTerms: ['reference'],
  registrationEvidenceRefs: ['fixture:offering-registration'],
})
const bindingRegistration = defineCapabilityTransportBindingRegistration({
  bindingId: candidate.bindingId,
  offeringId: candidate.offeringId,
  networkId: 'ae:public',
  contractRef: contract.ref,
  endpointUrl: 'https://development.invalid/reference',
  authority: { kind: 'provider_connection', connectionRef: 'connection:development', providerRef: 'provider:development' },
  continuation: { kind: 'single_response', evidenceRefs: ['fixture:continuation'] },
  cancellation: { kind: 'unsupported', evidenceRefs: ['fixture:cancellation'] },
  adapter: { adapterId: 'http-json:v1', config: null },
  registrationEvidenceRefs: ['fixture:binding-registration'],
})
const admittedTransportConfig = { method: 'POST' as const, requestTimeoutMs: 5_000 }
const admittedTransport = {
  configJson: JSON.stringify(admittedTransportConfig),
  configDigest: canonicalDigest(admittedTransportConfig),
}
const mcpAuthority = { kind: 'public_upstream' as const }
const mcpRegistration = defineCapabilityTransportBindingRegistration({
  bindingId: candidate.bindingId,
  offeringId: candidate.offeringId,
  networkId: 'ae:public',
  contractRef: contract.ref,
  endpointUrl: 'https://development.invalid/reference',
  authority: mcpAuthority,
  continuation: { kind: 'single_response', evidenceRefs: ['fixture:continuation'] },
  cancellation: { kind: 'unsupported', evidenceRefs: ['fixture:cancellation'] },
  adapter: { adapterId: 'mcp-jsonrpc:v1', config: null },
  registrationEvidenceRefs: ['fixture:binding-registration'],
})
const mcpTransportResult = admitRegisteredTransport({
  adapterId: mcpRegistration.adapter.adapterId,
  endpointUrl: mcpRegistration.endpointUrl,
  authority: mcpRegistration.authority,
  continuation: mcpRegistration.continuation,
  cancellation: mcpRegistration.cancellation,
  config: { protocolVersion: '2025-06-18', toolName: 'reference_lookup', requestTimeoutMs: 5_000 },
})
if (mcpTransportResult.kind !== 'admitted') throw new Error(`MCP fixture admission failed: ${mcpTransportResult.reason}`)
const mcpTransport = mcpTransportResult.transport
const mcpRegistrationHash = capabilityBindingRegistrationHash(mcpRegistration, mcpTransport)

function offering(overrides: Partial<CapabilityOfferingRow> = {}): CapabilityOfferingRow {
  const registrationHash = capabilityOfferingRegistrationHash(offeringRegistration)
  const status = overrides.status ?? 'active'
  const admissionEvidenceRefs = ['fixture:offering-admission']
  return {
    ...offeringRegistration,
    ...contract.ref,
    registrationHash,
    status,
    admissionEvidenceRefs,
    eligibilityHash: capabilityOfferingEligibilityHash({
      offeringId: candidate.offeringId,
      registrationHash,
      status,
      admissionEvidenceRefs,
    }),
    registeredAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  }
}

function binding(overrides: Partial<CapabilityBindingRow> = {}): CapabilityBindingRow {
  const registrationHash = capabilityBindingRegistrationHash(bindingRegistration, admittedTransport)
  const admission = overrides.admission ?? 'admitted'
  const conformance = overrides.conformance ?? 'conformant'
  const admissionEvidenceRefs = ['fixture:binding-admission']
  const conformanceEvidenceRefs = ['fixture:binding-conformance']
  return {
    _id: 'fixture:binding-row',
    _creationTime: 1_000,
    bindingId: candidate.bindingId,
    offeringId: candidate.offeringId,
    networkId: 'ae:public',
    ...contract.ref,
    endpointUrl: bindingRegistration.endpointUrl,
    authority: bindingRegistration.authority,
    connectionAuthority,
    continuation: bindingRegistration.continuation,
    cancellation: bindingRegistration.cancellation,
    adapterId: bindingRegistration.adapter.adapterId,
    ...admittedTransport,
    registrationEvidenceRefs: bindingRegistration.registrationEvidenceRefs,
    registrationHash,
    admission,
    conformance,
    admissionEvidenceRefs,
    conformanceEvidenceRefs,
    eligibilityHash: capabilityBindingEligibilityHash({
      bindingId: candidate.bindingId,
      registrationHash,
      admission,
      conformance,
      admissionEvidenceRefs,
      conformanceEvidenceRefs,
    }),
    registeredAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  }
}

function mcpBinding(overrides: Partial<CapabilityBindingRow> = {}): CapabilityBindingRow {
  const admission = 'admitted' as const
  const conformance = 'conformant' as const
  const admissionEvidenceRefs = ['fixture:binding-admission']
  const conformanceEvidenceRefs = ['fixture:binding-conformance']
  return {
    ...binding(),
    authority: mcpAuthority,
    adapterId: mcpTransport.adapterId,
    configJson: mcpTransport.configJson,
    configDigest: mcpTransport.configDigest,
    registrationEvidenceRefs: mcpRegistration.registrationEvidenceRefs,
    registrationHash: mcpRegistrationHash,
    admission,
    conformance,
    admissionEvidenceRefs,
    conformanceEvidenceRefs,
    eligibilityHash: capabilityBindingEligibilityHash({
      bindingId: candidate.bindingId,
      registrationHash: mcpRegistrationHash,
      admission,
      conformance,
      admissionEvidenceRefs,
      conformanceEvidenceRefs,
    }),
    ...overrides,
  }
}

function publication(overrides: Partial<GraphPublicationRow> = {}): GraphPublicationRow {
  return {
    id: 'fixture:publication-row',
    ...candidate,
    operationRef,
    ...contract.ref,
    connectionAuthority,
    sourceKind: 'openapi_http',
    sourceDigest: canonicalDigest({ fixture: 'published capability' }),
    pricingConfig,
    priceDigest,
    disposition: 'current',
    credentialState: 'ready',
    healthState: 'healthy',
    readinessObservedAt: 1_900,
    readinessValidUntil: 2_100,
    registrationEvidenceRefs: ['fixture:publication-registration'],
    readinessEvidenceRefs: ['fixture:readiness-probe'],
    ...overrides,
  }
}

function ports(overrides: Partial<CapabilityGraphPorts> = {}): CapabilityGraphPorts {
  return {
    loadPublicationAtRevision: async () => publication(),
    listCurrentPublicationsByNetwork: async () => [],
    loadOfferingByOfferingId: async () => offering(),
    loadBindingByBindingId: async () => binding(),
    loadPublishedBusiness: async () => ({
      businessId: candidate.businessId,
      trustTier: 'fixture_only',
      publicStatus: 'published',
      suppressed: false,
      currentlyPublished: true,
    }),
    loadProviderConnection: async () => developmentProviderConnection(),
    catalogOriginIsCurrent: async (origin, businessId) => (
      businessId === candidate.businessId
      && origin.offeringRef === catalogOrigin.offeringRef
      && origin.offeringRevision === catalogOrigin.offeringRevision
      && origin.offeringSourceHash === catalogOrigin.offeringSourceHash
      && origin.declaredAccessPathRef === catalogOrigin.declaredAccessPathRef
      && origin.accessPathSourceHash === catalogOrigin.accessPathSourceHash
    ),
    loadCatalogAccessPath: async (accessPathRef) => (
      accessPathRef === catalogAccessPath.accessPathRef ? catalogAccessPath : null
    ),
    getActiveExactCapabilityContract: async () => ({
      kind: 'found',
      ref: contract.ref,
      documentJson: '{}',
      registeredAt: 1_000,
    }),
    getExactRegisteredCapabilityContract: async () => ({
      kind: 'found',
      contract,
      registeredAt: 1_000,
    }),
    patchProbeReadiness: async () => undefined,
    ...overrides,
  }
}

describe('ADR-009 supplied-candidate qualification', () => {
  it('qualifies labelled supplied development evidence only when every source-owned condition is current', async () => {
    const result = await qualifySuppliedCandidate(ports(), { candidate, now })

    expect(result).toMatchObject({
      environment: 'SOURCE-OWNED DEVELOPMENT EVIDENCE',
      status: 'eligible',
      reasons: [],
      validUntil: 2_100,
      qualificationDigest: expect.stringMatching(/^sha256:/),
    })
    expect(result.sources.map(({ kind }) => kind)).toEqual([
      'authority', 'binding', 'business', 'contract',
      'offering', 'pricing', 'publication', 'readiness',
    ])
    expect(result.sources.every(({ ref, digest }) => ref.length > 0 && digest.startsWith('sha256:')))
      .toBe(true)
  })
  it('records credential rejection as durable unavailable state over stale healthy readiness', async () => {
    const basePublication = publication()
    const baseOffering = offering()
    const baseBinding = binding()
    let updated: GraphPublicationRow | undefined
    const targetDigest = probeTargetDigest(basePublication, baseOffering, baseBinding)
    const result = await recordCapabilityProbeResult(ports({
      loadPublicationAtRevision: async () => basePublication,
      loadOfferingByOfferingId: async () => baseOffering,
      loadBindingByBindingId: async () => baseBinding,
      patchProbeReadiness: async (_publicationId, patch) => {
        updated = { ...basePublication, ...patch }
      },
    }), {
      publicationRef: candidate.publicationRef,
      expectedRevision: candidate.revision,
      targetDigest,
      requestDigest: canonicalDigest({ probe: 'credential-rejected' }),
      responseStatus: 401,
      outcome: 'credential_rejected',
      credentialState: 'unavailable',
      healthState: 'unhealthy',
      observedAt: now,
      validUntil: now + 100,
      evidenceRefs: ['fixture:credential-rejected'],
      now,
    })

    expect(result).toMatchObject({
      kind: 'observed',
      lifecycle: {
        state: 'inactive',
        reasons: expect.arrayContaining(['credential_unavailable', 'health_unhealthy']),
      },
    })
    expect(updated).toMatchObject({
      credentialState: 'unavailable',
      healthState: 'unhealthy',
      readinessOutcome: 'credential_rejected',
      readinessResponseStatus: 401,
    })
  })

  it('derives POST for an exact current MCP Agent Plugin publication in both routeability consumers', async () => {
    const mcpPublication = publication({ sourceKind: 'agent_plugin_mcp' })
    const mcpPorts = ports({
      loadPublicationAtRevision: async () => mcpPublication,
      listCurrentPublicationsByNetwork: async () => [mcpPublication],
      loadBindingByBindingId: async () => mcpBinding(),
    })

    await expect(qualifySuppliedCandidate(mcpPorts, { candidate, now })).resolves.toMatchObject({
      status: 'eligible',
      reasons: [],
    })
    const graph = await queryCapabilityGraph(mcpPorts, {
      networkId: 'ae:public',
      includeInactive: false,
      limit: 1,
      now,
    })
    expect(graph.kind).toBe('available')
    if (graph.kind !== 'available') throw new Error(`graph unavailable: ${graph.reason}`)
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0]?.source.kind).toBe('agent_plugin_mcp')
    expect(graph.nodes[0]?.routability).toEqual({ eligible: true, reasons: [] })
  })

  it.each([
    ['listing only', {
      loadPublicationAtRevision: async (): Promise<GraphPublicationRow | null> => null,
    }, ['publication_missing']],
    ['non-current publication', {
      loadPublicationAtRevision: async () => publication({ disposition: 'superseded' }),
    }, ['publication_not_current']],
    ['mismatched candidate references', {
      loadPublicationAtRevision: async () => publication({ businessId: 'business:other' }),
    }, ['candidate_reference_mismatch']],
    ['missing offering', {
      loadOfferingByOfferingId: async (): Promise<CapabilityOfferingRow | null> => null,
    }, ['offering_missing']],
    ['missing binding', {
      loadBindingByBindingId: async (): Promise<CapabilityBindingRow | null> => null,
    }, ['binding_missing']],
    ['missing contract', {
      getExactRegisteredCapabilityContract: async () => ({ kind: 'unavailable' as const, reason: 'not_found' as const }),
    }, ['contract_missing_or_inactive']],
    ['unpublished business', {
      loadPublishedBusiness: async () => null,
    }, ['business_not_currently_published']],
    ['ineligible offering', {
      loadOfferingByOfferingId: async () => offering({ status: 'inactive' }),
    }, ['offering_ineligible_or_unpublished']],
    ['unadmitted and nonconformant binding', {
      loadBindingByBindingId: async () => binding({
        admission: 'not_admitted',
        conformance: 'not_conformant',
      }),
    }, ['binding_not_admitted', 'binding_not_conformant']],
    ['credential access failure', {
      loadPublicationAtRevision: async () => publication({ credentialState: 'unavailable' }),
    }, ['credential_access_unavailable']],
    ['missing readiness', {
      loadPublicationAtRevision: async () => publication({
        healthState: 'unobserved',
        readinessObservedAt: undefined,
        readinessValidUntil: undefined,
      }),
    }, ['readiness_unobserved']],
    ['stale readiness', {
      loadPublicationAtRevision: async () => publication({ readinessValidUntil: 1_999 }),
    }, ['readiness_stale']],
  ] as const)('blocks %s with inspectable reasons', async (_label, overrides, expectedReasons) => {
    const result = await qualifySuppliedCandidate(ports(overrides), { candidate, now })
    expect(result.status).toBe('blocked')
    expect(result.reasons).toEqual(expect.arrayContaining([...expectedReasons]))
  })
  it('blocks a stale catalog origin with the canonical origin refusal', async () => {
    const result = await qualifySuppliedCandidate(ports({
      catalogOriginIsCurrent: async () => false,
    }), { candidate, now })

    expect(result.status).toBe('blocked')
    expect(result.reasons).toContain('catalog_origin_stale')
  })
  it('blocks publication, offering, binding, and request network disagreement', async () => {
    const requestMismatch = await qualifySuppliedCandidate(ports(), {
      candidate: { ...candidate, networkId: 'ae:private' },
      now,
    })
    expect(requestMismatch.status).toBe('blocked')
    expect(requestMismatch.reasons).toContain('candidate_reference_mismatch')

    const publicationMismatch = await qualifySuppliedCandidate(ports({
      loadPublicationAtRevision: async () => publication({ networkId: 'ae:private' }),
    }), { candidate, now })
    expect(publicationMismatch.reasons).toContain('candidate_reference_mismatch')

    const offeringMismatch = await qualifySuppliedCandidate(ports({
      loadOfferingByOfferingId: async () => offering({ networkId: 'ae:private' }),
    }), { candidate, now })
    expect(offeringMismatch.reasons).toContain('candidate_reference_mismatch')

    const bindingMismatch = await qualifySuppliedCandidate(ports({
      loadBindingByBindingId: async () => binding({ networkId: 'ae:private' }),
    }), { candidate, now })
    expect(bindingMismatch.reasons).toContain('candidate_reference_mismatch')
  })

  it('blocks authority and readiness disagreements instead of trusting either projection', async () => {
    const authorityMismatch = await qualifySuppliedCandidate(ports({
      loadPublicationAtRevision: async () => publication({
        connectionAuthority: {
          ...connectionAuthority,
          authorityGeneration: connectionAuthority.authorityGeneration + 1,
        },
      }),
    }), { candidate, now })
    expect(authorityMismatch.status).toBe('blocked')
    expect(authorityMismatch.reasons).toContain('source_integrity_failure')

    const readinessMismatch = await qualifySuppliedCandidate(ports({
      loadPublicationAtRevision: async () => publication({
        healthState: 'healthy',
        readinessObservedAt: undefined,
        readinessValidUntil: now + 100,
      }),
    }), { candidate, now })
    expect(readinessMismatch.status).toBe('blocked')
    expect(readinessMismatch.reasons).toContain('readiness_unobserved')
  })

  it('blocks a tampered business-currentness projection and changes its source evidence', async () => {
    const current = await qualifySuppliedCandidate(ports(), { candidate, now })
    const tamperedBusiness = {
      businessId: candidate.businessId,
      trustTier: 'fixture_only',
      publicStatus: 'published',
      suppressed: false,
      currentlyPublished: false,
    } as unknown as GraphPublishedBusiness
    const tampered = await qualifySuppliedCandidate(ports({
      loadPublishedBusiness: async () => tamperedBusiness,
    }), { candidate, now })

    expect(tampered).toMatchObject({
      status: 'blocked',
      reasons: ['business_not_currently_published'],
    })
    expect(sourceDigest(tampered, 'business')).toBeUndefined()
    expect(sourceDigest(current, 'business')).toMatch(/^sha256:/)
  })

  it('binds exact registered contract digest and blocks a mismatched returned contract', async () => {
    const first = await qualifySuppliedCandidate(ports(), { candidate, now })
    expect(sourceDigest(first, 'contract')).toBe(contract.ref.contractDigest)

    const mismatchedContract = defineCapabilityContract(capabilityContractV2({
      version: 2,
    }))
    const mismatched = await qualifySuppliedCandidate(ports({
      getExactRegisteredCapabilityContract: async () => ({
        kind: 'found',
        contract: mismatchedContract,
        registeredAt: 1_000,
      }),
    }), { candidate, now })

    expect(sourceDigest(mismatched, 'contract')).toBe(mismatchedContract.ref.contractDigest)
    expect(sourceDigest(mismatched, 'contract')).not.toBe(sourceDigest(first, 'contract'))
    expect(mismatched.qualificationDigest).not.toBe(first.qualificationDigest)
    expect(mismatched.status).toBe('blocked')
    expect(mismatched.reasons).toContain('source_integrity_failure')
  })

  it('is deterministic, reference-only, and does not introduce an action runner or effect path', async () => {
    const first = await qualifySuppliedCandidate(ports(), { candidate, now })
    const second = await qualifySuppliedCandidate(ports(), { candidate, now })
    expect(second).toEqual(first)
    expect(JSON.stringify(first)).not.toContain('https://development.invalid')
    expect(JSON.stringify(first)).not.toContain('fixture:credential-access')

    const source = readFileSync(
      'src/modules/capability-supply/internal/graph/qualify-candidate.ts',
      'utf8',
    )
    expect(source).not.toMatch(/defineAction|ActionInvocationTracer|\.run\(|execute|fetch\(/)
  })
})

function sourceDigest(
  result: Awaited<ReturnType<typeof qualifySuppliedCandidate>>,
  kind: 'business' | 'contract',
): string | undefined {
  return result.sources.find((source) => source.kind === kind)?.digest
}
