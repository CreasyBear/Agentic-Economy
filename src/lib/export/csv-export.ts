export type ActivityExportRow = Readonly<{
  date: string
  callRef: string
  toolName: string
  provider: string
  agentName: string
  costAud: string
  gstAud: string
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

export const ACTIVITY_CSV_HEADERS: readonly string[] = [
  'Date',
  'Call ID',
  'Tool Name',
  'Provider',
  'Agent Name',
  'Cost AUD',
  'GST AUD',
  'Status',
]

export function generateCallsCsv(rows: readonly ActivityExportRow[]): string {
  const headerLine = formatCsvRow(ACTIVITY_CSV_HEADERS)
  const dataLines = rows.map((row) =>
    formatCsvRow([
      row.date,
      row.callRef,
      row.toolName,
      row.provider,
      row.agentName,
      row.costAud,
      row.gstAud,
      row.status,
    ])
  )
  return [headerLine, ...dataLines].join('\r\n')
}

export function downloadCsv(filename: string, csvContent: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
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
