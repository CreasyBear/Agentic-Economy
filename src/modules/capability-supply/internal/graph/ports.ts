import type { ExactCapabilityContractResult } from '@/modules/capability-contract-registry/public'
import type { CapabilityContractRef } from '@/modules/capability-contract/public'

import type { CapabilityBindingRow } from '../binding'
import type { CapabilityOfferingRow } from '../offering'
import type { CapabilityPublicationLifecycleRow } from '../publication'

export type GraphPublicationRow = CapabilityPublicationLifecycleRow & Readonly<{
  id: string
  publicationRef: string
  revision: number
  businessId: string
  offeringId: string
  bindingId: string
  capabilityId: string
  version: number
  contractDigest: string
  sourceKind: 'ae_envelope' | 'openapi_http' | 'mcp' | 'x402'
  sourceDigest: string
  registrationEvidenceRefs: readonly string[]
  readinessEvidenceRefs: readonly string[]
}>

export type GraphPublishedBusiness = Readonly<{
  businessId: string
  trustTier: string
  publicStatus: string
}>

export type ProbeReadinessPatch = Readonly<{
  credentialState: 'ready' | 'unavailable'
  healthState: 'healthy' | 'unhealthy'
  readinessObservedAt: number
  readinessValidUntil: number
  readinessEvidenceRefs: readonly string[]
  updatedAt: number
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
  getActiveExactCapabilityContract: (
    ref: CapabilityContractRef,
  ) => Promise<ExactCapabilityContractResult>
  getExactRegisteredCapabilityContract: (
    ref: CapabilityContractRef,
  ) => Promise<ExactCapabilityContractResult>
  patchProbeReadiness: (
    publicationId: string,
    patch: ProbeReadinessPatch,
  ) => Promise<void>
}>
