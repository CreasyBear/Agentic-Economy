import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'

export type TaxProfileDiagnostic = Rule4Diagnostic

export type TaxProfileInitialData =
  | Readonly<{ kind: 'missing'; revision: 0 }>
  | Readonly<{
      kind: 'available'
      abn: string
      gstRegistered?: boolean
      legalName: string
      addressLine1: string
      addressLine2?: string
      locality: string
      region?: string
      postalCode: string
      country: 'AU'
      revision: number
    }>

export type TaxProfileInvalidField = 'legalName' | 'abn' | 'address'

export type TaxProfileSubmitPayload = Readonly<{
  abn: string
  gstRegistered: boolean
  legalName: string
  addressLine1: string
  addressLine2?: string
  locality: string
  region?: string
  postalCode: string
  country: 'AU'
  expectedRevision: number
}>

export type CustomerTaxFactsRead =
  | Readonly<{ kind: 'missing'; accountRef: string; revision: 0 }>
  | Readonly<{
      kind: 'available'
      accountRef: string
      abn: string
      gstRegistered: boolean
      legalName: string
      addressLine1: string
      addressLine2?: string
      locality: string
      region?: string
      postalCode: string
      country: 'AU'
      legalCustomerRef: string
      effectiveAt: number
      updatedAt: number
      revision: number
    }>

export type CustomerTaxFactsUpsertInput = Readonly<{
  abn: string
  legalName: string
  addressLine1: string
  addressLine2?: string
  locality: string
  region?: string
  postalCode: string
  country?: string
  gstRegistered?: boolean
  expectedRevision: number
  correlationRef: string
  idempotencyRef: string
}>

export const TAX_PROFILE_VALIDATION_DIAGNOSTIC: TaxProfileDiagnostic = {
  whatHappened: 'Invalid ABN.',
  financialImpact: 'A$0.00 affected — tax profile not saved.',
  nextStep: 'Enter an 11-digit Australian Business Number.',
}

export function taxProfileValidationDiagnostic(field: TaxProfileInvalidField): TaxProfileDiagnostic {
  if (field === 'legalName') {
    return {
      whatHappened: 'Legal business name is missing.',
      financialImpact: 'A$0.00 affected — tax profile not saved.',
      nextStep: 'Enter the registered legal name.',
    }
  }
  if (field === 'abn') return TAX_PROFILE_VALIDATION_DIAGNOSTIC
  return {
    whatHappened: 'Billing address is incomplete.',
    financialImpact: 'A$0.00 affected — tax profile not saved.',
    nextStep: 'Enter a street address, locality, and four-digit postcode.',
  }
}

export const TAX_PROFILE_SUBMIT_FAILURE_DIAGNOSTIC: TaxProfileDiagnostic = {
  whatHappened: 'Billing and tax profile could not be saved.',
  financialImpact: 'A$0.00 affected — tax profile not saved.',
  nextStep: 'Check your connection and try again. Your previous tax facts remain unchanged.',
}

export function toTaxProfileInitialData(facts: CustomerTaxFactsRead): TaxProfileInitialData {
  if (facts.kind === 'missing') {
    return { kind: 'missing', revision: 0 }
  }

  return {
    kind: 'available',
    abn: facts.abn,
    gstRegistered: facts.gstRegistered,
    legalName: facts.legalName,
    addressLine1: facts.addressLine1,
    ...(facts.addressLine2 !== undefined ? { addressLine2: facts.addressLine2 } : {}),
    locality: facts.locality,
    ...(facts.region !== undefined ? { region: facts.region } : {}),
    postalCode: facts.postalCode,
    country: 'AU',
    revision: facts.revision,
  }
}
