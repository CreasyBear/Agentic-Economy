import { describe, expect, it } from 'vitest'

import { formatCsvRow, generateCallsCsv, type ActivityExportRow } from '@/lib/export/csv-export'

describe('RFC 4180 CSV Export Engine (W-40)', () => {
  it('escapes special characters, commas, quotes, and newlines according to RFC 4180', () => {
    expect(formatCsvRow(['simple', 'value'])).toBe('simple,value')
    expect(formatCsvRow(['contains,comma', 'value'])).toBe('"contains,comma",value')
    expect(formatCsvRow(['quotes "inside"', 'value'])).toBe('"quotes ""inside""",value')
    expect(formatCsvRow(['line1\nline2', 'value'])).toBe('"line1\nline2",value')
  })

  it('generates compliant CSV string with expected headers and formatted rows', () => {
    const rows: ActivityExportRow[] = [
      {
        date: '2026-09-18T05:00:00.000Z',
        callRef: 'call:12345',
        toolName: 'Australian Tax Calculator',
        provider: 'Acme Corp',
        agentName: 'Cursor Agent',
        costAud: '0.10',
        gstAud: '0.01',
        netAud: '0.09',
        status: 'completed',
      },
      {
        date: '2026-09-18T06:00:00.000Z',
        callRef: 'call:67890',
        toolName: 'Postal Lookup, Sydney',
        provider: 'FastAPI "LLC"',
        agentName: 'Claude Desktop',
        costAud: '0.25',
        gstAud: '0.03',
        netAud: '0.22',
        status: 'refused',
      },
    ]

    const csv = generateCallsCsv(rows)
    const lines = csv.split('\r\n')

    expect(lines[0]).toBe('Date,Call ID,Tool Name,Provider,Agent Name,Cost AUD,GST AUD,Net AUD,Status')
    expect(lines[1]).toBe('2026-09-18T05:00:00.000Z,call:12345,Australian Tax Calculator,Acme Corp,Cursor Agent,0.10,0.01,0.09,completed')
    expect(lines[2]).toBe('2026-09-18T06:00:00.000Z,call:67890,"Postal Lookup, Sydney","FastAPI ""LLC""",Claude Desktop,0.25,0.03,0.22,refused')
  })
})
