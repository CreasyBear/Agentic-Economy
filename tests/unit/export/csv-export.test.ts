/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  downloadCsv,
  downloadJson,
  formatExportingPreview,
  formatExportSuccessToast,
  formatCsvRow,
  generateCallsCsv,
  generateInvoicesCsv,
  type ActivityExportRow,
  type InvoiceExportRow,
} from '@/lib/export/csv-export'

describe('RFC 4180 CSV Export Engine (W-40)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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
        status: 'completed',
      },
      {
        date: '2026-09-18T06:00:00.000Z',
        callRef: 'call:67890',
        toolName: 'Postal Lookup, Sydney',
        provider: 'FastAPI "LLC"',
        agentName: 'Claude Desktop',
        costAud: '0.25',
        status: 'refused',
      },
    ]

    const csv = generateCallsCsv(rows)
    const lines = csv.split('\r\n')

    expect(lines[0]).toBe('Date,Call ID,Tool Name,Provider,Agent Name,Recorded Charge AUD,Status')
    expect(lines[1]).toBe('2026-09-18T05:00:00.000Z,call:12345,Australian Tax Calculator,Acme Corp,Cursor Agent,0.10,completed')
    expect(lines[2]).toBe('2026-09-18T06:00:00.000Z,call:67890,"Postal Lookup, Sydney","FastAPI ""LLC""",Claude Desktop,0.25,refused')
  })

  it('generates invoice CSV with eight columns', () => {
    const rows: InvoiceExportRow[] = [
      {
        date: '2026-09-18T00:00:00.000Z',
        commandRef: 'funding:1',
        description: 'Account top-up',
        amountAud: '5.28',
        gstAud: '0.48',
        netAud: '4.80',
        status: 'Paid',
        taxInvoice: 'issued',
      },
    ]
    const csv = generateInvoicesCsv(rows)
    const header = csv.split('\r\n')[0] ?? ''
    expect(header.split(',')).toHaveLength(8)
    expect(header).toContain('GST AUD')
    expect(header).toContain('Net AUD')
  })

  it('formatExportingPreview handles singular, plural, and loaded-only copy', () => {
    expect(formatExportingPreview(1)).toBe('Exporting 1 record')
    expect(formatExportingPreview(3)).toBe('Exporting 3 records')
    expect(formatExportingPreview(2, { loadedOnly: true })).toBe('Exporting 2 loaded records')
  })

  it('formatExportSuccessToast handles singular and plural counts', () => {
    expect(formatExportSuccessToast(1, 'CSV')).toBe('Exported 1 record to CSV')
    expect(formatExportSuccessToast(4, 'JSON')).toBe('Exported 4 records to JSON')
  })

  it('downloadCsv prepends UTF-8 BOM for Excel compatibility', () => {
    const createObjectURL = vi.fn(() => 'blob:csv')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const blobCtor = vi.spyOn(globalThis, 'Blob')

    downloadCsv('export.csv', 'a,b')

    expect(blobCtor).toHaveBeenCalledOnce()
    const parts = blobCtor.mock.calls[0]?.[0]
    expect(parts).toEqual(['\uFEFFa,b'])
    expect(clickSpy).toHaveBeenCalled()
    clickSpy.mockRestore()
    blobCtor.mockRestore()
  })

  it('downloadJson stringifies data with indentation and json suffix', async () => {
    const createObjectURL = vi.fn(() => 'blob:json')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })

    const setAttribute = vi.fn()
    const click = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      setAttribute,
      style: {},
      click,
    } as unknown as HTMLAnchorElement)
    vi.spyOn(document.body, 'append').mockImplementation(() => {})
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => ({} as Node))

    downloadJson('billing-topups', { ok: true })

    expect(setAttribute).toHaveBeenCalledWith('download', 'billing-topups.json')
    const blob = (createObjectURL.mock.calls[0] as unknown[])?.[0] as Blob
    const text = await blob.text()
    expect(text).toBe(`${JSON.stringify({ ok: true }, null, 2)}\n`)
    expect(blob.type).toBe('application/json;charset=utf-8;')
  })

  it('downloadCsv and downloadJson throw when document is unavailable', () => {
    const originalDocument = globalThis.document
    Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true })
    expect(() => downloadCsv('x.csv', 'a')).toThrow(/browser document/i)
    expect(() => downloadJson('x.json', {})).toThrow(/browser document/i)
    Object.defineProperty(globalThis, 'document', { value: originalDocument, configurable: true })
  })
})
