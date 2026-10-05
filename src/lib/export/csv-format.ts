/** Existing CSV/spreadsheet encoding shared by browser and report workers. */
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
