import type { CapabilityOfferingOrigin } from '@/modules/capability-supply/public'
import type { OfferingAccessPathDescriptor } from '@/modules/catalog/public'

import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import type { ExactCapabilityContractResult } from '@/modules/capability-contract-registry/public'
import type { CapabilityBindingRow, CapabilityConnectionAuthoritySnapshot } from '../binding'
import type { CapabilityOfferingRow } from '../offering'
import type {
  CapabilityPublicationLifecycleRow,
  CapabilityReadinessOutcome,
} from '../publication'
import type { ProviderConnection } from '../../provider-connection'

export type GraphCatalogAccessPath = Readonly<{
  accessPathRef: string
  businessId: string
  offeringRef: string
  offeringRevision: number
  offeringSourceHash: string
  status: 'draft' | 'published' | 'withdrawn'
  sourceHash: string
  descriptor: OfferingAccessPathDescriptor
}>
export type GraphPublicationRow = CapabilityPublicationLifecycleRow & Readonly<{
  id: string
  publicationRef: string
  operationRef: string
  revision: number
  networkId: string
  businessId: string
  offeringId: string
  bindingId: string
  capabilityId: string
  version: number
  contractDigest: string
  sourceKind: 'ae_envelope' | 'openapi_http' | 'mcp' | 'agent_plugin_mcp' | 'x402'
  sourceDigest: string
  registrationEvidenceRefs: readonly string[]
  readinessEvidenceRefs: readonly string[]
}>

export type GraphPublishedBusiness = Readonly<{
  businessId: string
  trustTier: string
  publicStatus: 'published'
  suppressed: false
  currentlyPublished: true
}>

export type ProbeReadinessPatch = Readonly<{
  credentialState: 'ready' | 'unavailable'
  healthState: 'healthy' | 'unhealthy'
  connectionAuthority?: CapabilityConnectionAuthoritySnapshot
  readinessTargetDigest: string
  readinessRequestDigest: string
  readinessResponseStatus?: number
  readinessResponseContentType?: string
  readinessResponseDigest?: string
  readinessOutcome: CapabilityReadinessOutcome
  readinessObservedAt: number
  readinessValidUntil: number
  readinessEvidenceRefs: readonly string[]
  updatedAt: number
}>

export type GraphActiveExactCapabilityContractResult =
  | Readonly<{
    kind: 'found'
    ref: CapabilityContractRef
    documentJson: string
    registeredAt: number
  }>
  | Readonly<{
    kind: 'unavailable'
    reason: 'not_found' | 'not_active' | 'integrity_failure'
  }>

export type CapabilityGraphPorts = Readonly<{
  loadPublicationAtRevision: (
    publicationRef: string,
    revision: number,
  ) => Promise<GraphPublicationRow | null>
  listCurrentPublicationsByNetwork: (
    networkId: string,
    take: number,
  ) => Promise<readonly GraphPublicationRow[]>
  loadOfferingByOfferingId: (offeringId: string) => Promise<CapabilityOfferingRow | null>
  loadBindingByBindingId: (bindingId: string) => Promise<CapabilityBindingRow | null>
  loadPublishedBusiness: (businessId: string) => Promise<GraphPublishedBusiness | null>
  loadProviderConnection: (connectionRef: string) => Promise<ProviderConnection | undefined>
  catalogOriginIsCurrent?: (
    origin: Extract<CapabilityOfferingOrigin, { kind: 'catalog_offering' }>,
    businessId: string,
  ) => Promise<boolean>
  loadCatalogAccessPath?: (accessPathRef: string) => Promise<GraphCatalogAccessPath | null>
  getActiveExactCapabilityContract: (
    ref: CapabilityContractRef,
  ) => Promise<GraphActiveExactCapabilityContractResult>
  getExactRegisteredCapabilityContract: (
    ref: CapabilityContractRef,
  ) => Promise<ExactCapabilityContractResult>
  patchProbeReadiness: (
    publicationId: string,
    patch: ProbeReadinessPatch,
  ) => Promise<void>
}>
