import { ExternalOperationProvenanceValues, HumanRequestChannelValues, normalizeOfferingPrice, type OfferingAccessPathDescriptor, type OfferingPrice } from '../../../../src/modules/catalog/public'
import { isRecord } from '../../../../src/modules/common/is-record'
import { optionalString, readLiteral, requiredString } from './rowReaders'

export function offeringPrice(value: unknown): OfferingPrice | undefined {
  if (!isRecord(value)) return undefined
  const allowedFields = value.kind === 'quote_only'
    ? ['kind', 'currency', 'unit', 'taxTreatment']
    : value.kind === 'fixed' || value.kind === 'from'
      ? ['kind', 'amount', 'unit', 'taxTreatment']
      : value.kind === 'range'
        ? ['kind', 'minimum', 'maximum', 'unit', 'taxTreatment']
        : undefined
  if (allowedFields === undefined || Object.keys(value).some((field) => !allowedFields.includes(field))) return undefined
  return normalizeOfferingPrice({
    ...(typeof value.kind === 'string' ? { kind: value.kind } : {}),
    ...(typeof value.currency === 'string' ? { currency: value.currency } : {}),
    ...(value.amount === undefined ? {} : { amount: value.amount }),
    ...(value.minimum === undefined ? {} : { minimum: value.minimum }),
    ...(value.maximum === undefined ? {} : { maximum: value.maximum }),
    ...(typeof value.unit === 'string' ? { unit: value.unit } : {}),
    ...(typeof value.taxTreatment === 'string' ? { taxTreatment: value.taxTreatment } : {}),
  })
}

export function readDescriptor(value: unknown): OfferingAccessPathDescriptor {
  if (!isRecord(value)) throw new Error('invalid_offering_access_path_descriptor')
  if (value.kind === 'human_request') {
    const url = optionalString(value, 'url')
    return {
      kind: 'human_request',
      channel: readLiteral(value.channel, HumanRequestChannelValues, 'channel'),
      disclosure: requiredString(value, 'disclosure'),
      ...(url === undefined ? {} : { url }),
    }
  }
  if (value.kind === 'external_operation') {
    const interfaceDescription = value.interfaceDescription
    const parsedInterface = interfaceDescription === undefined
      ? undefined
      : readInterfaceDescription(interfaceDescription)
    const method = optionalString(value, 'method')
    const documentationUrl = optionalString(value, 'documentationUrl')
    const authenticationSummary = optionalString(value, 'authenticationSummary')
    const pricingSummary = optionalString(value, 'pricingSummary')
    return {
      kind: 'external_operation',
      name: requiredString(value, 'name'),
      summary: requiredString(value, 'summary'),
      url: requiredString(value, 'url'),
      ...(method === undefined ? {} : { method }),
      ...(documentationUrl === undefined ? {} : { documentationUrl }),
      ...(parsedInterface === undefined ? {} : { interfaceDescription: parsedInterface }),
      ...(authenticationSummary === undefined ? {} : { authenticationSummary }),
      ...(pricingSummary === undefined ? {} : { pricingSummary }),
      provenance: readLiteral(value.provenance, ExternalOperationProvenanceValues, 'provenance'),
    }
  }
  throw new Error('invalid_offering_access_path_descriptor')
}

function readInterfaceDescription(value: unknown): { format: string; url?: string } {
  if (!isRecord(value)) throw new Error('invalid_offering_interface_description')
  const url = optionalString(value, 'url')
  return { format: requiredString(value, 'format'), ...(url === undefined ? {} : { url }) }
}
