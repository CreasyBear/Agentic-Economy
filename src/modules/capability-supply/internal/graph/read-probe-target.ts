import { validateJsonSchema } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
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
  readHttpJsonProbeConfiguration,
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

type CapabilityProbeTargetBase = Readonly<{
  publicationRef: string
  revision: number
  bindingId: string
  capabilityId: string
  endpointUrl: string
  adapterId: string
  probeKind: 'ae_quote' | 'openapi_http' | 'mcp' | 'x402'
  probeQuery: Array<{ parameter: string; value: string }>
  probeMethod: 'GET' | 'HEAD'
  transportConfigJson: string
  probeInputJson?: string
  outputSchemaJson?: string
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
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'available'; target: CapabilityProbeTarget }>

export async function readCapabilityProbeTarget(
  ports: CapabilityGraphPorts,
  args: Readonly<{ publicationRef: string; expectedRevision: number }>,
): Promise<ReadCapabilityProbeTargetResult> {
  const now = Date.now()
  const publication = await ports.loadPublicationAtRevision(
    args.publicationRef,
    args.expectedRevision,
  )
  if (publication === null || publication.disposition !== 'current') {
    return { kind: 'unavailable' as const }
  }
  const [offering, binding, business, contract] = await Promise.all([
    ports.loadOfferingByOfferingId(publication.offeringId),
    ports.loadBindingByBindingId(publication.bindingId),
    ports.loadPublishedBusiness(publication.businessId),
    ports.getActiveExactCapabilityContract(contractRefFromRow(publication)),
  ])
  const currentConnection = binding?.authority.kind === 'provider_connection'
    ? await ports.loadProviderConnection(binding.authority.connectionRef)
    : undefined
  if (
    offering === null
    || binding === null
    || business === null
    || contract.kind !== 'found'
    || offering.status !== 'active'
    || binding.admission !== 'admitted'
    || binding.conformance !== 'conformant'
    || !offeringIntegrityIsValid(offering)
    || !bindingIntegrityIsValid(binding)
    || offering.offeringId !== publication.offeringId
    || binding.offeringId !== offering.offeringId
  ) {
    return { kind: 'unavailable' as const }
  }
  if (binding.authority.kind === 'provider_connection'
    && (
      !connectionAuthoritySnapshotMatches(binding.connectionAuthority, currentConnection, {
        businessId: String(offering.businessId),
        operationRef: publication.operationRef,
        adapterId: binding.adapterId,
        now,
      })
      || !connectionAuthoritySnapshotsEqual(publication.connectionAuthority, binding.connectionAuthority)
    )) {
    return { kind: 'unavailable' as const }
  }
  let contractDocument: unknown
  try {
    contractDocument = JSON.parse(contract.documentJson)
  } catch {
    return { kind: 'unavailable' as const }
  }
  const inputSchema = isRecord(contractDocument) && isRecord(contractDocument.inputSchema)
    ? contractDocument.inputSchema
    : undefined
  const outputSchema = isRecord(contractDocument) && isRecord(contractDocument.outputSchema)
    ? contractDocument.outputSchema
    : undefined
  if (inputSchema === undefined || outputSchema === undefined) {
    return { kind: 'unavailable' as const }
  }
  const probeConfiguration = readHttpJsonProbeConfiguration(binding.adapterId, binding.configJson)
  if (binding.adapterId === 'http-json:v1'
    && parseHttpJsonTransportConfiguration(parseJson(binding.configJson)) === undefined) {
    return { kind: 'unavailable' as const }
  }
  const probeKind = publication.sourceKind === 'mcp' || publication.sourceKind === 'agent_plugin_mcp' ? 'mcp' as const
    : publication.sourceKind === 'openapi_http' ? 'openapi_http' as const
    : publication.sourceKind === 'x402' ? 'x402' as const
    : 'ae_quote' as const
  let probeInputJson: string | undefined
  if (probeKind === 'openapi_http' && probeConfiguration.method === 'GET') {
    const examples = isRecord(contractDocument) && Array.isArray(contractDocument.inputExamples)
      ? contractDocument.inputExamples
      : []
    const candidate = examples.find((example) => (
      isRecord(example) && isRecord(example.input)
      && validateJsonSchema(inputSchema, example.input)
    ))
    if (!isRecord(candidate) || !isRecord(candidate.input)) {
      return { kind: 'unavailable' as const }
    }
    probeInputJson = JSON.stringify(candidate.input)
  }
  const target = {
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    bindingId: binding.bindingId,
    capabilityId: publication.capabilityId,
    endpointUrl: binding.endpointUrl,
    adapterId: binding.adapterId,
    probeKind,
    probeQuery: [...probeConfiguration.fixedQuery],
    probeMethod: probeConfiguration.method,
    transportConfigJson: binding.configJson,
    ...(probeInputJson === undefined ? {} : { probeInputJson }),
    outputSchemaJson: JSON.stringify(outputSchema),
    targetDigest: probeTargetDigest(publication, offering, binding),
  }
  if (binding.authority.kind === 'provider_connection') {
    if (binding.connectionAuthority === undefined) return { kind: 'unavailable' as const }
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
  return {
    kind: 'available' as const,
    target: { ...target, authority: binding.authority },
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}