import { describe, expect, it, vi } from 'vitest'

import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import { pricingConfigDigest } from '@/modules/money/public'
import {
  admitPublicationDraft,
  admitCapabilityPublicationCommand,
  preparePublicationDraft,
  publishPreparedCapabilityCommand,
  republishPreparedCapabilityCommand,
  type RepublishPreparedCapabilityCommandInput,
  refreshCapabilityCommand,
  withdrawCapabilityCommand,
  type PreparedPublicationMaterial,
  type PublicationCommandPorts,
  type PublicationCommandRow,
} from '@/modules/capability-supply/internal/publication'
import { publicationSourceDigest } from '@/modules/capability-supply/internal/publication/source'
import type { CapabilityBindingRow } from '@/modules/capability-supply/internal/binding/registration'
import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import type { OperationKeyRecord } from '@/modules/capability-supply/internal/operation-ledger'
import { capabilityContractV2 } from '../../fixtures/capability-contract-v2'
import type { CapabilityPublicationBindingDraft } from '@/modules/capability-supply/public'
import {
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  capabilityOperationId,
  createPublicOperationRef,
} from '@/modules/capability-supply/public'
import type { CapabilityOfferingRow } from '@/modules/capability-supply/internal/offering/registration'
import { providerConnectionAuthorityDigest, type ProviderConnection } from '@/modules/capability-supply/provider-connection'
import * as publicationImporters from '@/modules/capability-supply/internal/publication-importers'
import {
  capabilityPublicationProvenanceDigest,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
} from '@/modules/capability-supply/public'
const currentPricingConfig = {
  version: 'pricing:v2' as const,
  unit: 'call' as const,
  paidAmount: { currency: 'AUD' as const, units: '1200', exponent: 2 },
}

const digest = `sha256:${'a'.repeat(64)}`
const actor = { kind: 'owner' as const, ref: 'owner-1' }
const context = {
  operationKey: 'op-publish-1',
  correlationId: 'corr-1',
  reasonCode: 'publish',
  evidenceRefs: ['evidence:publication'],
  runtimeEnvironment: 'sandbox' as const,
}

function publicationSource(
  capabilityId = 'independent.demo.lookup',
  version = 1,
): Extract<CapabilityPublicationImport, { kind: 'ae_envelope' }> {
  return {
    kind: 'ae_envelope',
    documentJson: JSON.stringify(capabilityContractV2({ capabilityId, version, name: 'Demo lookup' })),
    offering: offeringDraft(),
    binding: bindingDraft(),
    evidenceRefs: [...context.evidenceRefs],
  }
}

function offeringDraft(suffix = 'demo'): CapabilityPublicationOfferingDraft {
  return {
    offeringId: `offering:${suffix}:lookup`,
    networkId: 'ae:public',
    presentation: {
      label: `${suffix} lookup`,
      summary: 'Returns one structured result.',
      price: { kind: 'fixed' as const, amount: { currency: 'AUD' as const, units: '1200', exponent: 2 } },
      materialTerms: [],
      commercialRelationship: {
        kind: 'none' as const,
        summary: 'No commercial influence.',
        influencesEligibility: false,
        influencesInclusion: false,
        influencesOrder: false,
        evidenceRefs: ['business:neutral'],
      },
    },
    searchTerms: ['lookup'],
    registrationEvidenceRefs: ['business:publication'],
  }
}

function bindingDraft(suffix = 'demo'): CapabilityPublicationBindingDraft {
  return {
    bindingId: `binding:${suffix}:http`,
    endpointUrl: `https://${suffix}.example.test/lookup`,
    authority: { kind: 'provider_connection', connectionRef: `connection:${suffix}`, providerRef: `provider:${suffix}` },
    continuation: { kind: 'single_response' as const, evidenceRefs: ['business:response'] },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: ['business:no-cancellation'] },
    adapter: { adapterId: 'http-json:v1', config: { method: 'POST' as const, requestTimeoutMs: 5_000 } },
    registrationEvidenceRefs: ['business:binding'],
  }
}

function encodedFor(capabilityId = 'independent.demo.lookup', version = 1) {
  return encodeCapabilityContractDocumentJson(
    JSON.stringify(capabilityContractV2({ capabilityId, version, name: 'Demo lookup' })),
  )
}

async function preparedPublication(
  capabilityId = 'independent.demo.lookup',
  version = 1,
): Promise<PreparedPublicationMaterial> {
  const result = await preparePublicationDraft({
    source: publicationSource(capabilityId, version),
    sourceRevision: 'source-revision:demo',
    pricingConfig: {
      version: 'pricing:v2',
      unit: 'call',
      paidAmount: { currency: 'AUD', units: '1200', exponent: 2 },
    },
    evidenceRefs: context.evidenceRefs,
  })
  if ('reason' in result) throw new Error(`prepared_fixture_refused:${result.reason}`)
  return result.prepared
}

function preparedWithSourceAdapter(
  prepared: PreparedPublicationMaterial,
  sourceKind: PreparedPublicationMaterial['sourceKind'],
  sourceSelector: PreparedPublicationMaterial['sourceSelector'],
  adapter: PreparedPublicationMaterial['binding']['adapter'],
): PreparedPublicationMaterial {
  return {
    ...prepared,
    sourceKind,
    sourceSelector,
    sourceDigest: publicationSourceDigest({
      sourceKind,
      selector: sourceSelector,
      descriptorJson: prepared.sourceDescriptorJson,
    }),
    binding: { ...prepared.binding, adapter },
  }
}
function emptyPorts(overrides: Partial<PublicationCommandPorts> = {}): PublicationCommandPorts {
  return {
    findOperationKey: async () => null,
    insertOperationKey: async () => 'op-row-1',
    markOperationInProgress: async () => {},

    markOperationFailed: async () => {},
    markOperationSucceeded: async () => {},
    findAuditByEventId: async () => null,
    insertAudit: async () => {},
    registerOffering: async (registration: unknown) => ({
      kind: 'registered',
      offeringId: registrationId(registration, 'offeringId'),
      registrationHash: digest,
      created: true,
    }),
    registerBinding: async (registration: unknown) => ({
      kind: 'registered',
      bindingId: registrationId(registration, 'bindingId'),
      registrationHash: digest,
      created: true,
    }),
    setEligibility: async () => ({
      kind: 'eligible',
      offeringId: 'offering:demo:lookup',
      bindingId: 'binding:demo:http',
      eligibilityHash: digest,
      offeringEligibilityHash: digest,
      bindingEligibilityHash: digest,
      transition: {
        offeringBefore: 'inactive',
        offeringAfter: 'active',
        bindingBefore: 'not_admitted:not_conformant',
        bindingAfter: 'admitted:conformant',
      },
    }),
    loadOfferingByOfferingId: async () => null,
    loadBindingByBindingId: async () => null,
    listAdmittedConformantBindings: async () => [],
    patchOfferingQuarantineParent: async () => {},
    patchBindingQuarantine: async () => {},
    findContractDigest: async () => null,
    loadPublicationAtRevision: async () => null,
    insertPublication: async () => {},
    patchPublicationSuperseded: async () => {},
    patchPublicationWithdrawn: async () => {},
    registerContractDocument: async () => ({
      kind: 'registered',
      ref: encodedFor().contract.ref,
      created: true,
    }),
    getExactRegisteredContract: async () => ({
      kind: 'unavailable',
      reason: 'not_found',
    }),
    scheduleReadinessProbe: async () => {},
    ...overrides,
  }
}
function registrationId(registration: unknown, field: 'offeringId' | 'bindingId'): string {
  if (typeof registration !== 'object' || registration === null) {
    throw new Error(`registration_${field}_missing`)
  }
  const value = field === 'offeringId'
    ? ('offeringId' in registration ? registration.offeringId : undefined)
    : ('bindingId' in registration ? registration.bindingId : undefined)
  if (typeof value !== 'string') throw new Error(`registration_${field}_invalid`)
  return value
}

function currentPublication(
  overrides: Partial<PublicationCommandRow> = {},
): PublicationCommandRow {
  const ref = encodedFor().contract.ref
  return {
    id: 'pub-row-1',
    operationRef: createPublicOperationRef({
      operationId: capabilityOperationId(ref.capabilityId),
      publicationRef: 'offering:demo:lookup',
      publicationRevision: 1,
      contractRef: ref,
    }),
    publicationRef: 'offering:demo:lookup',
    revision: 1,
    businessId: 'business-1',
    networkId: 'ae:public',
    runtimeEnvironment: 'sandbox',
    offeringId: 'offering:demo:lookup',
    bindingId: 'binding:demo:http',
    capabilityId: ref.capabilityId,
    version: ref.version,
    contractDigest: ref.contractDigest,
    disposition: 'current',
    sourceKind: 'ae_envelope',
    sourceSelector: {},
    sourceDescriptorJson: publicationSource(ref.capabilityId, ref.version).documentJson,
    sourceRevision: 'source-revision:demo',
    sourceDigest: digest,
    pricingConfigJson: JSON.stringify(currentPricingConfig),
    priceDigest: pricingConfigDigest(currentPricingConfig),
    publisherRef: 'owner-1',
    authorityMode: 'provider_owned',
    provenanceDigest: digest,
    registrationEvidenceRefs: ['evidence:publication'],
    ...overrides,
  }
}

function supplyRows(publication: PublicationCommandRow): Pick<
  PublicationCommandPorts,
  'loadOfferingByOfferingId' | 'loadBindingByBindingId'
> {
  return {
    loadOfferingByOfferingId: async (): Promise<CapabilityOfferingRow> => ({
      offeringId: publication.offeringId,
      businessId: publication.businessId,
      networkId: publication.networkId,
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
      presentation: offeringDraft().presentation,
      searchTerms: ['lookup'],
      registrationEvidenceRefs: ['business:publication'],
      registrationHash: digest,
      status: 'active',
      admissionEvidenceRefs: ['evidence:admission'],
      eligibilityHash: digest,
      registeredAt: 1,
      updatedAt: 1,
    }),
    loadBindingByBindingId: async (): Promise<CapabilityBindingRow> => ({
      _id: 'binding-row',
      _creationTime: 1,
      bindingId: publication.bindingId,
      offeringId: publication.offeringId,
      networkId: publication.networkId,
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
      endpointUrl: 'https://demo.example.test/lookup',
      authority: { kind: 'provider_connection', connectionRef: 'connection:demo', providerRef: 'provider:demo' },
      continuation: { kind: 'single_response' as const, evidenceRefs: ['business:response'] },
      cancellation: { kind: 'unsupported' as const, evidenceRefs: ['business:no-cancellation'] },
      adapterId: 'http-json:v1',
      configJson: '{}',
      configDigest: digest,
      registrationEvidenceRefs: ['business:binding'],
      registrationHash: digest,
      admission: 'admitted',
      conformance: 'conformant',
      admissionEvidenceRefs: ['evidence:admission'],
      conformanceEvidenceRefs: ['evidence:conformance'],
      eligibilityHash: digest,
      registeredAt: 1,
      updatedAt: 1,
    }),
  }
}

type RepublishFixture = Readonly<{
  prepared: PreparedPublicationMaterial
  publication: PublicationCommandRow
  offering: CapabilityOfferingRow
  binding: CapabilityBindingRow
  providerConnection: ProviderConnection
  ref: CapabilityContractRef
}>

async function republishFixture(): Promise<RepublishFixture> {
  const prepared = await preparedPublication()
  const admitted = await admitPublicationDraft({ prepared, businessId: 'business-1' })
  if ('reason' in admitted) throw new Error(`admission_fixture_refused:${admitted.reason}`)
  const ref = admitted.encoded.contract.ref
  const operationRef = createPublicOperationRef({
    operationId: capabilityOperationId(ref.capabilityId),
    publicationRef: 'offering:demo:lookup',
    publicationRevision: 1,
    contractRef: ref,
  })
  const connection = {
    connectionRef: 'connection:demo',
    businessId: 'business-1',
    providerRef: 'provider:demo',
    providerAccountRef: 'account:demo',
    adapterId: admitted.binding.adapter.adapterId,
    credentialRef: null,
    grantedScopes: [],
    grantedResources: [],
    authorityGeneration: 1,
    authorityDigest: '',
    lifecycle: 'active' as const,
    observedAt: 1,
    evidenceRefs: ['evidence:provider-connection'],
    createdAt: 1,
    updatedAt: 1,
    lastCommandId: 'command:demo',
    lastCommandDigest: digest,
  }
  const providerConnection = {
    ...connection,
    authorityDigest: providerConnectionAuthorityDigest(connection),
  }
  const connectionAuthority = {
    connectionRef: connection.connectionRef,
    providerRef: connection.providerRef,
    adapterId: connection.adapterId,
    authorityGeneration: connection.authorityGeneration,
    authorityDigest: providerConnection.authorityDigest,
    operationRef,
    grantedScopes: [],
    grantedResources: [],
  }
  const publication = currentPublication({
    operationRef,
    disposition: 'withdrawn',
    sourceKind: prepared.sourceKind,
    sourceSelector: prepared.sourceSelector,
    sourceDescriptorJson: prepared.sourceDescriptorJson,
    sourceRevision: prepared.sourceRevision,
    sourceDigest: prepared.sourceDigest,
    pricingConfigJson: prepared.pricingConfigJson,
    priceDigest: prepared.priceDigest,
    contractDigest: ref.contractDigest,
    provenanceDigest: capabilityPublicationProvenanceDigest({
      publisherRef: 'owner-1',
      authorityMode: 'provider_owned',
      sourceRevision: prepared.sourceRevision,
      sourceDigest: prepared.sourceDigest,
    }),
    connectionAuthority,
    readinessOutcome: 'healthy',
    readinessObservedAt: 100,
    readinessValidUntil: 200,
  })
  const offering: CapabilityOfferingRow = {
    offeringId: admitted.offering.offeringId,
    businessId: publication.businessId,
    networkId: admitted.offering.networkId,
    capabilityId: ref.capabilityId,
    version: ref.version,
    contractDigest: ref.contractDigest,
    presentation: admitted.offering.presentation,
    searchTerms: admitted.offering.searchTerms,
    registrationEvidenceRefs: admitted.offering.registrationEvidenceRefs,
    registrationHash: capabilityOfferingRegistrationHash(admitted.offering),
    status: 'active',
    admissionEvidenceRefs: ['evidence:admission'],
    eligibilityHash: digest,
    registeredAt: 1,
    updatedAt: 1,
  }
  const binding: CapabilityBindingRow = {
    _id: 'binding-row',
    _creationTime: 1,
    bindingId: admitted.binding.bindingId,
    offeringId: admitted.binding.offeringId,
    networkId: admitted.binding.networkId,
    capabilityId: ref.capabilityId,
    version: ref.version,
    contractDigest: ref.contractDigest,
    endpointUrl: admitted.binding.endpointUrl,
    authority: admitted.binding.authority,
    connectionAuthority,
    continuation: admitted.binding.continuation,
    cancellation: admitted.binding.cancellation,
    adapterId: admitted.binding.adapter.adapterId,
    configJson: admitted.admittedTransport.transport.configJson,
    configDigest: admitted.admittedTransport.transport.configDigest,
    registrationEvidenceRefs: admitted.binding.registrationEvidenceRefs,
    registrationHash: capabilityBindingRegistrationHash(admitted.binding, admitted.admittedTransport.transport),
    admission: 'admitted',
    conformance: 'conformant',
    admissionEvidenceRefs: ['evidence:admission'],
    conformanceEvidenceRefs: ['evidence:conformance'],
    eligibilityHash: digest,
    registeredAt: 1,
    updatedAt: 1,
  }
  return { prepared, publication, offering, binding, providerConnection, ref }
}

function republishPorts(
  fixture: RepublishFixture,
  overrides: Partial<PublicationCommandPorts> = {},
): PublicationCommandPorts {
  return emptyPorts({
    findContractDigest: async () => fixture.ref.contractDigest,
    getExactRegisteredContract: async () => ({
      kind: 'found',
      contract: encodedFor().contract,
      registeredAt: 1,
    }),
    loadPublicationAtRevision: async (_publicationRef, revision) => (
      revision === fixture.publication.revision ? fixture.publication : null
    ),
    loadOfferingByOfferingId: async () => fixture.offering,
    loadBindingByBindingId: async (bindingId) => (
      bindingId === fixture.binding.bindingId ? fixture.binding : null
    ),
    loadProviderConnection: async () => fixture.providerConnection,
    registerOffering: async () => ({
      kind: 'registered',
      offeringId: fixture.offering.offeringId,
      registrationHash: fixture.offering.registrationHash,
      created: false,
    }),
    registerBinding: async () => ({
      kind: 'registered',
      bindingId: fixture.binding.bindingId,
      registrationHash: fixture.binding.registrationHash,
      created: true,
    }),
    ...overrides,
  })
}

function republishInput(
  fixture: RepublishFixture,
  overrides: Partial<RepublishPreparedCapabilityCommandInput> = {},
): RepublishPreparedCapabilityCommandInput {
  return {
    businessId: fixture.publication.businessId,
    publication: fixture.publication,
    prepared: fixture.prepared,
    actor,
    ...context,
    now: 10,
    ...overrides,
  }
}

describe('capability-supply publication commands', () => {
  it('refuses prepare when source is invalid', async () => {
    const result = await preparePublicationDraft({
      source: { ...publicationSource(), documentJson: '{' },
      sourceRevision: 'source-revision:demo',
      pricingConfig: {
        version: 'pricing:v2',
        unit: 'call',
        paidAmount: { currency: 'AUD', units: '1200', exponent: 2 },
      },
      evidenceRefs: context.evidenceRefs,
    })
    expect(result).toEqual({ kind: 'refused', reason: 'source_invalid' })
  })

  it('refuses admission before normalization when source revision is invalid', async () => {
    const result = await admitCapabilityPublicationCommand({
      businessId: 'business-1',
      catalogOfferingRef: 'catalog:demo',
      catalogOfferingRevision: 1,
      source: { ...publicationSource(), documentJson: '{', sourceRevision: '' },
      authorityMode: 'provider_owned',
      actor,
      ...context,
      now: 10,
    }, emptyPorts())
    expect(result).toEqual({ kind: 'refused', reason: 'source_revision_invalid' })
  })
  it('refuses externally supplied prepared publish on invalid source revision', async () => {
    const prepared = await preparedPublication()
    for (const sourceRevision of ['', 'source revision']) {
      const result = await publishPreparedCapabilityCommand({
        businessId: 'business-1',
        prepared: { ...prepared, sourceRevision },
        ...context,
        actor,
        now: 10,
      }, emptyPorts())
      expect(result).toEqual({ kind: 'refused', reason: 'source_revision_invalid' })
    }

    const valid = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared,
      ...context,
      actor,
      now: 10,
    }, emptyPorts())
    expect(valid).toMatchObject({
      kind: 'published',
      sourceRevision: prepared.sourceRevision,
    })
  })
  it('preserves source_invalid from prepared admission mapping', async () => {
    const prepared = await preparedPublication()
    const sourceDescriptorJson = '{'
    const result = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared: {
        ...prepared,
        sourceDescriptorJson,
        sourceDigest: publicationSourceDigest({
          sourceKind: prepared.sourceKind,
          selector: prepared.sourceSelector,
          descriptorJson: sourceDescriptorJson,
        }),
      },
      ...context,
      actor,
      now: 10,
    }, emptyPorts())
    expect(result).toEqual({ kind: 'refused', reason: 'source_invalid' })
  })


  it('requires source-specific transport adapters for prepared publications', async () => {
    const prepared = await preparedPublication()
    const x402Adapter = {
      adapterId: 'x402-fetch:v2',
      config: {
        method: 'POST' as const,
        requestTimeoutMs: 5_000,
        scheme: 'exact' as const,
        network: 'eip155:84532',
        currency: 'USD',
        routeAmountExponent: 2,
        assetAmountExponent: 6,
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002',
      },
    }
    const publish = (material: PreparedPublicationMaterial) => publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared: material,
      ...context,
      actor,
      now: 10,
    }, emptyPorts())
    const x402Http = preparedWithSourceAdapter(
      prepared,
      'x402',
      { resourceUrl: prepared.binding.endpointUrl },
      prepared.binding.adapter,
    )
    const openapiX402 = preparedWithSourceAdapter(
      prepared,
      'openapi_http',
      { path: '/lookup', method: 'post' },
      x402Adapter,
    )
    expect(await publish(x402Http)).toEqual({ kind: 'refused', reason: 'binding_invalid' })
    expect(await publish(openapiX402)).toEqual({ kind: 'refused', reason: 'binding_invalid' })

    const x402X402 = preparedWithSourceAdapter(
      prepared,
      'x402',
      { resourceUrl: prepared.binding.endpointUrl },
      x402Adapter,
    )
    const openapiHttp = preparedWithSourceAdapter(
      prepared,
      'openapi_http',
      { path: '/lookup', method: 'post' },
      prepared.binding.adapter,
    )
    expect((await publish(x402X402)).kind).toBe('published')
    expect((await publish(openapiHttp)).kind).toBe('published')
  })
  it('refuses an ae envelope paired with MCP transport before publication', async () => {
    const prepared = await preparedPublication()
    const mcp = preparedWithSourceAdapter(
      prepared,
      'ae_envelope',
      {},
      {
        adapterId: 'mcp-jsonrpc:v1',
        config: {
          protocolVersion: '2025-06-18',
          toolName: 'lookup',
          requestTimeoutMs: 5_000,
        },
      },
    )
    const ports = emptyPorts()
    const registerContractDocument = vi.spyOn(ports, 'registerContractDocument')
    const scheduleReadinessProbe = vi.spyOn(ports, 'scheduleReadinessProbe')
    const result = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared: mcp,
      ...context,
      actor,
      now: 10,
    }, ports)
    expect(result).toEqual({ kind: 'refused', reason: 'binding_invalid' })
    expect(registerContractDocument).not.toHaveBeenCalled()
    expect(scheduleReadinessProbe).not.toHaveBeenCalled()
  })

  it('refuses an ae envelope paired with x402 transport before publication', async () => {
    const prepared = await preparedPublication()
    const x402 = preparedWithSourceAdapter(
      prepared,
      'ae_envelope',
      {},
      {
        adapterId: 'x402-fetch:v2',
        config: {
          method: 'POST' as const,
          requestTimeoutMs: 5_000,
          scheme: 'exact' as const,
          network: 'eip155:84532',
          currency: 'USD',
          routeAmountExponent: 2,
          assetAmountExponent: 6,
          asset: '0x0000000000000000000000000000000000000001',
          payTo: '0x0000000000000000000000000000000000000002',
        },
      },
    )
    const ports = emptyPorts()
    const registerContractDocument = vi.spyOn(ports, 'registerContractDocument')
    const scheduleReadinessProbe = vi.spyOn(ports, 'scheduleReadinessProbe')
    const result = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared: x402,
      ...context,
      actor,
      now: 10,
    }, ports)
    expect(result).toEqual({ kind: 'refused', reason: 'binding_invalid' })
    expect(registerContractDocument).not.toHaveBeenCalled()
    expect(scheduleReadinessProbe).not.toHaveBeenCalled()
  })

  it('refuses publish on contract identity conflict', async () => {
    const prepared = await preparedPublication()
    const result = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared,
      ...context,
      actor,
      now: 10,
    }, emptyPorts({
      findContractDigest: async () => `sha256:${'b'.repeat(64)}`,
    }))
    expect(result).toEqual({ kind: 'refused', reason: 'contract_identity_conflict' })
  })

  it('replays prepared publish through the operation ledger', async () => {
    const prepared = await preparedPublication()
    const encoded = encodedFor()
    const operationRef = createPublicOperationRef({
      operationId: capabilityOperationId(encoded.contract.ref.capabilityId),
      publicationRef: 'offering:demo:lookup',
      publicationRevision: 1,
      contractRef: encoded.contract.ref,
    })
    const expected = {
      publicationRef: 'offering:demo:lookup',
      publicationRevision: 1,
      operationRef,
      contractRef: encoded.contract.ref,
      offeringId: 'offering:demo:lookup',
      bindingId: 'binding:demo:http',
      runtimeEnvironment: 'sandbox' as const,
      sourceKind: prepared.sourceKind,
      sourceSelector: prepared.sourceSelector,
      sourceRevision: prepared.sourceRevision,
      sourceDigest: prepared.sourceDigest,
      priceDigest: prepared.priceDigest,
      authorityMode: 'provider_owned' as const,
      publisherRef: actor.ref,
      provenanceDigest: capabilityPublicationProvenanceDigest({
        publisherRef: actor.ref,
        authorityMode: 'provider_owned',
        sourceRevision: prepared.sourceRevision,
        sourceDigest: prepared.sourceDigest,
      }),
      lifecycle: {
        state: 'inactive' as const,
        reasons: [
          'admission_unproven' as const,
          'conformance_unproven' as const,
          'credential_readiness_unobserved' as const,
          'health_unobserved' as const,
        ],
      },
    }
    let operation: OperationKeyRecord | null = null
    const first = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared,
      ...context,
      actor,
      now: 10,
    }, emptyPorts({
      insertOperationKey: async ({ requestHash }) => {
        operation = {
          operationId: 'op-row-1',
          requestHash,
          status: 'in_progress',
          effectRefs: [],
        }
        return 'op-row-1'
      },
      markOperationSucceeded: async (_operationId, resultHash, effectRefs) => {
        if (operation === null) throw new Error('missing_operation_fixture')
        operation = { ...operation, resultHash, effectRefs, status: 'succeeded' }
      },
    }))
    expect(first.kind).toBe('published')
    if (operation === null) throw new Error('missing_operation_fixture')
    const registerContract = vi.fn(async () => {
      throw new Error('should_not_register_on_replay')
    })
    const result = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared,
      ...context,
      actor,
      now: 10,
    }, emptyPorts({
      findOperationKey: async () => operation,
      registerContractDocument: registerContract,
    }))
    expect(result).toEqual({ ...expected, kind: 'replayed' })
    expect(registerContract).not.toHaveBeenCalled()
  })

  it('publishes successfully and schedules readiness probe', async () => {
    const insertPublication = vi.fn(async () => {})
    const schedule = vi.fn(async () => {})
    const result = await publishPreparedCapabilityCommand({
      businessId: 'business-1',
      prepared: await preparedPublication(),
      ...context,
      actor,
      now: 10,
    }, emptyPorts({
      insertPublication,
      scheduleReadinessProbe: schedule,
    }))
    expect(result).toMatchObject({
      kind: 'published',
      publicationRef: 'offering:demo:lookup',
      offeringId: 'offering:demo:lookup',
      bindingId: 'binding:demo:http',
    })
    expect(insertPublication).toHaveBeenCalledOnce()
    expect(schedule).toHaveBeenCalledWith('offering:demo:lookup', 1)
  })

  it('commits prepared material without invoking the raw normalizer', async () => {
    const prepared = await preparedPublication()
    const normalizer = vi.spyOn(publicationImporters, 'normalizeCapabilityPublication')
    normalizer.mockImplementation(async () => {
      throw new Error('raw_normalizer_must_not_run')
    })
    try {
      const result = await publishPreparedCapabilityCommand({
        businessId: 'business-1',
        prepared,
        ...context,
        actor,
        now: 10,
      }, emptyPorts())
      expect(result.kind).toBe('published')
      expect(normalizer).not.toHaveBeenCalled()
    } finally {
      normalizer.mockRestore()
    }
  })

  it('refuses refresh when version rules fail', async () => {
    const publication = currentPublication()
    const result = await refreshCapabilityCommand({
      publication,
      source: publicationSource('other.capability.lookup', 1),
      offering: offeringDraft(),
      binding: bindingDraft(),
      ...context,
      now: 10,
    }, emptyPorts())
    expect(result).toEqual({ kind: 'refused', reason: 'refresh_invalid' })
  })

  it('refuses refresh when disposition is not current', async () => {
    const result = await refreshCapabilityCommand({
      publication: currentPublication({ disposition: 'withdrawn' }),
      source: publicationSource(),
      offering: offeringDraft(),
      binding: bindingDraft(),
      ...context,
      now: 10,
    }, emptyPorts())
    expect(result).toEqual({ kind: 'refused', reason: 'revision_changed' })
  })

  it('refreshes incompatible when schemas diverge', async () => {
    const publication = currentPublication()
    const previous = encodedFor(publication.capabilityId, publication.version)
    const nextSource = {
      ...publicationSource(publication.capabilityId, publication.version + 1),
      documentJson: JSON.stringify(capabilityContractV2({
        capabilityId: publication.capabilityId,
        version: publication.version + 1,
        name: 'Demo lookup',
        inputSchema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: { request: { type: 'string', minLength: 2 } },
          required: ['request'],
          additionalProperties: false,
        },
      })),
    }
    const insertPublication = vi.fn(async () => {})
    const result = await refreshCapabilityCommand({
      publication,
      source: nextSource,
      offering: offeringDraft('next'),
      binding: bindingDraft('next'),
      ...context,
      now: 10,
    }, emptyPorts({
      getExactRegisteredContract: async () => ({
        kind: 'found',
        contract: previous.contract,
        registeredAt: 1,
      }),
      ...supplyRows(publication),
      insertPublication,
    }))
    expect(result).toMatchObject({
      kind: 'refreshed',
      disposition: 'incompatible',
      revision: 2,
    })
    expect(insertPublication).toHaveBeenCalledWith(expect.objectContaining({
      disposition: 'incompatible',
      revision: 2,
    }))
  })

  it('refreshes compatible and schedules readiness probe', async () => {
    const publication = currentPublication()
    const prepared = await preparedPublication(publication.capabilityId, publication.version)
    const encoded = encodedFor(publication.capabilityId, publication.version)
    const schedule = vi.fn(async () => {})
    const insertPublication = vi.fn(async () => {})
    const result = await refreshCapabilityCommand({
      publication,
      source: publicationSource(publication.capabilityId, publication.version),
      offering: offeringDraft(),
      binding: bindingDraft(),
      ...context,
      now: 10,
    }, emptyPorts({
      getExactRegisteredContract: async () => ({
        kind: 'found',
        contract: encoded.contract,
        registeredAt: 1,
      }),
      ...supplyRows(publication),
      scheduleReadinessProbe: schedule,
      insertPublication,
      registerContractDocument: async () => ({
        kind: 'registered',
        ref: encoded.contract.ref,
        created: false,
      }),
    }))
    expect(result).toMatchObject({
      kind: 'refreshed',
      disposition: 'current',
      revision: 2,
    })
    expect(schedule).toHaveBeenCalledWith(publication.publicationRef, 2)

    const normalized = await publicationImporters.normalizeCapabilityPublication(
      publicationSource(publication.capabilityId, publication.version),
    )
    if (normalized.kind !== 'normalized') throw new Error(`refresh_fixture_refused:${normalized.reason}`)
    expect(prepared.sourceDigest).not.toBe(normalized.draft.source.descriptorDigest)
    expect(insertPublication).toHaveBeenCalledWith(expect.objectContaining({
      provenanceDigest: capabilityPublicationProvenanceDigest({
        publisherRef: publication.publisherRef,
        authorityMode: publication.authorityMode,
        sourceRevision: publication.sourceRevision,
        sourceDigest: prepared.sourceDigest,
      }),
    }))
  })

  it('refuses withdraw when disposition is not current', async () => {
    const result = await withdrawCapabilityCommand({
      publication: currentPublication({ disposition: 'withdrawn' }),
      evidenceRefs: context.evidenceRefs,
      now: 10,
    }, emptyPorts())
    expect(result).toEqual({ kind: 'refused', reason: 'revision_changed' })
  })

  it('withdraws by revoking eligibility and patching disposition', async () => {
    const publication = currentPublication()
    const setEligibility = vi.fn(async () => ({
      kind: 'ineligible' as const,
      offeringId: publication.offeringId,
      bindingId: publication.bindingId,
      eligibilityHash: digest,
      offeringEligibilityHash: digest,
      bindingEligibilityHash: digest,
      transition: {
        offeringBefore: 'active' as const,
        offeringAfter: 'inactive' as const,
        bindingBefore: 'admitted:conformant' as const,
        bindingAfter: 'not_admitted:not_conformant' as const,
      },
    }))
    const patchWithdrawn = vi.fn(async () => {})
    const result = await withdrawCapabilityCommand({
      publication,
      evidenceRefs: context.evidenceRefs,
      now: 10,
    }, emptyPorts({
      ...supplyRows(publication),
      setEligibility,
      patchPublicationWithdrawn: patchWithdrawn,
    }))
    expect(result).toEqual({
      kind: 'withdrawn',
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      lifecycle: { state: 'withdrawn', reasons: ['withdrawn'] },
    })
    expect(setEligibility).toHaveBeenCalledWith(expect.objectContaining({
      offeringId: publication.offeringId,
      bindingId: publication.bindingId,
      decision: 'revoke',
      admissionEvidenceRefs: context.evidenceRefs,
      conformanceEvidenceRefs: context.evidenceRefs,
    }), 10)
    expect(patchWithdrawn).toHaveBeenCalledWith(publication.id, 10)
  })
  it('refuses republish for a foreign owner before reading effects', async () => {
    const fixture = await republishFixture()
    const result = await republishPreparedCapabilityCommand(republishInput(fixture, {
      actor: { kind: 'owner', ref: 'owner-2' },
    }), republishPorts(fixture))
    expect(result).toEqual({ kind: 'refused', reason: 'authorization_denied' })
  })

  it('refuses republish when the withdrawn revision is no longer current', async () => {
    const fixture = await republishFixture()
    const result = await republishPreparedCapabilityCommand(republishInput(fixture, {
      publication: { ...fixture.publication, revision: 2 },
    }), republishPorts(fixture))
    expect(result).toEqual({ kind: 'refused', reason: 'revision_changed' })
  })

  it('refuses republish of a non-withdrawn publication', async () => {
    const fixture = await republishFixture()
    const result = await republishPreparedCapabilityCommand(republishInput(fixture, {
      publication: { ...fixture.publication, disposition: 'current' },
    }), republishPorts(fixture))
    expect(result).toEqual({ kind: 'refused', reason: 'revision_changed' })
  })

  it('refuses republish when persisted source or pricing material drifts', async () => {
    const fixture = await republishFixture()
    const sourceResult = await republishPreparedCapabilityCommand(republishInput(fixture, {
      prepared: { ...fixture.prepared, sourceDescriptorJson: `${fixture.prepared.sourceDescriptorJson} ` },
    }), republishPorts(fixture))
    expect(sourceResult).toEqual({ kind: 'refused', reason: 'source_invalid' })

    const pricingResult = await republishPreparedCapabilityCommand(republishInput(fixture, {
      prepared: { ...fixture.prepared, priceDigest: `sha256:${'b'.repeat(64)}` },
    }), republishPorts(fixture))
    expect(pricingResult).toEqual({ kind: 'refused', reason: 'pricing_config_invalid' })
  })

  it('refuses republish when authority snapshot no longer matches', async () => {
    const fixture = await republishFixture()
    const { connectionAuthority: _connectionAuthority, ...tampered } = fixture.publication
    const result = await republishPreparedCapabilityCommand(republishInput(fixture, {
      publication: tampered,
    }), republishPorts(fixture, {
      loadPublicationAtRevision: async (_publicationRef, revision) => revision === 1 ? tampered : null,
    }))
    expect(result).toEqual({ kind: 'refused', reason: 'connection_authority_stale' })
  })

  it('refuses republish when the next revision already exists or its operation key conflicts', async () => {
    const fixture = await republishFixture()
    const next = currentPublication({ revision: 2, disposition: 'current' })
    const nextResult = await republishPreparedCapabilityCommand(republishInput(fixture), republishPorts(fixture, {
      loadPublicationAtRevision: async (_publicationRef, revision) => revision === 1 ? fixture.publication : next,
    }))
    expect(nextResult).toEqual({ kind: 'refused', reason: 'revision_changed' })

    const conflictResult = await republishPreparedCapabilityCommand(republishInput(fixture), republishPorts(fixture, {
      findOperationKey: async () => ({
        operationId: 'operation:conflict',
        requestHash: digest,
        status: 'in_progress',
        effectRefs: [],
      }),
    }))
    expect(conflictResult).toEqual({ kind: 'refused', reason: 'operation_key_conflict' })
  })

  it('republishes as revision plus one with a fresh binding and readiness', async () => {
    const fixture = await republishFixture()
    const insertPublication = vi.fn(async () => {})
    const scheduleReadiness = vi.fn(async () => {})
    const registerBinding = vi.fn(async () => ({
      kind: 'registered' as const,
      bindingId: fixture.binding.bindingId,
      registrationHash: fixture.binding.registrationHash,
      created: true,
    }))
    const result = await republishPreparedCapabilityCommand(republishInput(fixture), republishPorts(fixture, {
      insertPublication,
      scheduleReadinessProbe: scheduleReadiness,
      registerBinding,
    }))
    expect(result).toMatchObject({
      kind: 'published',
      publicationRef: fixture.publication.publicationRef,
      publicationRevision: 2,
      bindingId: `${fixture.binding.bindingId}:revision:2`,
      lifecycle: { state: 'inactive' },
    })
    expect(insertPublication).toHaveBeenCalledWith(expect.objectContaining({
      publicationRef: fixture.publication.publicationRef,
      revision: 2,
      disposition: 'current',
      supersedesRevision: 1,
      bindingId: `${fixture.binding.bindingId}:revision:2`,
    }))
    if ('reason' in result) throw new Error(`republish_fixture_refused:${result.reason}`)
    expect(registerBinding).toHaveBeenCalledWith(expect.objectContaining({
      bindingId: `${fixture.binding.bindingId}:revision:2`,
    }), 10, result.operationRef)
    expect(scheduleReadiness).toHaveBeenCalledWith(fixture.publication.publicationRef, 2)
    expect(fixture.publication.disposition).toBe('withdrawn')
  })

  it('replays republish without registering or inserting a second revision', async () => {
    const fixture = await republishFixture()
    let operation: OperationKeyRecord | null = null
    const first = await republishPreparedCapabilityCommand(republishInput(fixture), republishPorts(fixture, {
      insertOperationKey: async ({ requestHash }) => {
        operation = {
          operationId: 'operation:republish',
          requestHash,
          status: 'in_progress',
          effectRefs: [],
        }
        return 'operation:republish'
      },
      markOperationSucceeded: async (_operationId, resultHash, effectRefs) => {
        if (operation === null) throw new Error('missing_operation_fixture')
        operation = { ...operation, resultHash, effectRefs, status: 'succeeded' }
      },
    }))
    expect(first.kind).toBe('published')
    if (operation === null) throw new Error('missing_operation_fixture')
    const registerContract = vi.fn(async () => {
      throw new Error('replay_must_not_register')
    })
    const replay = await republishPreparedCapabilityCommand(republishInput(fixture), republishPorts(fixture, {
      findOperationKey: async () => operation,
      registerContractDocument: registerContract,
    }))
    expect(replay).toMatchObject({
      kind: 'replayed',
      publicationRevision: 2,
      bindingId: `${fixture.binding.bindingId}:revision:2`,
    })
    expect(registerContract).not.toHaveBeenCalled()
  })
})
