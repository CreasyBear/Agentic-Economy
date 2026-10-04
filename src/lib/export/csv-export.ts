export type ActivityExportRow = Readonly<{
  date: string
  callRef: string
  toolName: string
  provider: string
  agentName: string
  costAud: string
  status:
    | 'completed'
    | 'failed'
    | 'pending'
    | 'delivered'
    | 'refunded'
    | 'Open — pending'
    | 'Open — outcome uncertain'
    | 'Resolved — delivered'
    | 'Resolved — refunded'
    | 'Resolved — failed'
    | (string & {})
}>

export type InvoiceExportRow = Readonly<{
  date: string
  commandRef: string
  description: string
  amountAud: string
  gstAud: string
  netAud: string
  status:
    | 'completed'
    | 'failed'
    | 'pending'
    | 'delivered'
    | 'refunded'
    | 'Open — pending'
    | 'Open — outcome uncertain'
    | 'Resolved — delivered'
    | 'Resolved — refunded'
    | 'Resolved — failed'
    | (string & {})
  taxInvoice: string
}>

export type AeExportDocument<T> = Readonly<{
  exportKind: string
  exportedAt: string
  recordCount: number
  records: readonly T[]
}>

export const EXPORT_ERROR_WHAT = 'Could not export records.'
export const EXPORT_ERROR_IMPACT =
  'A$0.00 charged — your account data is unaffected. Please try again or select a different format.'

const UTF8_BOM = '\uFEFF'

export const INVOICE_CSV_HEADERS: readonly string[] = [
  'Date',
  'Command Ref',
  'Description',
  'Amount AUD',
  'GST AUD',
  'Net AUD',
  'Status',
  'Tax Invoice',
]

export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return ''
  }
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function formatCsvRow(fields: readonly (string | number | null | undefined)[]): string {
  return fields.map(escapeCsvField).join(',')
}

export function escapeSpreadsheetText(value: string | undefined): string {
  const text = value ?? ''
  return /^[\s\u0000-\u001f]*[=+\-@]/u.test(text) ? `'${text}` : text
}

export const ACTIVITY_CSV_HEADERS: readonly string[] = [
  'Date',
  'Call ID',
  'Tool Name',
  'Provider',
  'Agent Name',
  'Recorded Charge AUD',
  'Status',
]

export function generateCallsCsv(rows: readonly ActivityExportRow[]): string {
  const headerLine = formatCsvRow(ACTIVITY_CSV_HEADERS)
  const dataLines = rows.map((row) =>
    formatCsvRow([
      row.date,
      escapeSpreadsheetText(row.callRef),
      escapeSpreadsheetText(row.toolName),
      escapeSpreadsheetText(row.provider),
      escapeSpreadsheetText(row.agentName),
      row.costAud,
      escapeSpreadsheetText(row.status),
    ])
  )
  return [headerLine, ...dataLines].join('\r\n')
}

export function generateInvoicesCsv(rows: readonly InvoiceExportRow[]): string {
  const headerLine = formatCsvRow(INVOICE_CSV_HEADERS)
  const dataLines = rows.map((row) =>
    formatCsvRow([
      row.date,
      row.commandRef,
      row.description,
      row.amountAud,
      row.gstAud,
      row.netAud,
      row.status,
      row.taxInvoice,
    ])
  )
  return [headerLine, ...dataLines].join('\r\n')
}

export function formatExportingPreview(
  count: number,
  options?: Readonly<{ loadedOnly?: boolean }>,
): string {
  const loadedPrefix = options?.loadedOnly === true ? 'loaded ' : ''
  const noun = count === 1 ? 'record' : 'records'
  return `Exporting ${count} ${loadedPrefix}${noun}`
}

export function formatExportSuccessToast(count: number, format: 'CSV' | 'JSON'): string {
  const noun = count === 1 ? 'record' : 'records'
  return `Exported ${count} ${noun} to ${format}`
}

export function toExportDocument<T>(exportKind: string, records: readonly T[]): AeExportDocument<T> {
  return {
    exportKind,
    exportedAt: new Date().toISOString(),
    recordCount: records.length,
    records,
  }
}

function assertDownloadDom(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Export download requires a browser document.')
  }
}

export function downloadCsv(filename: string, csvContent: string): void {
  assertDownloadDom()
  const blob = new Blob([`${UTF8_BOM}${csvContent}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`)
  link.style.visibility = 'hidden'
  document.body.append(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function downloadJson(filename: string, data: unknown): void {
  assertDownloadDom()
  const json = `${JSON.stringify(data, null, 2)}\n`
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename.endsWith('.json') ? filename : `${filename}.json`)
  link.style.visibility = 'hidden'
  document.body.append(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
