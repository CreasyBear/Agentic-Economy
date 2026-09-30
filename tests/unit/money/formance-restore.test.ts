import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FormanceConfiguration } from '@/modules/money/formance'
import { readFormanceRestoreSnapshot } from '@/modules/money/formance-restore'

const configuration: FormanceConfiguration = {
  environment: 'sandbox', gatewayUrl: 'https://restore.example', ledger: 'restore-ledger', requestTimeoutMs: 10_000,
  accessClientId: 'private-client', accessClientSecret: 'private-secret',
}
const clock = '2026-10-01T01:02:03.123456Z'
type WireRow = Record<string, unknown>
function transaction(id: number): WireRow {
  return { id, reference: `original:${id}`, timestamp: clock, insertedAt: clock, updatedAt: clock,
    reverted: false, template: 'UNKNOWN_TEMPLATE', schemaVersion: 'v-historical', metadata: { unrelated: 'retained' },
    postings: [{ source: 'world', destination: 'unknown:family', asset: 'USDC/6', amount: 7 }],
    nativeExtension: { exact: 'preserved' } }
}
function account(address = 'world', input = 0, output = 7): WireRow {
  return { address, metadata: { unrelated: 'account-evidence' }, firstUsage: clock, insertionDate: clock, updatedAt: clock,
    volumes: { 'USDC/6': { input, output, balance: input - output } },
    effectiveVolumes: { 'USDC/6': { input, output, balance: input - output } } }
}
function schema(version = 'v-historical', script = 'send [USDC/6 7] (source = @world destination = @unknown:family)'): WireRow {
  return { version, createdAt: clock,
    chart: { world: { '.self': { nativeLeaf: 'retain-even-when-SDK-strips' } }, unknown: { '.pattern': '.*' } },
    queries: { known: { description: 'native query', body: { $match: { account: 'world' } }, resource: 'accounts',
      params: { resource: 'accounts', pageSize: 15 }, vars: {} } },
    transactions: { UNKNOWN_TEMPLATE: { runtime: 'machine', description: 'complete script', script } },
    nativeSchemaExtension: { value: 'retained' } }
}
type FixtureOptions = {
  transactions?: WireRow[]; accounts?: WireRow[]; schemas?: WireRow[]
  page?: (category: string, payload: WireRow, url: URL) => WireRow
  ledger?: WireRow
  rawTransactionNumber?: string
}
/** Only the external HTTP boundary is replaced; all SDK transport/decoding and the reader execute. */
function fixture(options: FixtureOptions = {}) {
  const rows: Record<string, WireRow[]> = {
    transactions: options.transactions ?? [transaction(1)], accounts: options.accounts ?? [account()], schemas: options.schemas ?? [schema()],
  }
  const requests: Request[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const request = input instanceof Request ? input : new Request(input)
    requests.push(request)
    const url = new URL(request.url)
    const category = url.pathname.split('/').at(-1)!
    if (category === configuration.ledger) return Response.json({ data: options.ledger ?? {
      name: configuration.ledger, bucket: 'default', id: 4, addedAt: clock,
      features: { ACCOUNT_METADATA: 'SYNC', TRANSACTION_METADATA: 'SYNC' }, metadata: { unrelated: 'ledger-evidence' },
    } })
    if (!(category in rows)) throw new Error(`unexpected_external_path:${url.pathname}`)
    const cursor = url.searchParams.get('cursor')
    const start = cursor === null ? 0 : Number(cursor.split(':')[1])
    const selected = rows[category]!
    const data = selected.slice(start, start + 250)
    const hasMore = start + data.length < selected.length
    const payload = { cursor: { pageSize: 250, data, hasMore, ...(hasMore ? { next: `${category}:${start + data.length}` } : {}) } }
    const responsePayload = options.page?.(category, payload, url) ?? payload
    if (category === 'transactions' && options.rawTransactionNumber !== undefined) {
      return new Response(JSON.stringify(responsePayload).replace('"amount":7', `"amount":${options.rawTransactionNumber}`), {
        headers: { 'content-type': 'application/json' },
      })
    }
    return Response.json(responsePayload)
  }))
  return { requests }
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers() })

describe('complete native restore snapshot', () => {
  it('walks more than 1000 transactions and retains exact raw identity, clocks, reversion and schema content', async () => {
    const rows = Array.from({ length: 1007 }, (_, index) => transaction(index + 1))
    rows[0] = { ...rows[0], reverted: true, revertedAt: clock }
    const external = fixture({ transactions: rows, accounts: [account('world'), account('unknown:family', 7, 7),
      { address: 'unused:metadata', metadata: {}, volumes: {}, effectiveVolumes: {} }] })
    const result = await readFormanceRestoreSnapshot(configuration)
    expect(result.kind).toBe('available')
    if (result.kind !== 'available') throw new Error(result.code)
    expect(result.snapshot.summary.counts).toEqual({ transactions: 1007, accounts: 3, schemas: 1 })
    expect(result.snapshot.transactions[0]).toMatchObject({ id: '1', timestamp: clock, insertedAt: clock, updatedAt: clock,
      reverted: true, revertedAt: clock, template: 'UNKNOWN_TEMPLATE', schemaVersion: 'v-historical', nativeExtension: { exact: 'preserved' },
      metadata: { unrelated: 'retained' }, postings: [{ source: 'world', destination: 'unknown:family', asset: 'USDC/6', amount: '7' }] })
    expect(result.snapshot.accounts.find(row => row.address === 'world')?.volumes).toEqual({ 'USDC/6': { input: '0', output: '7', balance: '-7' } })
    expect(result.snapshot.accounts.find(row => row.address === 'unknown:family')?.volumes).toEqual({ 'USDC/6': { input: '7', output: '7', balance: '0' } })
    expect(result.snapshot.schemas[0]).toEqual(schema())
    expect(result.snapshot.ledgerData).toMatchObject({ id: '4', addedAt: clock, features: { ACCOUNT_METADATA: 'SYNC' }, metadata: { unrelated: 'ledger-evidence' } })
    const transactionRequests = external.requests.filter(request => new URL(request.url).pathname.endsWith('/transactions'))
    expect(transactionRequests).toHaveLength(5)
    expect(new URL(transactionRequests[0]!.url).searchParams.get('pageSize')).toBe('250')
    expect([...new URL(transactionRequests[1]!.url).searchParams.keys()]).toEqual(['cursor'])
    expect(external.requests.every(request => request.method === 'GET'
      && request.headers.get('CF-Access-Client-Secret') === 'private-secret')).toBe(true)
    expect(JSON.stringify(result)).not.toContain('private-secret')
  })

  it('hashes full same-version schema and exact submillisecond clocks rather than SDK-normalized projections', async () => {
    fixture()
    const first = await readFormanceRestoreSnapshot(configuration)
    fixture({ schemas: [schema('v-historical', 'send [USDC/6 8] (source = @world destination = @unknown:family)')],
      transactions: [{ ...transaction(1), timestamp: '2026-10-01T01:02:03.123457Z' }] })
    const changed = await readFormanceRestoreSnapshot(configuration)
    expect(first.kind).toBe('available'); expect(changed.kind).toBe('available')
    if (first.kind !== 'available' || changed.kind !== 'available') throw new Error('snapshot_unavailable')
    expect(changed.snapshot.summary.digests.schemas).not.toBe(first.snapshot.summary.digests.schemas)
    expect(changed.snapshot.summary.digests.transactions).not.toBe(first.snapshot.summary.digests.transactions)
  })

  it('sorts all native identities and detects same-total account redistribution', async () => {
    fixture({ accounts: [account('world'), account('unknown:a', 7, 0)], schemas: [schema('v-z'), schema('v-a')] })
    const first = await readFormanceRestoreSnapshot(configuration)
    fixture({ accounts: [account('unknown:b', 7, 0), account('world')], schemas: [schema('v-a'), schema('v-z')] })
    const second = await readFormanceRestoreSnapshot(configuration)
    if (first.kind !== 'available' || second.kind !== 'available') throw new Error('snapshot_unavailable')
    expect(first.snapshot.schemas.map(row => row.version)).toEqual(['v-a', 'v-z'])
    expect(first.snapshot.summary.digests.schemas).toBe(second.snapshot.summary.digests.schemas)
    expect(first.snapshot.summary.digests.accounts).not.toBe(second.snapshot.summary.digests.accounts)
  })

  it.each(['volumes', 'effectiveVolumes'])('refuses a missing %s expansion instead of inventing empty or zero evidence', async field => {
    const incomplete = account(); delete incomplete[field]
    fixture({ accounts: [incomplete] })
    expect(await readFormanceRestoreSnapshot(configuration)).toEqual({ kind: 'unavailable', code: 'formance_restore_response_invalid' })
  })

  it('refuses an inconsistent signed balance or different native ledger identity', async () => {
    fixture({ accounts: [{ ...account(), volumes: { 'USDC/6': { input: 0, output: 7, balance: 0 } } }] })
    expect(await readFormanceRestoreSnapshot(configuration)).toEqual({ kind: 'unavailable', code: 'formance_restore_response_invalid' })
    fixture({ ledger: { name: 'another-ledger', bucket: 'default', addedAt: clock } })
    expect(await readFormanceRestoreSnapshot(configuration)).toEqual({ kind: 'unavailable', code: 'formance_restore_ledger_identity_mismatch' })
  })

  it.each(['id', 'amount', 'balance', 'unknown'])('refuses unsafe wire integers in %s without emitting partial evidence', async field => {
    const row = transaction(1)
    const subject = account()
    if (field === 'id') row.id = Number.MAX_SAFE_INTEGER + 1
    if (field === 'amount') row.postings = [{ source: 'world', destination: 'unknown', asset: 'USDC/6', amount: Number.MAX_SAFE_INTEGER + 1 }]
    if (field === 'balance') subject.volumes = { 'USDC/6': { input: 0, output: 0, balance: -(Number.MAX_SAFE_INTEGER + 1) } }
    if (field === 'unknown') row.nativeExtension = { futureNumber: Number.MAX_SAFE_INTEGER + 1 }
    fixture({ transactions: [row], accounts: [subject] })
    expect(await readFormanceRestoreSnapshot(configuration)).toEqual({ kind: 'unavailable', code: 'formance_restore_numeric_precision_unsupported' })
  })

  it.each(['9007199254740990.9', '7e0', '7.0'])('refuses the unsupported numeric wire token %s before JavaScript rounds it', async rawTransactionNumber => {
    fixture({ rawTransactionNumber })
    expect(await readFormanceRestoreSnapshot(configuration)).toEqual({ kind: 'unavailable', code: 'formance_restore_numeric_precision_unsupported' })
  })

  it('refuses a transaction without its native insertion clock', async () => {
    const incomplete = transaction(1); delete incomplete.insertedAt
    fixture({ transactions: [incomplete] })
    expect(await readFormanceRestoreSnapshot(configuration)).toEqual({ kind: 'unavailable', code: 'formance_restore_response_invalid' })
  })

  it.each(['transactions', 'accounts', 'schemas'])('refuses duplicate %s identities', async category => {
    const options: FixtureOptions = category === 'transactions' ? { transactions: [transaction(1), transaction(1)] }
      : category === 'accounts' ? { accounts: [account(), account()] } : { schemas: [schema(), schema()] }
    fixture(options)
    expect(await readFormanceRestoreSnapshot(configuration)).toEqual({ kind: 'unavailable', code: 'formance_restore_duplicate_identity' })
  })

  it('refuses duplicate references with different transaction IDs', async () => {
    fixture({ transactions: [transaction(1), { ...transaction(2), reference: 'original:1' }] })
    expect(await readFormanceRestoreSnapshot(configuration)).toEqual({ kind: 'unavailable', code: 'formance_restore_duplicate_reference' })
  })

  it.each(['missing', 'loop', 'empty', 'oversized'])('refuses %s continuation evidence', async variant => {
    fixture({ transactions: Array.from({ length: 251 }, (_, index) => transaction(index + 1)), page: (category, payload, url) => {
      if (category !== 'transactions') return payload
      if (variant === 'missing') return { cursor: { pageSize: 250, data: [transaction(1)], hasMore: true } }
      if (variant === 'empty') return { cursor: { pageSize: 250, data: [], hasMore: true, next: 'empty' } }
      if (variant === 'oversized') return { cursor: { pageSize: 250, data: Array.from({ length: 251 }, (_, index) => transaction(index + 1)), hasMore: false } }
      return { cursor: { pageSize: 250, data: [transaction(url.searchParams.has('cursor') ? 2 : 1)], hasMore: true, next: 'loop' } }
    } })
    expect(await readFormanceRestoreSnapshot(configuration)).toMatchObject({ kind: 'unavailable',
      code: variant === 'oversized' ? 'formance_restore_response_invalid' : 'formance_restore_cursor_invalid' })
  })

  it('refuses schema saturation after 1000 rather than returning a truncated schema digest', async () => {
    fixture({ schemas: Array.from({ length: 1001 }, (_, index) => schema(`v-${index}`)) })
    expect(await readFormanceRestoreSnapshot(configuration)).toEqual({ kind: 'unavailable', code: 'formance_restore_row_limit_exceeded' })
  })

  it('refuses a page read after the complete scan elapsed budget', async () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const external = fixture({ transactions: Array.from({ length: 251 }, (_, index) => transaction(index + 1)),
      page: (category, payload) => { if (category === 'transactions') now = 121_001; return payload } })
    expect(await readFormanceRestoreSnapshot(configuration)).toEqual({ kind: 'unavailable', code: 'formance_restore_read_timeout' })
    expect(external.requests).toHaveLength(2)
  })

  it('refuses a body stalled after headers within the SDK request deadline', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(milliseconds => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), milliseconds)
      return controller.signal
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ start() {} }), {
      headers: { 'content-type': 'application/json' },
    })))
    const reading = readFormanceRestoreSnapshot(configuration)
    await vi.advanceTimersByTimeAsync(5_001)
    expect(await reading).toMatchObject({ kind: 'unavailable' })
  })
})
