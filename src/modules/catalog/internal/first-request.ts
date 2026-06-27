import type {
  FirstRequestDisclosureInput,
  PublicFirstRequestDisclosure,
  ServiceCatalogInput,
  ServiceCatalogValidationResult,
  ValidatedServiceCatalogInput,
} from '@/modules/catalog/public'

export function validateServiceCatalogInput(
  services: readonly ServiceCatalogInput[]
): ServiceCatalogValidationResult {
  if (services.length === 0) {
    return { kind: 'invalid', reason: 'empty_services' }
  }

  const validatedServices: ValidatedServiceCatalogInput[] = []
  for (const service of services) {
    const name = cleanText(service.name)
    const category = cleanText(service.category)
    const summary = cleanText(service.summary)
    const serviceArea = cleanText(service.serviceArea)
    const hoursOrUnknown = cleanText(service.hoursOrUnknown)

    if (
      name.length === 0 ||
      category.length === 0 ||
      summary.length === 0 ||
      serviceArea.length === 0 ||
      hoursOrUnknown.length === 0
    ) {
      return { kind: 'invalid', reason: 'invalid_service' }
    }

    const firstRequest = buildFirstRequestDisclosure(service.firstRequest)
    if (firstRequest === undefined) {
      return { kind: 'invalid', reason: 'invalid_first_request' }
    }

    validatedServices.push({
      name,
      category,
      summary,
      serviceArea,
      hoursOrUnknown,
      firstRequest,
    })
  }

  return { kind: 'valid', services: validatedServices }
}

export function buildFirstRequestDisclosure(input: FirstRequestDisclosureInput): PublicFirstRequestDisclosure | undefined {
  if (input.mode === 'not_available_yet') {
    const noContactReason = cleanText(input.noContactReason)
    if (noContactReason.length === 0) {
      return undefined
    }

    const fallbackDisclosure = input.publicDisclosure === undefined ? 'First request is not available yet.' : input.publicDisclosure
    const publicDisclosure = cleanText(fallbackDisclosure)
    return {
      mode: input.mode,
      publicDisclosure,
      publicChannel: input.publicChannel,
      noContactReason,
      rawContactExcluded: true,
    }
  }

  const publicDisclosure = cleanText(input.publicDisclosure)
  if (publicDisclosure.length === 0) {
    return undefined
  }

  return {
    mode: input.mode,
    publicDisclosure,
    publicChannel: input.publicChannel,
    rawContactExcluded: true,
  }
}

function cleanText(value: string): string {
  return value.replaceAll(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 280)
}
