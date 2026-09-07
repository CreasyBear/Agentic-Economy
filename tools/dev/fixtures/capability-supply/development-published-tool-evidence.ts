import { defineCapabilityContract } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import {
  createProviderConnection,
  issueProviderConnectionLease,
  providerConnectionAuthorityDigest,
  type IssueProviderConnectionLeaseCommand,
  type ProviderConnection,
  type ProviderConnectionCallLease,
} from '@/modules/capability-supply/provider-connection'
import { pricingConfigDigest } from '@/modules/money/public'
import {
  admitRegisteredTransport,
  capabilityBindingRegistrationHash,
  capabilityOfferingRegistrationHash,
  capabilityToolId,
  connectionAuthoritySnapshotFromProviderConnection,
  connectionAuthoritySnapshotsEqual,
  createPublicToolRef,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
  type CapabilityConnectionAuthoritySnapshot,
  type PublishedTool,
} from '@/modules/capability-supply/public'
import {
  materializePublishedTool,
  materializeRuntimePublishedTool,
  type RuntimePublishedToolDescriptor,
} from '@/modules/capability-supply/published-tool'
import type { SuppliedCandidateQualification } from '@/modules/capability-supply/server'

const observedAt = Date.parse('2026-07-19T08:00:00.000Z')
const validUntil = observedAt + 300_000
const endpointPath = '/x402/v3/cryptocurrency/quotes/latest'
const expectedPayment = {
  network: 'eip155:8453',
  asset: '0xmock-usdc',
  payTo: '0xmock-provider-recipient',
  currency: 'USD',
} as const
const pricingConfig = {
  version: 'pricing:v3' as const,
  kind: 'fixed_aud' as const,
  currency: 'AUD' as const,
  exponent: 6 as const,
  amountUnits: '1000000',
}
function developmentProviderAccountRef(providerRef: string): string {
  return `account:${providerRef.replace(/^provider:/u, '')}`
}

function developmentProviderCredentialRef(providerRef: string): string {
  return `env:${providerRef.replace(/^provider:/u, '').replace(/[^A-Za-z0-9]+/gu, '_').toUpperCase()}_SECRET`
}

export function developmentProviderConnectionAuthorityDigest(input: Readonly<{
  connectionRef: string
  businessId: string
  providerRef: string
  adapterId: string
  grantedScopes?: readonly string[]
  grantedResources?: readonly string[]
}>): string {
  return providerConnectionAuthorityDigest({
    connectionRef: input.connectionRef,
    owningAccountRef: 'account:development',
    installedByPrincipalRef: 'principal:development',
    authorityGrantRef: 'grant:development-provider',
    authorityGrantGeneration: 1,
    businessId: input.businessId,
    providerRef: input.providerRef,
    providerAccountRef: developmentProviderAccountRef(input.providerRef),
    adapterId: input.adapterId,
    credentialRef: developmentProviderCredentialRef(input.providerRef),
    secretRef: developmentProviderCredentialRef(input.providerRef),
    grantedScopes: input.grantedScopes ?? [],
    grantedResources: input.grantedResources ?? [],
    authorityGeneration: 1,
  })
}

function createDevelopmentProviderConnection(input: Readonly<{
  connectionRef: string
  businessId: string
  providerRef: string
  adapterId: string
  grantedScopes: readonly string[]
  grantedResources: readonly string[]
  observedAt: number
}>): ProviderConnection {
  const result = createProviderConnection({
    commandId: `command:create:${input.connectionRef}`,
    connectionRef: input.connectionRef,
    owningAccountRef: 'account:development',
    installedByPrincipalRef: 'principal:development',
    authorityGrantRef: 'grant:development-provider',
    authorityGrantGeneration: 1,
    secretRef: developmentProviderCredentialRef(input.providerRef),
    businessId: input.businessId,
    providerRef: input.providerRef,
    providerAccountRef: developmentProviderAccountRef(input.providerRef),
    adapterId: input.adapterId,
    credentialRef: developmentProviderCredentialRef(input.providerRef),
    requestedScopes: [...input.grantedScopes],
    grantedScopes: [...input.grantedScopes],
    requestedResources: [...input.grantedResources],
    grantedResources: [...input.grantedResources],
    evidenceRefs: ['mock:evidence:provider-connection'],
  }, input.observedAt)
  if ('code' in result) {
    throw new Error(`development_provider_connection_invalid:${result.code}`)
  }
  return result.connection
}

export function createDevelopmentProviderConnectionAuthority(input: Readonly<{
  connectionRef: string
  businessId: string
  providerRef: string
  adapterId: string
  toolRef: string
  grantedScopes: readonly string[]
  grantedResources: readonly string[]
  observedAt: number
}>): CapabilityConnectionAuthoritySnapshot {
  return connectionAuthoritySnapshotFromProviderConnection(
    createDevelopmentProviderConnection(input),
    input.toolRef,
  )
}

export function createDevelopmentProviderLeaseIssuer(
  tool: PublishedTool,
  now: number,
) {
  const authority = tool.connectionAuthority
  if (authority === undefined) throw new Error('development_provider_connection_authority_missing')
  const connection = createDevelopmentProviderConnection({
    connectionRef: authority.connectionRef,
    businessId: tool.identity.businessId,
    providerRef: authority.providerRef,
    adapterId: authority.adapterId,
    grantedScopes: authority.grantedScopes,
    grantedResources: authority.grantedResources,
    observedAt: tool.readiness.observedAt,
  })
  const expectedAuthority = connectionAuthoritySnapshotFromProviderConnection(
    connection,
    authority.toolRef,
  )
  if (!connectionAuthoritySnapshotsEqual(authority, expectedAuthority)) {
    throw new Error('development_provider_connection_authority_mismatch')
  }
  const leases = new Map<string, ProviderConnectionCallLease>()
  return async (input: Readonly<{
    callRef: string
    attemptRef: string
    effectGeneration: number
    authorityRef: string
    expiresAt: number
  }>) => {
    const leaseRef = `lease:${input.callRef}:${input.attemptRef}:${input.effectGeneration}`
    const decisionRef = `decision:${connection.connectionRef}`
    const approval = {
      decisionRef,
      decisionDigest: canonicalDigest({
        decisionRef,
        connectionRef: connection.connectionRef,
        providerRef: connection.providerRef,
        providerAccountRef: connection.providerAccountRef,
        authorityGeneration: connection.authorityGeneration,
        authorityDigest: connection.authorityDigest,
        grantedScopes: connection.grantedScopes,
        grantedResources: connection.grantedResources,
        decision: 'granted',
      }),
      providerRef: connection.providerRef,
      providerAccountRef: connection.providerAccountRef,
      connectionRef: connection.connectionRef,
      authorityGeneration: connection.authorityGeneration,
      connectionAuthorityDigest: connection.authorityDigest,
      decision: 'granted' as const,
      grantedScopes: connection.grantedScopes,
      grantedResources: connection.grantedResources,
    }
    const leaseMs = Math.min(
      30_000,
      input.expiresAt - now,
      tool.readiness.validUntil - now,
    )
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 100) {
      throw new Error('development_provider_lease_window_invalid')
    }
    const command: IssueProviderConnectionLeaseCommand = {
      commandId: `command:lease:${input.callRef}:${input.attemptRef}:${input.effectGeneration}`,
      leaseRef,
      callRef: input.callRef,
      toolRef: authority.toolRef,
      connectionRef: connection.connectionRef,
      providerRef: connection.providerRef,
      providerAccountRef: connection.providerAccountRef,
      adapterId: connection.adapterId,
      expectedAuthorityGeneration: connection.authorityGeneration,
      expectedAuthorityDigest: connection.authorityDigest,
      requestedScopes: connection.grantedScopes,
      grantedScopes: connection.grantedScopes,
      requestedResources: connection.grantedResources,
      grantedResources: connection.grantedResources,
      approval,
      readinessValidUntil: tool.readiness.validUntil,
      readinessDigest: tool.readiness.qualificationDigest,
      leaseMs,
      evidenceRefs: [...tool.readiness.evidenceRefs],
      activeAccountRef: connection.owningAccountRef,
      actorPrincipalRef: connection.installedByPrincipalRef,
      grantRef: connection.authorityGrantRef,
      grantGeneration: connection.authorityGrantGeneration,
    }
    const result = issueProviderConnectionLease(
      connection,
      command,
      now,
      leases.get(leaseRef),
    )
    if (result.kind === 'refused') {
      throw new Error(`development_provider_lease_refused:${result.code}`)
    }
    leases.set(leaseRef, result.lease)
    return {
      leaseRef: result.lease.leaseRef,
      callRef: result.lease.callRef,
      toolRef: result.lease.toolRef,
      grantedScopes: result.lease.grantedScopes,
      grantedResources: result.lease.grantedResources,
      readinessValidUntil: result.lease.readinessValidUntil,
      ...(result.lease.readinessDigest === undefined
        ? {}
        : { readinessDigest: result.lease.readinessDigest }),
    }
  }
}

const priceDigest = pricingConfigDigest(pricingConfig)
const claimCeiling =
  'Fixture and labelled local development evidence only; no execution or host parity, no hosted route, independent provider, settlement, fulfilment, production safety, or customer value.'

function requirePublishedFixture<T>(value: T | undefined, errorCode: string): T {
  if (value === undefined) throw new Error(errorCode)
  return value
}

const developmentPublishedEndpointCards = [
  { method: 'GET', path: endpointPath, summary: 'Latest cryptocurrency quotes' },
  { method: 'GET', path: '/x402/v3/cryptocurrency/map', summary: 'Cryptocurrency identifiers' },
  { method: 'GET', path: '/x402/v3/fiat/map', summary: 'Fiat currency identifiers' },
  { method: 'GET', path: '/x402/v3/tools/price-conversion', summary: 'Price conversion' },
  { method: 'POST', path: '/x402/v3/key/info', summary: 'API key information' },
] as const

export function buildDevelopmentPublishedToolEvidence() {
  const contract = defineCapabilityContract({
    contractFormat: 'ae.capability-contract:v2',
    capabilityId: 'cryptocurrency.quotes.latest',
    version: 1,
    name: 'Latest cryptocurrency quotes',
    description: 'Returns the latest quote for declared symbols and conversion currency.',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        symbol: { type: 'string', enum: ['BTC'] },
        convert: { type: 'string', enum: ['USD'] },
      },
      required: ['symbol', 'convert'],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            BTC: {
              type: 'object',
              properties: {
                symbol: { type: 'string', enum: ['BTC'] },
                quote: {
                  type: 'object',
                  properties: {
                    USD: {
                      type: 'object',
                      properties: {
                        price: { type: 'number', exclusiveMinimum: 0 },
                        last_updated: { type: 'string', format: 'date-time' },
                      },
                      required: ['price', 'last_updated'],
                      additionalProperties: false,
                    },
                  },
                  required: ['USD'],
                  additionalProperties: false,
                },
              },
              required: ['symbol', 'quote'],
              additionalProperties: false,
            },
          },
          required: ['BTC'],
          additionalProperties: false,
        },
      },
      required: ['data'],
      additionalProperties: false,
    },
    customerAnnotations: [
      { annotationId: 'symbol', document: 'input', pointer: '/symbol', label: 'Symbol', role: 'request' },
      { annotationId: 'convert', document: 'input', pointer: '/convert', label: 'Currency', role: 'constraint' },
      { annotationId: 'data', document: 'output', pointer: '/data', label: 'Quote data', role: 'completion_evidence' },
    ],
    dataUse: [
      {
        effectId: 'query_release', inputPointer: '/symbol', classification: 'public',
        phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_quote'],
      },
      {
        effectId: 'query_release', inputPointer: '/convert', classification: 'public',
        phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['retrieve_quote'],
      },
    ],
    effects: [
      {
        effectId: 'query_release', class: 'data_release',
        authority: 'mandate_or_explicit', reversibility: 'irreversible',
      },
      {
        effectId: 'payment_release', class: 'financial_exposure',
        authority: 'mandate_or_explicit', reversibility: 'irreversible',
      },
    ],
    evidence: [{ evidenceId: 'data', outputPointer: '/data', purpose: 'completion' }],
    lifecycle: { idempotency: 'required', recovery: 'reconcile_required' },
  })
  const offering = defineCapabilityOfferingRegistration({
    offeringId: 'mock:offering:crypto-quotes',
    businessId: 'mock:business:published-api',
    networkId: 'mock:network:development',
    contractRef: contract.ref,
    presentation: {
      label: 'Latest cryptocurrency quotes',
      summary: 'MOCK/DEVELOPMENT ONLY published endpoint.',
      price: {
        kind: 'fixed',
        amount: { currency: 'AUD', units: '1000000', exponent: 6 },
      },
      materialTerms: [{ termId: 'mock:term:fixture', label: 'Environment', value: 'MOCK/DEVELOPMENT ONLY' }],
      commercialRelationship: {
        kind: 'none', summary: 'Fixture only.', influencesEligibility: false,
        influencesInclusion: false, influencesOrder: false,
        evidenceRefs: ['mock:evidence:commercial'],
      },
    },
    searchTerms: ['cryptocurrency', 'quotes'],
    registrationEvidenceRefs: ['mock:evidence:offering'],
  })
  const config = {
    method: 'GET',
    query: [
      { inputPointer: '/symbol', parameter: 'symbol' },
      { inputPointer: '/convert', parameter: 'convert' },
    ],
    requestTimeoutMs: 5_000,
    scheme: 'exact',
    network: 'eip155:8453',
    currency: 'USD',
    routeAmountExponent: 2,
    assetAmountExponent: 6,
    asset: '0xmock-usdc',
    payTo: '0xmock-provider-recipient',
    paymentRequiredJson: stableStringify({
      x402Version: 2,
      resource: {
        url: `https://provider.example${endpointPath}`,
      },
      accepts: [{
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '10000',
        asset: '0xmock-usdc',
        payTo: '0xmock-provider-recipient',
        maxTimeoutSeconds: 60,
        extra: {},
      }],
    } as StableHashValue),
  } as const
  const binding = defineCapabilityTransportBindingRegistration({
    bindingId: 'mock:binding:crypto-quotes',
    offeringId: offering.offeringId,
    networkId: offering.networkId,
    contractRef: contract.ref,
    endpointUrl: `https://provider.example${endpointPath}`,
    authority: {
      kind: 'provider_connection',
      connectionRef: 'connection:mock-provider',
      providerRef: 'provider:mock-provider',
    },
    continuation: { kind: 'single_response', evidenceRefs: ['mock:evidence:continuation'] },
    cancellation: { kind: 'unsupported', evidenceRefs: ['mock:evidence:cancellation'] },
    adapter: { adapterId: 'x402-fetch:v2', config },
    registrationEvidenceRefs: ['mock:evidence:binding'],
  })
  const admission = admitRegisteredTransport({
    adapterId: binding.adapter.adapterId,
    endpointUrl: binding.endpointUrl,
    authority: binding.authority,
    continuation: binding.continuation,
    cancellation: binding.cancellation,
    config: binding.adapter.config,
  })
  if (admission.kind !== 'admitted') throw new Error(admission.reason)
  const offeringDigest = capabilityOfferingRegistrationHash(offering)
  const bindingDigest = capabilityBindingRegistrationHash(binding, admission.transport)
  const qualification: SuppliedCandidateQualification = {
    kind: 'supplied_candidate_qualification',
    environment: 'SOURCE-OWNED DEVELOPMENT EVIDENCE',
    candidate: {
      publicationRef: 'mock:publication:published-api',
      revision: 7,
      networkId: offering.networkId,
      businessId: offering.businessId,
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      contractRef: contract.ref,
    },
    status: 'eligible',
    reasons: [],
    observedAt,
    validUntil,
    qualificationDigest: canonicalDigest({ fixture: 'qualification' }),
    sources: [
      {
        kind: 'publication', ref: 'mock:publication:published-api@7',
        digest: canonicalDigest({ fixture: 'publication' }), evidenceRefs: ['mock:evidence:publication'],
      },
      {
        kind: 'contract', ref: 'contract:cryptocurrency.quotes.latest@1',
        digest: contract.ref.contractDigest, evidenceRefs: ['mock:evidence:contract'],
      },
      {
        kind: 'offering', ref: `offering:${offering.offeringId}`,
        digest: offeringDigest, evidenceRefs: ['mock:evidence:offering'],
      },
      {
        kind: 'binding', ref: `binding:${binding.bindingId}`,
        digest: bindingDigest, evidenceRefs: ['mock:evidence:binding'],
      },
      {
        kind: 'readiness', ref: 'readiness:mock:publication:published-api@7',
        digest: canonicalDigest({ status: 402, observedAt }), evidenceRefs: ['mock:evidence:fresh-402'],
      },
    ],
  }
  const publicationSource = requirePublishedFixture(
    qualification.sources[0],
    'published_operation_source_missing',
  )
  const toolRef = createPublicToolRef({
    operationId: capabilityToolId(contract.ref.capabilityId),
    publicationRef: qualification.candidate.publicationRef,
    publicationRevision: qualification.candidate.revision,
    contractRef: contract.ref,
  })
  const connectionAuthority = binding.authority.kind === 'provider_connection'
    ? createDevelopmentProviderConnectionAuthority({
        connectionRef: binding.authority.connectionRef,
        businessId: offering.businessId,
        providerRef: binding.authority.providerRef,
        adapterId: binding.adapter.adapterId,
        toolRef,
        grantedScopes: [],
        grantedResources: [],
        observedAt,
      })
    : undefined
  const tool = materializePublishedTool({
    publication: {
      publicationRef: qualification.candidate.publicationRef,
      revision: qualification.candidate.revision,
      businessId: qualification.candidate.businessId,
      runtimeEnvironment: 'sandbox',
      sourceDigest: publicationSource.digest,
      pricingConfig,
      priceDigest,
      readinessObservedAt: observedAt,
      readinessValidUntil: validUntil,
      readinessEvidenceRefs: ['mock:evidence:fresh-402'],
    },
    contract,
    offering,
    binding,
    admittedTransport: admission.transport,
    qualification,
    ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
    usageObservation: {
      window: { kind: 'rolling', days: 30 },
      calls: 8,
      distinctPayers: 2,
      observedAt,
      source: 'mock:provider-attributed-usage-export',
      evidenceRefs: ['mock:evidence:usage-export'],
    },
  })
  return {
    environment: 'MOCK/DEVELOPMENT ONLY' as const,
    discovery: developmentPublishedEndpointCards,
    tool,
    descriptor: materializeRuntimePublishedTool(tool),
    sourceMaterial: {
      publication: {
        publicationRef: qualification.candidate.publicationRef,
        revision: qualification.candidate.revision,
        businessId: qualification.candidate.businessId,
        runtimeEnvironment: 'sandbox' as const,
        sourceDigest: publicationSource.digest,
        pricingConfig,
        priceDigest,
        readinessObservedAt: observedAt,
        readinessValidUntil: validUntil,
        readinessEvidenceRefs: ['mock:evidence:fresh-402'],
      },
      contract,
      offering,
      binding,
      admittedTransport: admission.transport,
      ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
      qualification,
      ...(tool.usageObservation === undefined
        ? {}
        : { usageObservation: tool.usageObservation }),
    },
    readinessObservation: { status: 402, observedAt, validUntil, evidenceRef: 'mock:evidence:fresh-402' },
    usageLabel: '8 calls · 2 distinct payers · rolling 30 days',
    claimCeiling,
  }
}
export function projectDevelopmentPublishedToolEvidence<
  T extends { readonly descriptor: RuntimePublishedToolDescriptor },
>(fixture: T) {
  const { descriptor, ...material } = fixture
  const {
    validateInput: _validateInput,
    validateOutput: _validateOutput,
    ...serializableDescriptor
  } = descriptor
  return { ...material, descriptor: serializableDescriptor }
}


export function verifyDevelopmentPublishedToolEvidence(
  packet: ReturnType<typeof buildDevelopmentPublishedToolEvidence>,
): void {
  let rebuilt
  try {
    rebuilt = materializePublishedTool(packet.sourceMaterial)
  } catch {
    throw new Error('development_published_tool_evidence_invalid')
  }
  const descriptor = materializeRuntimePublishedTool(rebuilt)
  const expectedDiscoveryDigest = canonicalDigest(developmentPublishedEndpointCards)
  const actualDiscoveryDigest = canonicalDigest(packet.discovery)
  const toolDigest = canonicalDigest(packet.tool)
  const rebuiltDigest = canonicalDigest(rebuilt)
  const descriptorDigest = runtimeDescriptorDigest(packet.descriptor)
  const rebuiltDescriptorDigest = runtimeDescriptorDigest(descriptor)
  if (packet.discovery.length !== 5
    || actualDiscoveryDigest !== expectedDiscoveryDigest
    || toolDigest !== rebuiltDigest
    || packet.tool.materialDigest !== rebuilt.materialDigest
    || descriptorDigest !== rebuiltDescriptorDigest
    || packet.tool.identity.endpoint.resource !== `GET ${endpointPath}`
    || packet.tool.identity.price.kind !== 'fixed'
    || packet.tool.identity.price.amount.currency !== 'AUD'
    || packet.tool.identity.price.amount.units !== '1000000'
    || packet.tool.identity.price.amount.exponent !== 6
    || packet.tool.identity.payment.kind !== 'x402'
    || packet.tool.identity.payment.network !== expectedPayment.network
    || packet.tool.identity.payment.asset !== expectedPayment.asset
    || packet.tool.identity.payment.payTo !== expectedPayment.payTo
    || packet.tool.identity.payment.currency !== expectedPayment.currency
    || packet.tool.transport.configDigest
      !== canonicalDigest(JSON.parse(packet.tool.transport.configJson))
    || packet.readinessObservation.status !== 402
    || packet.readinessObservation.observedAt !== observedAt
    || packet.readinessObservation.validUntil !== validUntil
    || packet.tool.readiness.observedAt !== packet.readinessObservation.observedAt
    || packet.tool.readiness.validUntil !== packet.readinessObservation.validUntil
    || packet.tool.usageObservation?.calls !== 8
    || packet.tool.usageObservation.distinctPayers !== 2
    || packet.tool.usageObservation.window.days !== 30
    || packet.tool.usageObservation.observedAt !== observedAt
    || packet.usageLabel !== '8 calls · 2 distinct payers · rolling 30 days'
    || packet.claimCeiling !== claimCeiling
    || packet.descriptor.retryClass !== 'reconcile_before_retry'
    || packet.descriptor.authorityRequirement !== 'principal'
    || !packet.descriptor.validateInput({ symbol: 'BTC', convert: 'USD' })
    || packet.descriptor.validateInput({ symbol: 'ETH', convert: 'USD' })
    || packet.descriptor.validateInput({ symbol: 'BTC', convert: 'EUR' })
    || packet.descriptor.validateInput({ symbol: 'BTC', convert: 'USD', method: 'POST' })) {
    throw new Error('development_published_tool_evidence_invalid')
  }
}

function runtimeDescriptorDigest(
  descriptor: ReturnType<typeof materializeRuntimePublishedTool>,
): string {
  return canonicalDigest({
    id: descriptor.id,
    version: descriptor.version,
    name: descriptor.name,
    summary: descriptor.summary,
    inputSchema: descriptor.inputSchema,
    outputSchema: descriptor.outputSchema,
    consequenceClass: descriptor.consequenceClass,
    authorityRequirement: descriptor.authorityRequirement,
    retryClass: descriptor.retryClass,
    materialInputPointers: descriptor.materialInputPointers,
    dataUse: descriptor.dataUse,
    effects: descriptor.effects,
    evidence: descriptor.evidence,
    safeContinuations: descriptor.safeContinuations,
    price: descriptor.price,
    target: descriptor.target,
  })
}
