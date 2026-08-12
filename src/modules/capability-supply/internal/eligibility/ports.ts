import type { CapabilityBindingRow } from '../binding'
import type { CapabilityOfferingOrigin } from '../../public'
import type { PublicOperationRef } from '../../public'
import type { ProviderConnection } from '../../provider-connection'
import type { CapabilityContractRef, CapabilityOfferingRow } from '../offering'
import type { CapabilityPublicationLifecycleRow } from '../publication'
import type {
  SuppliedCandidateQualification,
  SuppliedCandidateRef,
} from '../graph'
export type EligiblePublishedBusiness = Readonly<{
  businessId: string
}>

export type EligiblePublicationRow = CapabilityPublicationLifecycleRow & Readonly<{
  publicationRef: string
  revision: number
  operationRef: PublicOperationRef
  businessId: string
  networkId: string
  capabilityId: string
  version: number
  contractDigest: string
  offeringId: string
  bindingId: string
  sourceRevision: string
  sourceDigest: string
  publisherRef: string
  provenanceDigest: string
  registrationEvidenceRefs: readonly string[]
  readinessEvidenceRefs: readonly string[]
}>

export type ActiveExactCapabilityContractResult =
  | Readonly<{
    kind: 'found'
    ref: CapabilityContractRef
    documentJson: string
    registeredAt: number
  }>
  | Readonly<{ kind: 'unavailable'; reason: 'not_found' | 'not_active' | 'integrity_failure' }>

export type EligibleSupplyPorts = Readonly<{
  listAdmittedConformantBindingsByNetwork: (
    networkId: string,
    take: number,
  ) => Promise<readonly CapabilityBindingRow[]>
  loadOfferingByOfferingId: (offeringId: string) => Promise<CapabilityOfferingRow | null>
  loadBindingByBindingId: (bindingId: string) => Promise<CapabilityBindingRow | null>
  loadPublishedBusiness: (businessId: string) => Promise<EligiblePublishedBusiness | null>
  loadProviderConnection: (connectionRef: string) => Promise<ProviderConnection | undefined>
  catalogOriginIsCurrent: (
    origin: Extract<CapabilityOfferingOrigin, { kind: 'catalog_offering' }>,
    businessId: string,
  ) => Promise<boolean>
  getActiveExactCapabilityContract: (
    ref: CapabilityContractRef,
  ) => Promise<ActiveExactCapabilityContractResult>
  qualifySuppliedCandidate: (
    candidate: SuppliedCandidateRef,
    now: number,
  ) => Promise<SuppliedCandidateQualification>
  loadCurrentPublicationByBindingId: (
    bindingId: string,
  ) => Promise<EligiblePublicationRow | null>
}>
