import type { ExactCapabilityContractResult } from '@/modules/capability-contract-registry/public'
import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import type { CapabilityPublicationSource, PublicOperationRef } from '@/modules/capability-supply/public'

import type { OperationLedgerPorts } from '../operation-ledger/types'
import type {
  CapabilityPublicationAuthorityMode,
  CapabilityPublicationProvenance,
} from './provenance'

export type PublicationCommandRow = Readonly<{
  id: string
  operationRef: PublicOperationRef
  publicationRef: string
  revision: number
  businessId: string
  networkId: string
  capabilityId: string
  version: number
  contractDigest: string
  offeringId: string
  bindingId: string
  disposition: 'current' | 'withdrawn' | 'incompatible' | 'superseded'
  sourceRevision: string
  sourceDigest: string
  publisherRef: string
  authorityMode: CapabilityPublicationAuthorityMode
  provenanceDigest: string
}>

export type PublicationInsertInput = Readonly<{
  publicationRef: string
  operationRef: PublicOperationRef
  revision: number
  businessId: string
  networkId: string
  sourceKind: CapabilityPublicationSource['kind']
  sourceRevision: string
  sourceDigest: string
  publisherRef: string
  authorityMode: CapabilityPublicationAuthorityMode
  provenanceDigest: string
  capabilityId: string
  version: number
  contractDigest: string
  offeringId: string
  bindingId: string
  disposition: 'current' | 'incompatible'
  supersedesRevision?: number
  registrationEvidenceRefs: readonly string[]
  createdAt: number
  updatedAt: number
}>

export type RegisterContractDocumentResult =
  | Readonly<{ kind: 'registered'; ref: CapabilityContractRef; created: boolean }>
  | Readonly<{ kind: 'refused'; reason: string }>

export type PublicationCommandPorts = OperationLedgerPorts & Readonly<{
  findContractDigest: (
    capabilityId: string,
    version: number,
  ) => Promise<string | null>
  loadPublicationAtRevision: (
    publicationRef: string,
    revision: number,
  ) => Promise<PublicationCommandRow | null>
  insertPublication: (input: PublicationInsertInput) => Promise<void>
  patchPublicationSuperseded: (publicationId: string, updatedAt: number) => Promise<void>
  patchPublicationWithdrawn: (publicationId: string, updatedAt: number) => Promise<void>
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
