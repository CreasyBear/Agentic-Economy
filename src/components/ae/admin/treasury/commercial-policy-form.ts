import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../../../convex/_generated/api'
import type { AdminActionInput } from '@/lib/operator/admin-console/contracts'
import { formatExactAmount, parseDecimalExactAmount, validCommercialPolicyControl, type CommercialPolicyControl, type CommercialPolicyFamily } from '@/modules/money/public'

export type PolicyPreparation = Extract<FunctionReturnType<typeof api.moneyCommercialPolicy.prepareChange>, { kind: 'ready' }>
export type PolicyInput = AdminActionInput['change_commercial_policy']
export const POLICY_LABELS: Record<CommercialPolicyFamily, string> = {
  commercial_perimeter: 'Commercial perimeter', tax: 'Tax', accounting_client_money: 'Funding and customer money',
  privacy_retention: 'Privacy and retention', treasury_custody: 'Treasury and custody', operations: 'Operations',
}
export type PolicyFields = {
  effectiveAt: string; expiresAt: string; serviceFeeTax: string; callTax: string; invoiceIssuance: string
  minimumFunding: string; maximumFunding: string; fundingIncrement: string; customerMaximum: string
  retentionDays: string; minimumBuffer: string; rpoMinutes: string; rtoMinutes: string
  serviceFee: string; pricingMargin: string; commitmentSeconds: string; reportsPerDay: string
  perimeterConfirmed: boolean; legalHoldConfirmed: boolean; custodyConfirmed: boolean
  backupConfirmed: boolean; restoreConfirmed: boolean; dailyCloseConfirmed: boolean
}
export const emptyPolicyFields = (): PolicyFields => ({
  effectiveAt: '', expiresAt: '', serviceFeeTax: '', callTax: '', invoiceIssuance: '',
  minimumFunding: '', maximumFunding: '', fundingIncrement: '', customerMaximum: '',
  retentionDays: '', minimumBuffer: '', rpoMinutes: '', rtoMinutes: '', serviceFee: '', pricingMargin: '',
  commitmentSeconds: '', reportsPerDay: '', perimeterConfirmed: false, legalHoldConfirmed: false,
  custodyConfirmed: false, backupConfirmed: false, restoreConfirmed: false, dailyCloseConfirmed: false,
})
/** Editable proposals only. Operational confirmations remain unchecked. */
export function proposedProductionPolicyFields(family: CommercialPolicyFamily, now: number): PolicyFields {
  const dates = { effectiveAt: localDate(now), expiresAt: localDate(now + 30 * 24 * 60 * 60 * 1_000) }
  const fields = { ...emptyPolicyFields(), ...dates }
  switch (family) {
    case 'commercial_perimeter': return fields
    case 'tax': return { ...fields, serviceFeeTax: '10', callTax: '0', invoiceIssuance: 'disabled_pending_approval' }
    case 'accounting_client_money': return { ...fields, minimumFunding: '5', maximumFunding: '20', fundingIncrement: '0.01', customerMaximum: '20' }
    case 'privacy_retention': return { ...fields, retentionDays: '2557' }
    case 'treasury_custody': return { ...fields, minimumBuffer: '0.50', rpoMinutes: '5', rtoMinutes: '60' }
    case 'operations': return { ...fields, serviceFee: '5', pricingMargin: '0', commitmentSeconds: '300', reportsPerDay: '3' }
  }
}
export function policyDecimal(units: string, exponent = 6): string {
  return formatExactAmount({ currency: 'AUD', units, exponent })?.replace(/(\.\d*?[1-9])0+$|\.0+$/u, '$1') ?? units
}
function localDate(timestamp: number): string {
  const date = new Date(timestamp)
  return new Date(timestamp - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
/** Only an explicit edit event copies approved business terms. Operational attestations always start unchecked. */
export function fieldsFromCurrent(current: NonNullable<PolicyPreparation['current']>): PolicyFields {
  const fields = { ...emptyPolicyFields(), effectiveAt: localDate(current.effectiveAt), expiresAt: localDate(current.expiresAt) }
  const control = current.control
  switch (control.family) {
    case 'commercial_perimeter': break
    case 'tax': Object.assign(fields, { serviceFeeTax: policyDecimal(String(control.serviceFeeTaxBps), 2), callTax: '0', invoiceIssuance: control.taxInvoiceIssuance }); break
    case 'accounting_client_money': Object.assign(fields, { minimumFunding: policyDecimal(control.minimumFundingPrincipalUnits), maximumFunding: policyDecimal(control.maximumFundingPrincipalUnits), fundingIncrement: policyDecimal(control.fundingIncrementUnits), customerMaximum: policyDecimal(control.legalCustomerMaximumAccessibleUnits) }); break
    case 'privacy_retention': fields.retentionDays = String(control.evidenceRetentionDays); break
    case 'treasury_custody': Object.assign(fields, { minimumBuffer: policyDecimal(control.minimumBufferUnits), rpoMinutes: String(control.recoveryPointObjectiveMinutes), rtoMinutes: String(control.recoveryTimeObjectiveMinutes) }); break
    case 'operations': Object.assign(fields, { serviceFee: policyDecimal(String(control.fundingServiceFeeBps), 2), pricingMargin: '0', commitmentSeconds: String(control.commitmentTtlMs / 1_000), reportsPerDay: control.paidCallReportsPerDay === undefined ? '' : String(control.paidCallReportsPerDay) }); break
  }
  return fields
}
function units(value: string, label: string): string {
  const parsed = parseDecimalExactAmount('AUD', value.trim(), 6)
  if (parsed === undefined) throw new Error(`${label}: enter a non-negative amount with up to six decimal places.`)
  return parsed.units
}
function percent(value: string, label: string): number {
  const parsed = parseDecimalExactAmount('AUD', value.trim(), 2)
  if (parsed === undefined || BigInt(parsed.units) > 10_000n) throw new Error(`${label}: enter a percentage from 0 to 100 with up to two decimal places.`)
  return Number(parsed.units)
}
function integer(value: string, label: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const result = Number(value)
  if (!/^\d+$/u.test(value.trim()) || !Number.isSafeInteger(result) || result < min || result > max) throw new Error(`${label}: enter a whole number from ${min} to ${max}.`)
  return result
}
function attest(confirmed: boolean, message: string) { if (!confirmed) throw new Error(message) }

/** Requires explicit business values and attestations; ensures exact units and a fixed reviewed input.
 * The server preparation supplies requirements, never proof of operational controls. */
export function buildPolicyInput(preparation: PolicyPreparation, fields: PolicyFields, policyRef: string): { kind: 'ready'; input: PolicyInput } | { kind: 'invalid'; message: string } {
  try {
    if (preparation.conflict) throw new Error('Conflicting active policies must be resolved before changing this family.')
    const effectiveAt = new Date(fields.effectiveAt).getTime()
    const expiresAt = new Date(fields.expiresAt).getTime()
    if (!Number.isSafeInteger(effectiveAt) || !Number.isSafeInteger(expiresAt) || expiresAt <= effectiveAt) throw new Error('Choose effective and expiry dates, with expiry after the effective date.')
    const family = preparation.family
    const pins = preparation.requirements
    let control: CommercialPolicyControl
    switch (family) {
      case 'commercial_perimeter':
        attest(fields.perimeterConfirmed, 'Confirm the commercial perimeter after reviewing its supporting evidence.')
        control = { family, sellerModel: 'principal_reseller', customerSegment: 'business_only', customerCryptoEntitlement: false }; break
      case 'tax':
        if (fields.invoiceIssuance !== 'enabled' && fields.invoiceIssuance !== 'disabled_pending_approval') throw new Error('Choose whether tax invoice issuance is approved.')
        control = { family, serviceFeeTaxBps: percent(fields.serviceFeeTax, 'Tax on credit funding'), callTaxBps: 0, taxInvoiceIssuance: fields.invoiceIssuance }; break
      case 'accounting_client_money':
        control = { family, minimumFundingPrincipalUnits: units(fields.minimumFunding, 'Minimum funding'), maximumFundingPrincipalUnits: units(fields.maximumFunding, 'Maximum funding'), fundingIncrementUnits: units(fields.fundingIncrement, 'Funding increment'), legalCustomerMaximumAccessibleUnits: units(fields.customerMaximum, 'Customer accessible limit'), balanceClassification: 'customer_contract_liability' }; break
      case 'privacy_retention':
        attest(fields.legalHoldConfirmed, 'Confirm legal-hold support and provide its evidence during review.')
        control = { family, evidenceRetentionDays: integer(fields.retentionDays, 'Evidence retention days', 1), legalHoldSupported: true }; break
      case 'treasury_custody':
        attest(fields.custodyConfirmed, 'Confirm real-money deployment and managed PostgreSQL point-in-time recovery, supported by actual evidence.')
        control = { family, treasuryAsset: 'USDC', treasuryExponent: 6, minimumBufferUnits: units(fields.minimumBuffer, 'Minimum treasury buffer'), ledgerAuthority: 'formance_community', formanceLedgerVersion: pins.ledgerVersion, formanceGatewayVersion: pins.gatewayVersion, formanceSchemaVersion: pins.schemaVersion, maximumSdkIntegerUnits: pins.maximumSdkIntegerUnits, architectureReviewCumulativeUnits: pins.architectureReviewCumulativeUnits, deploymentClass: 'real_money', postgresProtection: 'managed_pitr', recoveryPointObjectiveMinutes: integer(fields.rpoMinutes, 'Recovery point objective', 1, 5), recoveryTimeObjectiveMinutes: integer(fields.rtoMinutes, 'Recovery time objective', 1, 60) }; break
      case 'operations':
        attest(fields.backupConfirmed && fields.restoreConfirmed && fields.dailyCloseConfirmed, 'Confirm each operational control using actual backup, production restore and signed daily-close evidence.')
        control = { family, fundingServiceFeeBps: percent(fields.serviceFee, 'Funding service fee'), buyerPricingMarginBps: 0, commitmentTtlMs: integer(fields.commitmentSeconds, 'Commitment lifetime in seconds', 10, 900) * 1_000, ...(fields.reportsPerDay.trim() === '' ? {} : { paidCallReportsPerDay: integer(fields.reportsPerDay, 'Paid Call reports per day', 0, 20) }), formanceSdkVersion: pins.sdkVersion, formanceSdkArtifactDigest: pins.sdkArtifactDigest, backupControl: 'postgres_pitr', restoreControl: 'production_rehearsed', dailyCloseControl: 'human_signed' }; break
    }
    if (!validCommercialPolicyControl(control)) throw new Error('Check the policy values. Funding amounts must be positive, minimum funding must not exceed maximum, and minimum funding must be a multiple of the increment.')
    const active = preparation.current?.lifecycle === 'active' ? preparation.current : null
    return { kind: 'ready', input: { changeKind: active === null ? 'activate' : 'replace', family, environment: preparation.environment, policyRef, revision: active === null ? 1 : active.revision + 1, ...(active === null ? {} : { expectedCurrentPolicyRef: active.policyRef }), effectiveAt, expiresAt, control } }
  } catch (error) {
    return { kind: 'invalid', message: error instanceof Error ? error.message : 'Review the policy values.' }
  }
}
