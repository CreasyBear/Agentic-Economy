import { validateJsonSchema, type CapabilityContractDocument } from '@/modules/capability-contract/public'
import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import {
  connectionAuthoritySnapshotMatches,
  connectionAuthoritySnapshotsEqual,
  type CapabilityConnectionAuthoritySnapshot,
} from '../binding'
import { bindingIntegrityIsValid } from '../binding/integrity'
import { contractRefFromRow } from '../offering/registration'
import { offeringIntegrityIsValid } from '../offering/integrity'
import type { CapabilityTransportBindingRegistration } from '@/modules/capability-supply/public'
import {
  parseHttpJsonTransportConfiguration,
  parseMcpJsonRpcTransportConfiguration,
  parseX402FetchTransportConfiguration,
  readHttpJsonProbeConfiguration,
  validPublicHttpsEndpoint,
} from '../transport-adapters'

import type { CapabilityGraphPorts } from './ports'
import { probeTargetDigest } from './probe-digest'

type CapabilityProbeConnectionAuthority = Omit<
  CapabilityConnectionAuthoritySnapshot,
  'grantedScopes' | 'grantedResources'
> & Readonly<{
  grantedScopes: string[]
  grantedResources: string[]
}>

export type CapabilityProbeTargetUnavailableReason =
  | 'publication_missing'
  | 'publication_stale'
  | 'offering_invalid'
  | 'binding_invalid'
  | 'contract_missing'
  | 'input_unrepresentable'
  | 'mcp_tool_missing'
  | 'effectful_probe_unsupported'
  | 'authority_stale'
  | 'target_not_public'

type CapabilityProbeTargetBase = Readonly<{
  publicationRef: string
  revision: number
  bindingId: string
  capabilityId: string
  endpointUrl: string
  adapterId: string
  probeKind: 'ae_quote' | 'openapi_http' | 'mcp' | 'x402'
  probeQuery: Array<{ parameter: string; value: string }>
  probeMethod: 'GET' | 'POST'
  transportConfigJson: string
  probeInputJson?: string
  outputSchemaJson?: string
  expectedPaymentJson?: string
  targetDigest: string
}>

export type CapabilityProbeTarget = Readonly<
  | CapabilityProbeTargetBase & Readonly<{
      authority: Extract<CapabilityTransportBindingRegistration['authority'], { kind: 'keyless' }>
    }>
  | CapabilityProbeTargetBase & Readonly<{
      authority: Extract<CapabilityTransportBindingRegistration['authority'], { kind: 'provider_connection' }>
      connectionAuthority: CapabilityProbeConnectionAuthority
    }>
>

export type ReadCapabilityProbeTargetResult =
  | Readonly<{
      kind: 'unavailable'
      reason: CapabilityProbeTargetUnavailableReason
      evidenceRefs: readonly string[]
    }>
  | Readonly<{ kind: 'available'; target: CapabilityProbeTarget }>

export async function readCapabilityProbeTarget(
  ports: CapabilityGraphPorts,
  args: Readonly<{ publicationRef: string; expectedRevision: number }>,
): Promise<ReadCapabilityProbeTargetResult> {
  const publication = await ports.loadPublicationAtRevision(args.publicationRef, args.expectedRevision)
  if (publication === null) {
    return unavailable('publication_missing')
  }
  if (publication.disposition !== 'current') {
    return unavailable('publication_stale')
  }
  const [offering, binding, business, contract] = await Promise.all([
    ports.loadOfferingByOfferingId(publication.offeringId),
    ports.loadBindingByBindingId(publication.bindingId),
    ports.loadPublishedBusiness(publication.businessId),
    ports.getActiveExactCapabilityContract(contractRefFromRow(publication)),
  ])
  if (business === null) return unavailable('target_not_public')
  if (
    offering === null
    || offering.status !== 'active'
    || offering.offeringId !== publication.offeringId
    || !offeringIntegrityIsValid(offering)
  ) {
    return unavailable('offering_invalid')
  }
  if (
    binding === null
    || binding.offeringId !== offering.offeringId
    || binding.admission !== 'admitted'
    || binding.conformance !== 'conformant'
    || !bindingIntegrityIsValid(binding)
  ) {
    return unavailable('binding_invalid')
  }
  if (contract.kind !== 'found') return unavailable('contract_missing')

  const currentConnection = binding.authority.kind === 'provider_connection'
    ? await ports.loadProviderConnection(binding.authority.connectionRef)
    : undefined
  if (binding.authority.kind === 'provider_connection'
    && (
      !connectionAuthoritySnapshotMatches(binding.connectionAuthority, currentConnection, {
        businessId: String(offering.businessId),
        operationRef: publication.operationRef,
        adapterId: binding.adapterId,
        now: Date.now(),
      })
      || !connectionAuthoritySnapshotsEqual(publication.connectionAuthority, binding.connectionAuthority)
    )) {
    return unavailable('authority_stale')
  }
  if (validPublicHttpsEndpoint(binding.endpointUrl) === undefined) {
    return unavailable('target_not_public')
  }

  let contractDocument: CapabilityContractDocument
  try {
    contractDocument = encodeCapabilityContractDocumentJson(contract.documentJson).document
  } catch {
    return unavailable('contract_missing')
  }
  const { inputSchema, outputSchema } = contractDocument

  const probeKind = publication.sourceKind === 'mcp' || publication.sourceKind === 'agent_plugin_mcp'
    ? 'mcp' as const
    : publication.sourceKind === 'openapi_http'
      ? 'openapi_http' as const
      : publication.sourceKind === 'x402'
        ? 'x402' as const
        : 'ae_quote' as const
  const httpConfiguration = binding.adapterId === 'http-json:v1'
    ? parseHttpJsonTransportConfiguration(parseJson(binding.configJson))
    : undefined
  const mcpConfiguration = binding.adapterId === 'mcp-jsonrpc:v1'
    ? parseMcpJsonRpcTransportConfiguration(parseJson(binding.configJson))
    : undefined
  const x402Configuration = binding.adapterId === 'x402-fetch:v2'
    ? parseX402FetchTransportConfiguration(parseJson(binding.configJson))
    : undefined
  if ((probeKind === 'openapi_http' && httpConfiguration === undefined)
    || (probeKind === 'mcp' && mcpConfiguration === undefined)
    || (probeKind === 'x402' && x402Configuration === undefined)) {
    return unavailable('binding_invalid')
  }
  if (probeKind === 'mcp' && (mcpConfiguration === undefined || mcpConfiguration.toolName.trim().length === 0)) {
    return unavailable('mcp_tool_missing')
  }
  if (
    (probeKind === 'openapi_http' || probeKind === 'mcp')
    && contractDocument.effects.some((effect) => (
      effect.class === 'financial_exposure' || effect.class === 'external_state_change'
    ))
  ) {
    return unavailable('effectful_probe_unsupported')
  }

  let probeInputJson: string | undefined
  if (probeKind === 'openapi_http' || probeKind === 'mcp' || probeKind === 'x402') {
    const candidate = contractDocument.inputExamples?.find(({ input }) => (
      validateJsonSchema(inputSchema, input)
    ))
    if (candidate === undefined) {
      return unavailable('input_unrepresentable')
    }
    probeInputJson = JSON.stringify(candidate.input)
  }

  let expectedPaymentJson: string | undefined
  if (probeKind === 'x402') {
    const paidAmount = publication.pricingConfig?.paidAmount
    if (x402Configuration === undefined || paidAmount === undefined) {
      return unavailable('binding_invalid')
    }
    expectedPaymentJson = JSON.stringify({
      scheme: x402Configuration.scheme,
      network: x402Configuration.network,
      asset: x402Configuration.asset,
      payTo: x402Configuration.payTo,
      currency: x402Configuration.currency,
      routeAmountExponent: x402Configuration.routeAmountExponent,
      assetAmountExponent: x402Configuration.assetAmountExponent,
      paidAmount,
    })
  }

  const probeConfiguration = readHttpJsonProbeConfiguration(binding.adapterId, binding.configJson)
  const target = {
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    bindingId: binding.bindingId,
    capabilityId: publication.capabilityId,
    endpointUrl: binding.endpointUrl,
    adapterId: binding.adapterId,
    probeKind,
    probeQuery: [...probeConfiguration.fixedQuery],
    probeMethod: probeKind === 'mcp'
      ? 'POST' as const
      : probeConfiguration.method,
    transportConfigJson: binding.configJson,
    ...(probeInputJson === undefined ? {} : { probeInputJson }),
    outputSchemaJson: JSON.stringify(outputSchema),
    ...(expectedPaymentJson === undefined ? {} : { expectedPaymentJson }),
    targetDigest: probeTargetDigest(publication, offering, binding),
  }
  if (binding.authority.kind === 'provider_connection') {
    if (binding.connectionAuthority === undefined) return unavailable('authority_stale')
    return {
      kind: 'available' as const,
      target: {
        ...target,
        authority: binding.authority,
        connectionAuthority: {
          ...binding.connectionAuthority,
          grantedScopes: [...binding.connectionAuthority.grantedScopes],
          grantedResources: [...binding.connectionAuthority.grantedResources],
        },
      },
    }
  }
  return { kind: 'available' as const, target: { ...target, authority: binding.authority } }
}

function unavailable(reason: CapabilityProbeTargetUnavailableReason): ReadCapabilityProbeTargetResult {
  return { kind: 'unavailable', reason, evidenceRefs: [`probe-target:${reason}`] }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}