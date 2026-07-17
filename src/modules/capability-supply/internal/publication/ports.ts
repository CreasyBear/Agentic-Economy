import type { ExactCapabilityContractResult } from '@/modules/capability-contract-registry/public'
import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import type { CapabilityPublicationSource } from '@/modules/capability-supply/public'

import type { OperationLedgerPorts } from '../operation-ledger/types'

export type PublicationCommandRow = Readonly<{
  id: string
  publicationRef: string
  revision: number
  businessId: string
  networkId: string
  offeringId: string
  bindingId: string
  capabilityId: string
  version: number
  contractDigest: string
  disposition: 'current' | 'withdrawn' | 'incompatible' | 'superseded'
  sourceDigest: string
}>

export type PublicationInsertInput = Readonly<{
  publicationRef: string
  revision: number
  businessId: string
  networkId: string
  sourceKind: CapabilityPublicationSource['kind']
  sourceDigest: string
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
