import type { Doc } from '../../../_generated/dataModel'
import { BusinessOfferingStatusValues, OfferingAccessPathStatusValues, type BusinessOfferingRecord, type BusinessOfferingRevisionRecord, type OfferingAccessPathRecord } from '../../../../src/modules/catalog/public'
import type { BusinessContext } from '../../../../src/modules/business/public'
import { brandNonEmpty } from '../../../../src/modules/common/ids'
import { offeringPrice, readDescriptor } from './descriptors'
import { optionalNumber, optionalString, readLiteral, requiredNumber, requiredString } from './rowReaders'

export type BusinessSource = {
  slug: string
  name: string
  publicStatus?: string
  updatedAt: number
  trustTier: unknown
  suppressedAt?: number
}

export type BusinessContextSource = {
  category: string
  businessContext: BusinessContext
  responseTimeMinutes?: number
  photos?: readonly Readonly<{ url: string; alt: string }>[]
}

export function readBusinessSource(row: Doc<'businesses'>): BusinessSource {
  const publicStatus = optionalString(row, 'publicStatus')
  const suppressedAt = optionalNumber(row, 'suppressedAt')
  return {
    slug: requiredString(row, 'slug'),
    name: requiredString(row, 'name'),
    ...(publicStatus === undefined ? {} : { publicStatus }),
    updatedAt: requiredNumber(row, 'updatedAt'),
    trustTier: row.trustTier,
    ...(suppressedAt === undefined ? {} : { suppressedAt }),
  }
}

export function readBusinessContextFromBusiness(row: Doc<'businesses'>): BusinessContextSource {
  return {
    category: requiredString(row, 'category'),
    businessContext: row.businessContext,
  }
}

export function toOffering(row: Doc<'businessOfferings'>): BusinessOfferingRecord {
  return {
    offeringRef: brandNonEmpty(requiredString(row, 'offeringRef'), 'OfferingRef'),
    businessId: brandNonEmpty(requiredString(row, 'businessId'), 'BusinessId'),
    currentRevision: requiredNumber(row, 'currentRevision'),
    status: readLiteral(row.status, BusinessOfferingStatusValues, 'status'),
    createdAt: requiredNumber(row, 'createdAt'),
    updatedAt: requiredNumber(row, 'updatedAt'),
  }
}

export function toRevision(row: Doc<'businessOfferingRevisions'>): BusinessOfferingRevisionRecord {
  const price = row.price === undefined ? undefined : offeringPrice(row.price)
  const serviceAreaSummary = optionalString(row, 'serviceAreaSummary')
  const availabilitySummary = optionalString(row, 'availabilitySummary')
  const pricingSummary = optionalString(row, 'pricingSummary')
  return {
    offeringRef: brandNonEmpty(requiredString(row, 'offeringRef'), 'OfferingRef'),
    businessId: brandNonEmpty(requiredString(row, 'businessId'), 'BusinessId'),
    revision: requiredNumber(row, 'revision'),
    name: requiredString(row, 'name'),
    category: requiredString(row, 'category'),
    summary: requiredString(row, 'summary'),
    ...(serviceAreaSummary === undefined ? {} : { serviceAreaSummary }),
    ...(availabilitySummary === undefined ? {} : { availabilitySummary }),
    ...(pricingSummary === undefined ? {} : { pricingSummary }),
    ...(price === undefined ? {} : { price }),
    sourceHash: brandNonEmpty(requiredString(row, 'sourceHash'), 'SourceHash'),
    createdAt: requiredNumber(row, 'createdAt'),
  }
}

export function toPath(row: Doc<'offeringAccessPaths'>): OfferingAccessPathRecord {
  return {
    accessPathRef: brandNonEmpty(requiredString(row, 'accessPathRef'), 'AccessPathRef'),
    businessId: brandNonEmpty(requiredString(row, 'businessId'), 'BusinessId'),
    offeringRef: brandNonEmpty(requiredString(row, 'offeringRef'), 'OfferingRef'),
    offeringRevision: requiredNumber(row, 'offeringRevision'),
    offeringSourceHash: brandNonEmpty(requiredString(row, 'offeringSourceHash'), 'SourceHash'),
    status: readLiteral(row.status, OfferingAccessPathStatusValues, 'status'),
    descriptor: readDescriptor(row.descriptor),
    sourceHash: brandNonEmpty(requiredString(row, 'sourceHash'), 'SourceHash'),
    createdAt: requiredNumber(row, 'createdAt'),
    updatedAt: requiredNumber(row, 'updatedAt'),
  }
}
