import type { Doc } from '../../../_generated/dataModel'
import type { CapabilityOfferingOrigin, CapabilityOfferingRow } from '../../../../src/modules/capability-supply/public'
import { isRecord } from '../../../../src/modules/common/is-record'
import { optionalNumber, optionalString, readLiteral, requiredNumber, requiredString } from './rowReaders'

export type CapabilityOfferingSource = {
  offeringId: string
  businessId: string
  status: CapabilityOfferingRow['status']
  origin: unknown
}

export type CapabilityPublicationSource = {
  publicationRef: string
  revision: number
  networkId: string
  businessId: string
  capabilityId: string
  version: number
  contractDigest: string
  offeringId: string
  bindingId: string
  credentialState: string
  healthState: string
  readinessObservedAt?: number
  readinessValidUntil?: number
  readinessLastHealthyAt?: number
  authorityMode: 'provider_owned' | 'ae_curated_external' | 'third_party_gateway' | 'observed_external'
  sourceRouteRef?: string
}

export type CapabilityBindingSource = {
  offeringId: string
  admission: string
  conformance: string
}

export function readCapabilityOffering(row: Doc<'capabilityOfferings'>): CapabilityOfferingSource {
  return {
    offeringId: requiredString(row, 'offeringId'),
    businessId: requiredString(row, 'businessId'),
    status: readLiteral<CapabilityOfferingRow['status']>(row.status, ['inactive', 'active'], 'status'),
    origin: row.origin,
  }
}

export function readCapabilityPublication(row: Doc<'capabilityPublications'>): CapabilityPublicationSource {
  const readinessObservedAt = optionalNumber(row, 'readinessObservedAt')
  const readinessValidUntil = optionalNumber(row, 'readinessValidUntil')
  const readinessLastHealthyAt = optionalNumber(row, 'readinessLastHealthyAt')
  const sourceRouteRef = optionalString(row, 'sourceRouteRef')
  return {
    publicationRef: requiredString(row, 'publicationRef'),
    revision: requiredNumber(row, 'revision'),
    networkId: requiredString(row, 'networkId'),
    businessId: requiredString(row, 'businessId'),
    capabilityId: requiredString(row, 'capabilityId'),
    version: requiredNumber(row, 'version'),
    contractDigest: requiredString(row, 'contractDigest'),
    offeringId: requiredString(row, 'offeringId'),
    bindingId: requiredString(row, 'bindingId'),
    credentialState: requiredString(row, 'credentialState'),
    healthState: requiredString(row, 'healthState'),
    authorityMode: readLiteral(row.authorityMode, ['provider_owned', 'ae_curated_external', 'third_party_gateway', 'observed_external'], 'authorityMode'),
    ...(readinessObservedAt === undefined ? {} : { readinessObservedAt }),
    ...(readinessValidUntil === undefined ? {} : { readinessValidUntil }),
    ...(readinessLastHealthyAt === undefined ? {} : { readinessLastHealthyAt }),
    ...(sourceRouteRef === undefined ? {} : { sourceRouteRef }),
  }
}

export function readCapabilityBinding(row: Doc<'capabilityTransportBindings'>): CapabilityBindingSource {
  return {
    offeringId: requiredString(row, 'offeringId'),
    admission: requiredString(row, 'admission'),
    conformance: requiredString(row, 'conformance'),
  }
}

type CatalogOfferingOrigin = Extract<CapabilityOfferingOrigin, { kind: 'catalog_offering' }>

export function catalogOfferingOrigin(value: unknown): CatalogOfferingOrigin | undefined {
  if (!isRecord(value) || value.kind !== 'catalog_offering') return undefined
  if (
    typeof value.offeringRef !== 'string'
    || typeof value.offeringRevision !== 'number'
    || typeof value.offeringSourceHash !== 'string'
  ) return undefined
  const origin = {
    kind: 'catalog_offering' as const,
    offeringRef: value.offeringRef,
    offeringRevision: value.offeringRevision,
    offeringSourceHash: value.offeringSourceHash,
  }
  if (value.declaredAccessPathRef === undefined && value.accessPathSourceHash === undefined) return origin
  if (typeof value.declaredAccessPathRef !== 'string' || typeof value.accessPathSourceHash !== 'string') return undefined
  return {
    ...origin,
    declaredAccessPathRef: value.declaredAccessPathRef,
    accessPathSourceHash: value.accessPathSourceHash,
  }
}
