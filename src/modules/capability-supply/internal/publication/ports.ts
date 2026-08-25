import type { ExactCapabilityContractResult } from '@/modules/capability-contract-registry/public'
import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import type {
  CapabilityOfferingOrigin,
  CapabilityPublicationSource,
  CapabilityPublicationSourceSelector,
  PublicOperationRef,
} from '@/modules/capability-supply/public'
import type { CapabilityConnectionAuthoritySnapshot } from '../binding/registration'
import type {
  RotateCapabilityTransportBindingAuthorityInput,
  RotateCapabilityTransportBindingAuthorityResult,
} from '../binding/write'
import type { ProviderConnection } from '../../provider-connection'
import type { OperationLedgerPorts } from '../operation-ledger'
import type { CapabilityPublicationAuthorityMode } from './provenance'

export type PublicationReadinessOutcome =
  | 'healthy'
  | 'credential_unavailable'
  | 'credential_rejected'
  | 'target_not_public'
  | 'transport_unreachable'
  | 'http_redirect'
  | 'http_4xx'
  | 'http_5xx'
  | 'response_content_type_invalid'
  | 'response_too_large'
  | 'response_invalid'

export type PublicationCommandRow = Readonly<{
  id: string
  operationRef: PublicOperationRef
  publicationRef: string
  revision: number
  businessId: string
  networkId: string
  runtimeEnvironment: 'sandbox' | 'production'
  capabilityId: string
  version: number
  contractDigest: string
  offeringId: string
  bindingId: string
  disposition: 'current' | 'withdrawn' | 'incompatible' | 'superseded'
  sourceKind: CapabilityPublicationSource['kind']
  sourceSelector?: CapabilityPublicationSourceSelector
  sourceDescriptorJson?: string
  sourceRevision: string
  sourceDigest: string
  pricingConfigJson?: string
  priceDigest?: string
  publisherRef: string
  authorityMode: CapabilityPublicationAuthorityMode
  provenanceDigest: string
  supersedesRevision?: number
  connectionAuthority?: CapabilityConnectionAuthoritySnapshot
  credentialState?: 'unobserved' | 'ready' | 'unavailable'
  healthState?: 'unobserved' | 'healthy' | 'unhealthy'
  readinessTargetDigest?: string
  readinessRequestDigest?: string
  readinessResponseStatus?: number
  readinessResponseContentType?: string
  readinessResponseDigest?: string
  readinessOutcome?: PublicationReadinessOutcome
  readinessObservedAt?: number
  readinessValidUntil?: number
  readinessEvidenceRefs?: readonly string[]
  registrationEvidenceRefs?: readonly string[]
}>

export type PublicationInsertInput = Readonly<{
  publicationRef: string
  operationRef: PublicOperationRef
  revision: number
  businessId: string
  networkId: string
  runtimeEnvironment: 'sandbox' | 'production'
  sourceKind: CapabilityPublicationSource['kind']
  sourceSelector: CapabilityPublicationSourceSelector
  sourceDescriptorJson: string
  sourceRevision: string
  sourceDigest: string
  pricingConfigJson: string
  priceDigest: string
  publisherRef: string
  authorityMode: CapabilityPublicationAuthorityMode
  provenanceDigest: string
  capabilityId: string
  version: number
  contractDigest: string
  offeringId: string
  bindingId: string
  disposition: 'current' | 'incompatible'
  connectionAuthority?: CapabilityConnectionAuthoritySnapshot
  supersedesRevision?: number
  registrationEvidenceRefs: readonly string[]
  createdAt: number
  updatedAt: number
}>


export type RegisterContractDocumentResult =
  | Readonly<{ kind: 'registered'; ref: CapabilityContractRef; created: boolean }>
  | Readonly<{ kind: 'refused'; reason: string }>

export type PublicationCommandPorts = OperationLedgerPorts & Readonly<{
  catalogOriginIsCurrent?: (
    origin: Extract<CapabilityOfferingOrigin, { kind: 'catalog_offering' }>,
    businessId: string,
  ) => Promise<boolean>
  findContractDigest: (capabilityId: string, version: number) => Promise<string | null>
  loadPublicationAtRevision: (
    publicationRef: string,
    revision: number,
  ) => Promise<PublicationCommandRow | null>
  insertPublication: (input: PublicationInsertInput) => Promise<void>
  patchPublicationSuperseded: (publicationId: string, updatedAt: number) => Promise<void>
  patchPublicationWithdrawn: (publicationId: string, updatedAt: number) => Promise<void>
  rotateProviderConnectionBindingAuthority?: (
    input: RotateCapabilityTransportBindingAuthorityInput,
    updatedAt: number,
  ) => Promise<RotateCapabilityTransportBindingAuthorityResult>
  loadProviderConnection?: (connectionRef: string) => Promise<ProviderConnection | null | undefined>
  registerContractDocument: (
    documentJson: string,
    now: number,
  ) => Promise<RegisterContractDocumentResult>
  getExactRegisteredContract: (
    ref: CapabilityContractRef,
  ) => Promise<ExactCapabilityContractResult>
  scheduleReadinessProbe: (
    publicationRef: string,
    expectedRevision: number,
  ) => Promise<void>
}>
