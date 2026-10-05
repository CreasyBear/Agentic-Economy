import { afterEach, describe, expect, it, vi } from 'vitest'
const source = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(async () => ({ accountRef: 'account:one', snapshotAt: Date.now() - 1 })) }))
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => ({
  validator: (validate: (value: unknown) => unknown) => ({ handler: (handler: (value: { data: unknown }) => Promise<unknown>) =>
    async (input: { data: unknown }) => await handler({ data: validate(input.data) }) }),
}) }))
vi.mock('@/lib/server/convex-source', async (original) => ({
  ...(await original<typeof import('@/lib/server/convex-source')>()), callSourceQuery: source.query, callSourceMutation: source.mutation,
}))
import { exportOwnerCallUsageServer } from '@/lib/server/call-usage-export.functions'
import { generateCallUsageExportCsv } from '@/lib/export/call-usage-export'
const input = { periodStartAt: 100, periodEndAt: 1000, status: 'all' as const }
function row(index: number) {
  return { callRef: `call:${index}`, accountRef: 'account:one', principalRef: 'agent:one', credentialRef: 'credential:one',
    applicationRef: 'app:one', toolRef: 'tool:one', providerRef: 'provider:one', toolLabel: '=HYPERLINK("unsafe")',
    state: 'completed' as const, deliveryState: 'delivered' as const, paymentState: 'settled' as const,
    serviceUsageRef: `usage:${index}`, deliveredRequestUnits: '1' as const,
    currentDeliveredRequestUnits: '1' as const, currentSupportVerified: true, measurementRevisionRef: `usage:${index}`,
    audAmountUnits: '9007199254740993001', latencyMs: 1, createdAt: 100 + index, updatedAt: 100 + index }
}
afterEach(() => { source.query.mockReset(); source.mutation.mockClear() })
describe('complete usage export', () => {
  it('removes arbitrary legacy receipt references from JSON and CSV export',async()=>{
    const sentinel='sk-SENTINEL-PRIVATE-EXPORT'
    source.query.mockResolvedValue({accountRef:'account:one',page:[{...row(1),receiptRef:`https://signed.example?token=${sentinel}`}],scannedCount:1,isDone:true,continueCursor:''})
    const document=await exportOwnerCallUsageServer({data:input})
    expect(JSON.stringify(document)).not.toContain(sentinel)
    expect(generateCallUsageExportCsv(document)).not.toContain(sentinel)
    expect(document.records[0]).not.toHaveProperty('receiptRef')
  })

  it('reconciles 101 exact charges and units, with manifest and safe CSV text', async () => {
    source.query.mockResolvedValueOnce({ accountRef: 'account:one', page: Array.from({ length: 50 }, (_, i) => row(i)), scannedCount: 50, isDone: false, continueCursor: 'cursor:1' })
      .mockResolvedValueOnce({ accountRef: 'account:one', page: Array.from({ length: 50 }, (_, i) => row(i + 50)), scannedCount: 50, isDone: false, continueCursor: 'cursor:2' })
      .mockResolvedValueOnce({ accountRef: 'account:one', page: [row(100)], scannedCount: 1, isDone: true, continueCursor: '' })
    const document = await exportOwnerCallUsageServer({ data: input })
    expect(document).toMatchObject({ coverage: 'complete', recordCountUnits: '101', deliveredRequestUnits: '101',
      recordedChargeUnits: (9007199254740993001n * 101n).toString(), recordedChargeCurrency: 'AUD', recordedChargeExponent: 6,
      providerObligationCurrency: 'USDC', providerObligationExponent: 6,
      amountCoverage: 'complete', serviceUnitCoverage: 'complete', timeBasis: 'call_created' })
    expect(source.query).toHaveBeenCalledTimes(3)
    const firstArgs = source.query.mock.calls[0]?.[1]
    expect(source.query.mock.calls[1]?.[1]).toMatchObject({ snapshotAt: firstArgs.snapshotAt, paginationOpts: { cursor: 'cursor:1' } })
    const csv = generateCallUsageExportCsv(document)
    expect(csv.split('\r\n')).toHaveLength(102)
    expect(csv).toContain('9007199254740993001')
    expect(csv).toContain('Provider obligation USDC/6 units')
    expect(csv).toContain("'=HYPERLINK")
    expect(document.records[0]?.toolLabel).toBe('=HYPERLINK("unsafe")')
    expect(document.recordsDigest).toMatch(/^sha256:/u)
    expect(document.exportRef).toMatch(/^call-usage-export:/u)
    expect(source.mutation).toHaveBeenCalledOnce()
  })
  it('keeps a refunded measured request and missing historic evidence distinct from zero', async () => {
    const legacy = row(2)
    const { serviceUsageRef, deliveredRequestUnits, ...unmeasured } = legacy
    void serviceUsageRef; void deliveredRequestUnits
    source.query.mockResolvedValue({ accountRef: 'account:one', page: [{ ...row(1), paymentState: 'released' }, unmeasured], scannedCount: 2, isDone: true, continueCursor: '' })
    const document = await exportOwnerCallUsageServer({ data: input })
    expect(document).toMatchObject({ deliveredRequestUnits: '1', serviceUnitCoverage: 'incomplete', recordedChargeUnits: legacy.audAmountUnits })
    source.query.mockResolvedValue({ accountRef: 'account:one', page: [{ ...row(1), paymentState: 'unknown' }], scannedCount: 1, isDone: true, continueCursor: '' })
    const uncertain = await exportOwnerCallUsageServer({ data: input })
    expect(uncertain.amountCoverage).toBe('incomplete')
    expect(uncertain).not.toHaveProperty('recordedChargeUnits')
    source.query.mockResolvedValue({ accountRef: 'account:one', page: [{ ...unmeasured, state: 'outcome_unknown', deliveryState: 'unknown', paymentState: 'unknown' }], scannedCount: 1, isDone: true, continueCursor: '' })
    const unmeasuredUncertain = await exportOwnerCallUsageServer({ data: input })
    expect(unmeasuredUncertain).toMatchObject({ deliveredRequestUnits: '0', serviceUnitCoverage: 'incomplete', amountCoverage: 'incomplete' })
    const csv = generateCallUsageExportCsv(unmeasuredUncertain)
    expect(csv.split('\r\n')[1]?.split(',')[13]).toBe('unknown')
  })
  it.each([600, 1_000])('captures %i records without inheriting the capability-payload node limit', async (count) => {
    source.query.mockImplementation(async (_reference, args) => {
      const start = args.paginationOpts.cursor === null ? 0 : Number(args.paginationOpts.cursor)
      const size = Math.min(50, count - start)
      return { accountRef: 'account:one', page: Array.from({ length: size }, (_, index) => row(start + index)),
        scannedCount: size, isDone: start + size === count, continueCursor: String(start + size) }
    })
    const document = await exportOwnerCallUsageServer({ data: { ...input, periodEndAt: 20_000 } })
    expect(document).toMatchObject({ recordCountUnits: String(count), deliveredRequestUnits: String(count),
      recordedChargeUnits: (9007199254740993001n * BigInt(count)).toString(),
      recordsDigestFormat: 'ae.ordered-canonical-row-digests:v1' })
    expect(document.recordsDigest).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(source.query).toHaveBeenCalledTimes(Math.ceil(count / 50))
  })
  it('retains canonical Account and filter metadata on an empty complete capture', async () => {
    source.query.mockResolvedValue({ accountRef: 'account:one', page: [], scannedCount: 0, isDone: true, continueCursor: '' })
    expect(await exportOwnerCallUsageServer({ data: input })).toMatchObject({ accountRef: 'account:one', ...input,
      recordCountUnits: '0', coverage: 'complete', serviceUnitCoverage: 'complete', amountCoverage: 'complete' })
  })
  it('never returns a partial capture on errors, duplicate records, cycling cursors or size limits', async () => {
    const page = { accountRef: 'account:one', page: [row(1)], scannedCount: 1, isDone: false, continueCursor: 'cursor:1' }
    source.query.mockResolvedValueOnce(page).mockRejectedValueOnce(new Error('call_export_source_changed'))
    await expect(exportOwnerCallUsageServer({ data: input })).rejects.toThrow('call_export_source_changed')
    source.query.mockResolvedValue(page)
    await expect(exportOwnerCallUsageServer({ data: input })).rejects.toThrow('call_export_cursor_invalid')
    source.query.mockResolvedValue({ ...page, page: [row(1), row(1)], isDone: true })
    await expect(exportOwnerCallUsageServer({ data: input })).rejects.toThrow('call_export_duplicate')
    source.query.mockResolvedValue({ ...page, scannedCount: 1001, isDone: true })
    await expect(exportOwnerCallUsageServer({ data: input })).rejects.toThrow('call_export_window_too_large')
    await expect(exportOwnerCallUsageServer({ data: { ...input, accountRef: 'foreign' } })).rejects.toThrow()
    source.query.mockResolvedValue({ ...page, accountRef: 'account:other', isDone: true })
    await expect(exportOwnerCallUsageServer({ data: input })).rejects.toThrow('call_export_scope_mismatch')
  })
})
