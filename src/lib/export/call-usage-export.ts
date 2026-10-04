import { z } from 'zod'
import { canonicalDigest, schemaDescriptorDigest } from '@/modules/common/canonical-digest'
import { escapeSpreadsheetText as csvText, formatCsvRow } from './csv-export'

const units = z.string().regex(/^(?:0|[1-9]\d*)$/u)
export const callUsageExportRowSchema = z.strictObject({
  callRef: z.string(), accountRef: z.string(), principalRef: z.string(), credentialRef: z.string(),
  applicationRef: z.string(), toolRef: z.string(), providerRef: z.string(), toolLabel: z.string(),
  state: z.enum(['completed', 'refused', 'outcome_unknown']),
  deliveryState: z.enum(['delivered', 'not_delivered', 'unknown']),
  paymentState: z.enum(['settled', 'released', 'unknown', 'not_applicable']),
  providerObligationState: z.enum(['accrued', 'held', 'payable', 'settled', 'reversed', 'disputed']).optional(),
  providerAmountUnits: units.optional(), audAmountUnits: units.optional(),
  receiptRef: z.string().optional(), recoveryRef: z.string().optional(),
  serviceUsageRef: z.string().optional(), deliveredRequestUnits: z.literal('1').optional(),
  observedAt: z.number().int().nonnegative().safe().optional(),
  latencyMs: z.number().nonnegative(),
  createdAt: z.number().int().nonnegative().safe(), updatedAt: z.number().int().nonnegative().safe(),
})
export type CallUsageExportRow = z.infer<typeof callUsageExportRowSchema>
export const callUsageExportInputSchema = z.strictObject({
  principalRef: z.string().min(1).max(500).optional(),
  periodStartAt: z.number().int().nonnegative().safe(),
  periodEndAt: z.number().int().positive().safe(),
  status: z.enum(['all', 'completed', 'refused', 'outcome_unknown']),
}).refine(({ periodStartAt, periodEndAt }) => periodEndAt > periodStartAt
  && periodEndAt - periodStartAt <= 366 * 86_400_000, { message: 'usage_period_invalid' })
export type CallUsageExportInput = z.infer<typeof callUsageExportInputSchema>

export function createCallUsageExport(
  input: CallUsageExportInput, records: CallUsageExportRow[], snapshotAt: number, scannedCount: number, accountRef: string, exportRef?: string,
) {
  let recordedCharge = 0n
  let amountCoverage: 'complete' | 'incomplete' = 'complete'
  let deliveredRequests = 0n
  let serviceUnitCoverage: 'complete' | 'incomplete' = 'complete'
  const callRefs = new Set<string>()
  const accounts = new Set<string>()
  for (const row of records) {
    if (callRefs.has(row.callRef)) throw new Error('call_export_duplicate')
    callRefs.add(row.callRef)
    accounts.add(row.accountRef)
    if (row.accountRef !== accountRef || row.createdAt < input.periodStartAt || row.createdAt >= input.periodEndAt
      || (input.principalRef !== undefined && row.principalRef !== input.principalRef)
      || (input.status !== 'all' && row.state !== input.status)) throw new Error('call_export_scope_mismatch')
    if (row.serviceUsageRef !== undefined && row.deliveredRequestUnits === '1') deliveredRequests += 1n
    else if (row.deliveryState !== 'not_delivered') serviceUnitCoverage = 'incomplete'
    if (row.paymentState === 'settled' && row.audAmountUnits !== undefined) recordedCharge += BigInt(row.audAmountUnits)
    else if (row.paymentState !== 'released'
      && !(row.paymentState === 'not_applicable' && row.state === 'refused' && row.deliveryState === 'not_delivered')) {
      amountCoverage = 'incomplete'
    }
  }
  if (accounts.size > 1) throw new Error('call_export_scope_mismatch')
  return {
    schemaVersion: 'ae.call-usage-export:v1' as const,
    exportKind: 'call_usage' as const,
    coverage: 'complete' as const,
    source: 'convex_call_projection' as const,
    authoritativeForConsequences: false as const,
    timeBasis: 'call_created' as const,
    snapshotAt, exportedAt: new Date().toISOString(),
    accountRef,
    ...(exportRef === undefined ? {} : { exportRef }),
    ...input,
    recordCountUnits: BigInt(records.length).toString(), scannedCountUnits: BigInt(scannedCount).toString(),
    serviceUnitDefinitionRef: 'delivered_request:v1' as const,
    deliveredRequestUnits: deliveredRequests.toString(), serviceUnitCoverage,
    recordedChargeCurrency: 'AUD' as const, recordedChargeExponent: 6 as const,
    // The current canonical moneyProviderObligations contract fixes USDC/6.
    // An obligation is not a claimed provider cost or confirmed transfer.
    providerObligationCurrency: 'USDC' as const, providerObligationExponent: 6 as const,
    ...(amountCoverage === 'complete' ? { recordedChargeUnits: recordedCharge.toString() } : {}),
    amountCoverage,
    // Bound and hash each record independently, then hash its ordered descriptor.
    // The capability-payload node guard must not impose a hidden export row limit.
    recordsDigestFormat: 'ae.ordered-canonical-row-digests:v1' as const,
    recordsDigest: schemaDescriptorDigest({ format: 'ae.ordered-canonical-row-digests:v1',
      recordDigests: records.map((record) => canonicalDigest(record)) }),
    records,
  }
}
export type CallUsageExport = ReturnType<typeof createCallUsageExport>

/** Exact unit strings stay strings; untrusted labels cannot become spreadsheet formulas. */
export function generateCallUsageExportCsv(document: CallUsageExport): string {
  const headers = ['Call created UTC', 'Call Ref', 'Tool', 'Provider Ref', 'Agent Ref', 'Credential Ref',
    'Application Ref', 'Call state', 'Delivery state', 'Payment state', 'Recorded charge AUD/6 units',
    'Provider obligation USDC/6 units', 'Provider obligation state', 'Delivered request units', 'Service usage Ref',
    'Receipt Ref', 'Recovery Ref', 'Period start UTC', 'Period end UTC', 'Snapshot UTC',
    'Record count', 'Records digest', 'Records digest format', 'Service unit coverage', 'Charge coverage', 'Export Ref', 'Account Ref']
  return [formatCsvRow(headers), ...document.records.map((row) => formatCsvRow([
    new Date(row.createdAt).toISOString(), csvText(row.callRef), csvText(row.toolLabel), csvText(row.providerRef),
    csvText(row.principalRef), csvText(row.credentialRef), csvText(row.applicationRef), row.state,
    row.deliveryState, row.paymentState,
    row.paymentState === 'settled' ? row.audAmountUnits ?? 'unknown'
      : row.paymentState === 'released' || (row.state === 'refused' && row.deliveryState === 'not_delivered'
        && row.paymentState === 'not_applicable') ? '0' : 'unknown',
    row.providerAmountUnits ?? 'unknown', row.providerObligationState ?? 'unknown',
    row.serviceUsageRef !== undefined ? row.deliveredRequestUnits ?? 'unknown'
      : row.deliveryState !== 'not_delivered' ? 'unknown' : '0',
    csvText(row.serviceUsageRef), csvText(row.receiptRef), csvText(row.recoveryRef),
    new Date(document.periodStartAt).toISOString(), new Date(document.periodEndAt).toISOString(),
    new Date(document.snapshotAt).toISOString(), document.recordCountUnits, document.recordsDigest,
    document.recordsDigestFormat, document.serviceUnitCoverage, document.amountCoverage, document.exportRef ?? '', csvText(document.accountRef),
  ]))].join('\r\n')
}
