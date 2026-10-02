import type { CommercialPolicyControls } from './commercial-policy'

const ABN_WEIGHTS = Object.freeze([10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19])

export type CustomerTaxFacts = Readonly<{
  abn: string
  gstRegistered: boolean
  legalCustomerRef: string
  effectiveAt: number
}>

export type TaxInvoiceIssuanceWithheldReason =
  | 'policy_disabled'
  | 'customer_tax_facts_missing'
  | 'customer_abn_invalid'
  | 'customer_not_gst_registered'

export type TaxInvoiceIssuanceAdmission =
  | Readonly<{ kind: 'admitted' }>
  | Readonly<{ kind: 'withheld'; reason: TaxInvoiceIssuanceWithheldReason }>

export function normalizeAbn(value: string): string {
  return value.replace(/[\s-]/gu, '')
}

export function formatAbnDisplay(digits: string): string {
  const cleaned = normalizeAbn(digits).slice(0, 11)
  if (cleaned.length <= 2) return cleaned
  if (cleaned.length <= 5) return `${cleaned.slice(0, 2)} ${cleaned.slice(2)}`
  if (cleaned.length <= 8) return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 5)} ${cleaned.slice(5)}`
  return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`
}

export function isValidAbn(abn: string): boolean {
  if (!/^\d{11}$/u.test(abn)) return false
  const digits = [...abn].map(Number)
  const first = digits[0]
  if (first === undefined) return false
  digits[0] = first - 1
  let sum = 0
  for (let index = 0; index < ABN_WEIGHTS.length; index += 1) {
    const digit = digits[index]
    const weight = ABN_WEIGHTS[index]
    if (digit === undefined || weight === undefined) return false
    sum += digit * weight
  }
  return sum % 89 === 0
}

export function admitTaxInvoiceIssuance(input: Readonly<{
  taxControl: CommercialPolicyControls['tax']
  customerTaxFacts?: CustomerTaxFacts
}>): TaxInvoiceIssuanceAdmission {
  if (input.taxControl.taxInvoiceIssuance === 'disabled_pending_approval') {
    return Object.freeze({ kind: 'withheld', reason: 'policy_disabled' })
  }
  const customerTaxFacts = input.customerTaxFacts
  if (customerTaxFacts === undefined) {
    return Object.freeze({ kind: 'withheld', reason: 'customer_tax_facts_missing' })
  }
  if (!isValidAbn(customerTaxFacts.abn)) {
    return Object.freeze({ kind: 'withheld', reason: 'customer_abn_invalid' })
  }
  if (customerTaxFacts.gstRegistered !== true) {
    return Object.freeze({ kind: 'withheld', reason: 'customer_not_gst_registered' })
  }
  return Object.freeze({ kind: 'admitted' })
}
