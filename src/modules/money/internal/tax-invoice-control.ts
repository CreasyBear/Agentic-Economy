import { z } from 'zod'

import { canonicalDigest } from '../../common/canonical-digest'
import type { CommercialPolicyControls } from './commercial-policy'

const ABN_WEIGHTS = Object.freeze([10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19])

export type CustomerTaxFacts = Readonly<{
  abn?: string
  legalName?: string
  gstRegistered: boolean
  legalCustomerRef: string
  effectiveAt: number
}>

export type TaxInvoiceIssuanceWithheldReason =
  | 'policy_disabled'
  | 'customer_tax_facts_missing'
  | 'customer_abn_invalid'
  | 'original_tax_facts_invalid'

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
  totalUnits: string
}>): TaxInvoiceIssuanceAdmission {
  if (input.taxControl.taxInvoiceIssuance === 'disabled_pending_approval') {
    return Object.freeze({ kind: 'withheld', reason: 'policy_disabled' })
  }
  if (!/^\d{1,30}$/u.test(input.totalUnits)) {
    return Object.freeze({ kind: 'withheld', reason: 'original_tax_facts_invalid' })
  }
  const customerTaxFacts = input.customerTaxFacts
  if (customerTaxFacts?.abn !== undefined && !isValidAbn(customerTaxFacts.abn)) {
    return Object.freeze({ kind: 'withheld', reason: 'customer_abn_invalid' })
  }
  // ATO GSTR 2013/1 para 72: recipient identity OR ABN at A$1,000.
  // Customer GST registration is not a supplier tax-invoice prerequisite.
  if (BigInt(input.totalUnits) >= 1_000_000_000n
    && !customerTaxFacts?.legalName?.trim() && customerTaxFacts?.abn === undefined) {
    return Object.freeze({ kind: 'withheld', reason: 'customer_tax_facts_missing' })
  }
  return Object.freeze({ kind: 'admitted' })
}

// Official ABR extract, 3 October 2026:
// https://abr.business.gov.au/ABN/View?abn=98700838115
// Identity and GST registration are facts; they do not approve a supply's tax treatment.
export const AUSTRALIAN_INVOICE_SELLER = Object.freeze({
  legalName: 'AGENTIC ECONOMY TECHNOLOGIES PTY LTD',
  abn: '98700838115',
  gstEffectiveDate: '2026-07-29',
  evidenceRef: 'https://abr.business.gov.au/ABN/View?abn=98700838115',
  verifiedOn: '2026-10-03',
})

const text = z.string().trim().min(1).max(500)
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u)
const units = z.string().regex(/^(?:0|[1-9]\d{0,29})$/u)
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000)
const policyEvidence = z.strictObject({
  policyRef: text,
  revision: z.number().int().positive(),
  evidenceRef: text,
  evidenceDigest: digest,
  approvedByPrincipalRef: text,
})
const customer = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('not_recorded'), legalCustomerRef: text }),
  z.strictObject({
    kind: z.literal('identified'), legalCustomerRef: text,
    legalName: text.nullable(), abn: z.string().refine(isValidAbn).nullable(),
    addressLines: z.array(text).max(5), revision: z.number().int().nonnegative(),
    effectiveAt: timestamp,
  }).refine(value => value.legalName !== null || value.abn !== null),
])
const documentFields = {
  format: z.literal('ae.tax-document:v1'),
  documentRef: text,
  documentNumber: text,
  accountRef: text,
  legalCustomerRef: text,
  environment: z.enum(['sandbox', 'production']),
  currency: z.literal('AUD'),
  exponent: z.literal(6),
  issuedAt: timestamp,
  seller: z.strictObject({
    legalName: text, abn: z.string().refine(isValidAbn),
    gstEffectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    evidenceRef: z.url().max(500), verifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  }),
  customer,
  source: z.strictObject({
    commandRef: text, transactionRef: text, eventRef: text, occurredAt: timestamp,
    evidenceDigest: digest, inputDigest: digest,
    policyRefs: z.array(text).min(1).max(32), policyDigest: digest,
  }),
  tax: z.strictObject({
    basis: z.literal('funding_principal_plus_service_fee'),
    rateBps: z.literal(1_000), rounding: z.literal('nearest_cent_half_up'),
    originalApproval: policyEvidence,
  }),
  issuanceApproval: policyEvidence,
  supply: z.strictObject({
    description: z.literal('Account credit top-up and service fee'),
    quantity: z.literal(1), principalUnits: units, serviceFeeUnits: units,
    netUnits: units, gstUnits: units, totalUnits: units,
  }),
}

/** Requires attributed funding amounts and original tax approval, not a current rate guess.
 * Ensures a complete, frozen AUD invoice or linked full-refund adjustment.
 * Invariant: principal + fee = net; net + GST = total; buyer identity matches its source.
 * On violation: parsing refuses issuance; no historical values are repaired or recalculated.
 *
 * COMPLEXITY: one versioned union adds an explicit content contract to the existing
 * document snapshot. It buys one validation boundary for issuance, HTML and CSV;
 * keep it here instead of a new invoice store, tax engine or renderer service.
 * ATO fields: GSTR 2013/1 para 72; adjustments: GSTR 2013/2 para 12.
 * https://www.ato.gov.au/law/view/document?docid=GST/GSTR20131/NAT/ATO/00001
 * https://www.ato.gov.au/law/view/document?docid=GST/GSTR20132/NAT/ATO/00001
 */
export const taxDocumentSnapshotSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...documentFields, kind: z.literal('tax_invoice') }),
  z.strictObject({
    ...documentFields, kind: z.literal('adjustment'),
    original: z.strictObject({
      documentRef: text, documentNumber: text, issuedAt: timestamp,
      renderInputDigest: digest,
    }),
    refund: z.strictObject({
      refundRef: text, transactionRef: text, eventRef: text,
      occurredAt: timestamp, evidenceDigest: digest,
      reason: z.literal('Full refund of account credit top-up and service fee'),
    }),
  }),
]).superRefine((value, ctx) => {
  // Refinements can run after field checks fail; malformed amounts must refuse, not throw.
  if (![value.supply.principalUnits, value.supply.serviceFeeUnits, value.supply.netUnits,
    value.supply.gstUnits, value.supply.totalUnits].every(amount => /^(?:0|[1-9]\d{0,29})$/u.test(amount))) return
  const principal = BigInt(value.supply.principalUnits)
  const fee = BigInt(value.supply.serviceFeeUnits)
  const net = BigInt(value.supply.netUnits)
  const gst = BigInt(value.supply.gstUnits)
  const total = BigInt(value.supply.totalUnits)
  // Check the recorded amount against its original 10% basis; never replace it.
  const expectedGst = ((net + 50_000n) / 100_000n) * 10_000n
  if (principal <= 0n || principal + fee !== net || net + gst !== total || gst !== expectedGst
    || [principal, fee, gst, total].some(amount => amount % 10_000n !== 0n)) {
    ctx.addIssue({ code: 'custom', message: 'Recorded funding amounts do not match the original tax basis.' })
  }
  if (value.customer.legalCustomerRef !== value.legalCustomerRef
    || (total >= 1_000_000_000n && value.customer.kind !== 'identified')) {
    ctx.addIssue({ code: 'custom', message: 'Required recipient identity does not match the funding source.' })
  }
  const sourceDate = new Date(value.source.occurredAt)
  if (value.issuedAt < value.source.occurredAt || Number.isNaN(sourceDate.getTime())
    || sourceDate.toISOString().slice(0, 10) < value.seller.gstEffectiveDate) {
    ctx.addIssue({ code: 'custom', message: 'Document dates precede the source or seller GST registration.' })
  }
  if (value.kind === 'adjustment' && (value.original.documentRef === value.documentRef
    || value.refund.occurredAt < value.source.occurredAt || value.issuedAt < value.refund.occurredAt)) {
    ctx.addIssue({ code: 'custom', message: 'Adjustment does not follow its original supply.' })
  }
})

export type TaxDocumentSnapshot = z.infer<typeof taxDocumentSnapshotSchema>
export type TaxInvoiceSnapshot = Extract<TaxDocumentSnapshot, { kind: 'tax_invoice' }>

export function parseTaxDocumentSnapshot(value: unknown): TaxDocumentSnapshot | undefined {
  const parsed = taxDocumentSnapshotSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function taxDocumentNumber(documentRef: string, kind: TaxDocumentSnapshot['kind']): string {
  // Full source digest is retained in documentRef/renderInputDigest; 128 bits is
  // a stable readable number without introducing a globally contended counter.
  return `${kind === 'tax_invoice' ? 'AE' : 'AE-CN'}-${canonicalDigest(documentRef).slice(7, 39).toUpperCase()}`
}
