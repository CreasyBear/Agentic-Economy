import type { Doc } from '../../../_generated/dataModel'
import { brandNonEmpty } from '../../../../src/modules/common/ids'
import { compareExactAmounts, exactAmountSchema, rescaleExactAmount } from '../../../../src/modules/money/public'
import {
  BusinessOfferingStatusValues,
  OfferingAccessPathStatusValues,
  OfferingPriceKindValues,
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
  type BusinessOfferingRevisionRecord,
  type BusinessOfferingStatus,
  type OfferingAccessPathDescriptor,
  type OfferingAccessPathRecord,
  type OfferingAccessPathStatus,
  type OfferingPrice,
} from '../../../../src/modules/catalog/public'

function isCatalogRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type CatalogStringKey<Row extends object> = Extract<keyof Row, string>

export function requiredCatalogString<Row extends object>(row: Row, field: CatalogStringKey<Row>): string {
  const value = row[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`catalog_invalid_${field}`)
  }
  return value
}

export function requiredCatalogNumber<Row extends object>(row: Row, field: CatalogStringKey<Row>): number {
  const value = row[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`catalog_invalid_${field}`)
  }
  return value
}

function optionalCatalogString<Row extends object>(row: Row, field: CatalogStringKey<Row>): string | undefined {
  const value = row[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`catalog_invalid_${field}`)
  return value
}

function requiredCatalogExactAmount<Row extends object>(row: Row, field: CatalogStringKey<Row>) {
  const parsed = exactAmountSchema.safeParse(row[field])
  if (!parsed.success) throw new Error(`catalog_invalid_${field}`)
  return parsed.data
}

function requiredCatalogLiteral<T extends string>(
  values: readonly T[],
  value: unknown,
  field: string,
): T {
  const match = values.find((candidate) => candidate === value)
  if (match === undefined) throw new Error(`catalog_invalid_${field}`)
  return match
}

function readCatalogPrice(value: unknown): OfferingPrice | undefined {
  if (value === undefined) return undefined
  if (!isCatalogRecord(value)) throw new Error('catalog_invalid_price')
  const kind = requiredCatalogLiteral(OfferingPriceKindValues, value.kind, 'price_kind')
  const unit = value.unit === undefined
    ? undefined
    : requiredCatalogLiteral(OfferingPriceUnitValues, value.unit, 'price_unit')
  const taxTreatment = requiredCatalogLiteral(OfferingPriceTaxTreatmentValues, value.taxTreatment, 'price_taxTreatment')

  if (kind === 'quote_only') {
    return {
      kind,
      currency: requiredCatalogString(value, 'currency'),
      ...(unit === undefined ? {} : { unit }),
      taxTreatment,
    }
  }
  if (kind === 'fixed' || kind === 'from') {
    return {
      kind,
      amount: requiredCatalogExactAmount(value, 'amount'),
      ...(unit === undefined ? {} : { unit }),
      taxTreatment,
    }
  }

  const minimum = requiredCatalogExactAmount(value, 'minimum')
  const maximum = requiredCatalogExactAmount(value, 'maximum')
  const exponent = Math.max(minimum.exponent, maximum.exponent)
  const comparableMinimum = rescaleExactAmount(minimum, exponent)
  const comparableMaximum = rescaleExactAmount(maximum, exponent)
  const comparison = comparableMinimum === undefined || comparableMaximum === undefined
    ? undefined
    : compareExactAmounts(comparableMinimum, comparableMaximum)
  if (comparison === undefined || comparison > 0) throw new Error('catalog_invalid_price_range')
  return {
    kind,
    minimum,
    maximum,
    ...(unit === undefined ? {} : { unit }),
    taxTreatment,
  }
}

export function readCatalogDescriptor(value: unknown): OfferingAccessPathDescriptor {
  if (!isCatalogRecord(value)) throw new Error('catalog_invalid_descriptor')
  const kind = value.kind
  if (kind === 'human_request') {
    const url = optionalCatalogString(value, 'url')
    return {
      kind,
      channel: requiredCatalogLiteral(['phone', 'website'], value.channel, 'access_path_channel'),
      disclosure: requiredCatalogString(value, 'disclosure'),
      ...(url === undefined ? {} : { url }),
    }
  }
  if (kind === 'external_operation') {
    const method = optionalCatalogString(value, 'method')
    const documentationUrl = optionalCatalogString(value, 'documentationUrl')
    const authenticationSummary = optionalCatalogString(value, 'authenticationSummary')
    const pricingSummary = optionalCatalogString(value, 'pricingSummary')
    const interfaceDescriptionValue = value.interfaceDescription
    const interfaceDescription = interfaceDescriptionValue === undefined
      ? undefined
      : (() => {
          if (!isCatalogRecord(interfaceDescriptionValue)) throw new Error('catalog_invalid_interface_description')
          const url = optionalCatalogString(interfaceDescriptionValue, 'url')
          return {
            format: requiredCatalogString(interfaceDescriptionValue, 'format'),
            ...(url === undefined ? {} : { url }),
          }
        })()
    return {
      kind,
      name: requiredCatalogString(value, 'name'),
      summary: requiredCatalogString(value, 'summary'),
      url: requiredCatalogString(value, 'url'),
      ...(method === undefined ? {} : { method }),
      ...(documentationUrl === undefined ? {} : { documentationUrl }),
      ...(interfaceDescription === undefined ? {} : { interfaceDescription }),
      ...(authenticationSummary === undefined ? {} : { authenticationSummary }),
      ...(pricingSummary === undefined ? {} : { pricingSummary }),
      provenance: requiredCatalogLiteral(['business_declared', 'publicly_observed'], value.provenance, 'access_path_provenance'),
    }
  }
  throw new Error('catalog_invalid_descriptor_kind')
}

export function readCatalogStatus(value: unknown): BusinessOfferingStatus {
  return requiredCatalogLiteral(BusinessOfferingStatusValues, value, 'offering_status')
}

function readCatalogAccessPathStatus(value: unknown): OfferingAccessPathStatus {
  return requiredCatalogLiteral(OfferingAccessPathStatusValues, value, 'access_path_status')
}

export function readCatalogRevision(row: Doc<'businessOfferingRevisions'>): BusinessOfferingRevisionRecord {
  const serviceAreaSummary = optionalCatalogString(row, 'serviceAreaSummary')
  const availabilitySummary = optionalCatalogString(row, 'availabilitySummary')
  const pricingSummary = optionalCatalogString(row, 'pricingSummary')
  const price = readCatalogPrice(row.price)
  return {
    offeringRef: brandNonEmpty(requiredCatalogString(row, 'offeringRef'), 'OfferingRef'),
    businessId: brandNonEmpty(requiredCatalogString(row, 'businessId'), 'BusinessId'),
    revision: requiredCatalogNumber(row, 'revision'),
    name: requiredCatalogString(row, 'name'),
    category: requiredCatalogString(row, 'category'),
    summary: requiredCatalogString(row, 'summary'),
    ...(serviceAreaSummary === undefined ? {} : { serviceAreaSummary }),
    ...(availabilitySummary === undefined ? {} : { availabilitySummary }),
    ...(pricingSummary === undefined ? {} : { pricingSummary }),
    ...(price === undefined ? {} : { price }),
    sourceHash: brandNonEmpty(requiredCatalogString(row, 'sourceHash'), 'SourceHash'),
    createdAt: requiredCatalogNumber(row, 'createdAt'),
  }
}

export function readCatalogAccessPath(row: Doc<'offeringAccessPaths'>): OfferingAccessPathRecord {
  return {
    accessPathRef: brandNonEmpty(requiredCatalogString(row, 'accessPathRef'), 'AccessPathRef'),
    businessId: brandNonEmpty(requiredCatalogString(row, 'businessId'), 'BusinessId'),
    offeringRef: brandNonEmpty(requiredCatalogString(row, 'offeringRef'), 'OfferingRef'),
    offeringRevision: requiredCatalogNumber(row, 'offeringRevision'),
    offeringSourceHash: brandNonEmpty(requiredCatalogString(row, 'offeringSourceHash'), 'SourceHash'),
    status: readCatalogAccessPathStatus(row.status),
    descriptor: readCatalogDescriptor(row.descriptor),
    sourceHash: brandNonEmpty(requiredCatalogString(row, 'sourceHash'), 'SourceHash'),
    createdAt: requiredCatalogNumber(row, 'createdAt'),
    updatedAt: requiredCatalogNumber(row, 'updatedAt'),
  }
}
