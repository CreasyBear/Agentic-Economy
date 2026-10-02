import { describe, expect, it, vi } from 'vitest'
import type { FormanceContext } from '@/modules/money/formance'
import {
  capacityAccount, prepareFormanceManagedCallSettlement,
  prepareFormanceFundingSettlement, prepareFormanceFundingReversal,
  type FormanceManagedCallBooking, type FormanceFundingBooking,
} from '@/modules/money/formance-workflows'
import { canonicalDigest } from '@/modules/common/canonical-digest'
const digestReference = (kind: string, reference: unknown) => canonicalDigest({ format: 'ae.formance-account-segment:v1', value: { kind, reference } }).slice(7)
import { treasuryBufferAccount } from '@/modules/money/formance-treasury'
import {
  readFormanceTreasuryAudit, TREASURY_AUDIT_TRANSACTION_LIMIT,
  matchTreasuryProviderSettlement, matchTreasuryFunding, type FormanceTreasuryAuditTransaction,
} from '@/modules/money/formance-treasury-audit'

const snapshotAt = Date.now() - 10_000
const input = { custodyRef: 'custody:audit', custodyGeneration: 2, snapshotAt }
const available = capacityAccount('treasury_usdc', input.custodyRef, input.custodyGeneration)
const committed = available.replace(/:available$/u, ':committed')
const digest = 'a'.repeat(64)
const processor = `processor:${digest}:settlement`
const purchased = `accounts:${digest}:available`
type NativeRow = {
  id: bigint; reference?: string | undefined; template?: string | undefined; timestamp: Date; insertedAt?: Date
  reverted: boolean; revertedAt?: Date; metadata: Record<string, string>
  postings: { source: string; destination: string; asset: string; amount: bigint }[]
}
type Request = {
  ledger: string; cursor?: string; pageSize?: number; sort?: string; pit?: Date
  query?: { $lte: { inserted_at: string } }
}
function row(id: number, source = committed, destination = `providers:${digest}:settlement`): NativeRow {
  return { id: BigInt(id), reference: `ae-p4:${id.toString(16).padStart(64, '0')}:provider-settled`,
    template: 'PROVIDER_SETTLED', timestamp: new Date(snapshotAt - 5), insertedAt: new Date(snapshotAt - 3),
    reverted: false, metadata: { call_digest: digest },
    postings: [{ source, destination, asset: 'USDC/6', amount: 12n }] }
}

/** External SDK fixture preserves the first insertion query across opaque cursor pages. */
function harness(rows: NativeRow[] = [], filterInsertion = true) {
  const cursorRows = new Map<string, NativeRow[]>()
  let cursorSequence = 0
  const listTransactions = vi.fn(async (request: Request) => {
    const cutoff = request.query === undefined ? undefined : Date.parse(request.query.$lte.inserted_at)
    const selected = request.cursor === undefined
      ? rows.filter(value => !filterInsertion || (value.insertedAt?.getTime() ?? Number.POSITIVE_INFINITY) <= cutoff!)
      : cursorRows.get(request.cursor)!
    const data = selected.slice(0, 15)
    const remaining = selected.slice(15)
    const next = remaining.length === 0 ? undefined : `audit-cursor:${++cursorSequence}`
    if (next !== undefined) cursorRows.set(next, remaining)
    return { v2TransactionsCursorResponse: { cursor: { data, hasMore: remaining.length > 0, next } } }
  })
  const context = { configuration: { environment: 'production', ledger: 'audit-ledger' },
    sdk: { ledger: { v2: { listTransactions } } } } as unknown as FormanceContext
  return { context, listTransactions }
}

describe('native treasury reconciliation audit', () => {
  it('returns unavailable rather than a partial audit when pagination exceeds its elapsed budget', async () => {
    const fixture = harness(Array.from({ length: 16 }, (_, index) => row(index + 1)))
    let now = snapshotAt + 20_000
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    const list = fixture.listTransactions.getMockImplementation()!
    fixture.listTransactions.mockImplementation(async request => {
      const response = await list(request)
      now += 30_001
      return response
    })
    try {
      expect(await readFormanceTreasuryAudit(fixture.context, input)).toEqual({ kind: 'unavailable', code: 'formance_treasury_audit_read_budget_exceeded' })
      expect(fixture.listTransactions).toHaveBeenCalledTimes(1)
    } finally { clock.mockRestore() }
  })

  it('returns exact cash and purchased funding evidence across pages, including manual orphans and malformed templates', async () => {
    const rows = [
      row(1, 'world', available), row(2), row(3, treasuryBufferAccount(input), available),
      { ...row(4, processor, purchased), template: 'FUNDING_SETTLED', postings: [
        { source: processor, destination: purchased, asset: 'AUD/6', amount: 100n },
        { source: processor, destination: `revenue:${digest}:available`, asset: 'AUD/6', amount: 2n },
      ] },
      { ...row(5, purchased, processor), template: 'FUNDING_REVERSED' },
      { ...row(6, processor, purchased), template: undefined, reference: undefined },
      { ...row(7, 'world', 'other:available'), template: 'FUNDING_SETTLED', postings: [] },
      { ...row(8), template: 'MANUAL_UNKNOWN', reference: undefined },
      // Exact families/generation only: these are decoys, not evidence for this treasury.
      row(9, 'world', `${available}:child`),
      row(10, capacityAccount('treasury_usdc', input.custodyRef, 1), 'world'),
      row(11, `processor:${digest}:settlement:child`, purchased),
      row(12, processor, `${purchased}:child`),
      row(13, processor, `accounts:${digest}:promo:${digest}:available`),
      ...Array.from({ length: 8 }, (_, index) => row(index + 14)),
    ]
    const fixture = harness(rows)
    const result = await readFormanceTreasuryAudit(fixture.context, input)
    expect(result).toMatchObject({ kind: 'available', snapshotAt, complete: true })
    if (result.kind !== 'available') throw new Error('audit_unavailable')
    expect(result.transactions.map(value => value.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8',
      ...Array.from({ length: 8 }, (_, index) => String(index + 14))])
    expect(result.transactions[3]).toEqual({ id: '4', commandRef: rows[3]!.reference, template: 'FUNDING_SETTLED',
      insertedAt: snapshotAt - 3, effectiveAt: snapshotAt - 5, reverted: false, revertedAt: null,
      metadata: { call_digest: digest }, postings: [
        { source: processor, destination: purchased, asset: 'AUD/6', amountUnits: '100' },
        { source: processor, destination: `revenue:${digest}:available`, asset: 'AUD/6', amountUnits: '2' },
      ] })
    expect(result.transactions[5]).toMatchObject({ commandRef: null, template: null })
    expect(fixture.listTransactions).toHaveBeenCalledTimes(2)
    expect(fixture.listTransactions.mock.calls[0]?.[0]).toEqual({ ledger: 'audit-ledger', pageSize: 15, sort: 'id:asc',
      query: { $lte: { inserted_at: new Date(snapshotAt).toISOString() } } })
    expect(fixture.listTransactions.mock.calls[1]?.[0]).toEqual({ ledger: 'audit-ledger', cursor: expect.any(String) })
  })

  it('retains inserted future-effective facts and cutoff-inclusive facts but excludes later backdated inserts', async () => {
    const fixture = harness([
      { ...row(1), insertedAt: new Date(snapshotAt), timestamp: new Date(snapshotAt + 86_400_000) },
      { ...row(2), insertedAt: new Date(snapshotAt + 1), timestamp: new Date(snapshotAt - 86_400_000) },
    ])
    expect(await readFormanceTreasuryAudit(fixture.context, input)).toMatchObject({ kind: 'available', complete: true,
      transactions: [{ id: '1', insertedAt: snapshotAt, effectiveAt: snapshotAt + 86_400_000 }] })
  })

  it('retains untemplated world capital credits/debits for orphan detection without selecting ordinary purchased-credit movements', async () => {
    const fixture = harness([
      { ...row(1, 'world', purchased), template: undefined, reference: undefined },
      { ...row(2, purchased, 'world'), template: undefined, reference: undefined },
      row(3, purchased, `calls:${digest}:buyer_reserved`),
      row(4, `calls:${digest}:buyer_reserved`, purchased),
      row(5, `revenue:${digest}:available`, purchased),
      row(6, 'world', `${purchased}:child`),
    ])
    const result = await readFormanceTreasuryAudit(fixture.context, input)
    expect(result).toMatchObject({ kind: 'available', complete: true, transactions: [
      { id: '1', commandRef: null, template: null }, { id: '2', commandRef: null, template: null },
    ] })
    if (result.kind !== 'available') throw new Error('audit_unavailable')
    expect(result.transactions).toHaveLength(2)
  })

  it('retains both reverted facts and compensation postings instead of silently dropping cash or funding evidence', async () => {
    const original = { ...row(1, processor, purchased), template: 'FUNDING_SETTLED', reverted: true, revertedAt: new Date(snapshotAt - 1) }
    const compensation = { ...row(2, purchased, processor), template: undefined, reference: undefined,
      metadata: { 'com.formance.spec/state/reverts': '1' } }
    const fixture = harness([original, compensation, { ...row(3), template: 'PROVIDER_REVERSED' }])
    const result = await readFormanceTreasuryAudit(fixture.context, input)
    expect(result).toMatchObject({ kind: 'available', complete: true, transactions: [
      { id: '1', reverted: true, revertedAt: snapshotAt - 1 },
      { id: '2', template: null, metadata: { 'com.formance.spec/state/reverts': '1' } },
      { id: '3', template: 'PROVIDER_REVERSED' },
    ] })
  })

  it.each(['missing_insert', 'invalid_insert', 'later_insert', 'missing_effective', 'later_revert',
    'missing_revert', 'earlier_revert', 'contradictory_revert'] as const)('refuses %s evidence without returning partial rows', async fault => {
    const broken = row(2)
    if (fault === 'missing_insert') delete broken.insertedAt
    if (fault === 'invalid_insert') broken.insertedAt = new Date(Number.NaN)
    if (fault === 'later_insert') broken.insertedAt = new Date(snapshotAt + 1)
    if (fault === 'missing_effective') broken.timestamp = undefined as never
    if (fault === 'later_revert') { broken.reverted = true; broken.revertedAt = new Date(snapshotAt + 1) }
    if (fault === 'missing_revert') broken.reverted = true
    if (fault === 'earlier_revert') { broken.reverted = true; broken.revertedAt = new Date(snapshotAt - 4) }
    if (fault === 'contradictory_revert') broken.revertedAt = new Date(snapshotAt - 1)
    // Direct boundary evidence verifies the guard even when a server ignores its query.
    const fixture = harness([row(1), broken], false)
    expect(await readFormanceTreasuryAudit(fixture.context, input)).toEqual({ kind: 'unavailable', code: 'formance_treasury_audit_cutoff_invalid' })
  })

  it.each([9007199254740992n, -1n, '01', false, null])('refuses unsafe or malformed units %s', async units => {
    const broken = row(2)
    broken.postings[0]!.amount = units as never
    const fixture = harness([row(1), broken])
    expect(await readFormanceTreasuryAudit(fixture.context, input)).toEqual({ kind: 'unavailable', code: 'formance_treasury_audit_unsafe_integer' })
  })

  it.each(['duplicate_id', 'descending_id', 'duplicate_reference', 'unsafe_id', 'missing_metadata', 'invalid_metadata',
    'invalid_posting', 'oversized_postings'] as const)('refuses %s native response evidence', async fault => {
    const broken = row(2)
    if (fault === 'duplicate_id') broken.id = 1n
    if (fault === 'descending_id') broken.id = 0n
    if (fault === 'duplicate_reference') broken.reference = row(1).reference
    if (fault === 'unsafe_id') broken.id = 9007199254740992n
    if (fault === 'missing_metadata') broken.metadata = undefined as never
    if (fault === 'invalid_metadata') broken.metadata = { call_digest: 1 } as never
    if (fault === 'invalid_posting') broken.postings[0]!.source = undefined as never
    if (fault === 'oversized_postings') broken.postings = Array.from({ length: 1_001 }, () => row(2).postings[0]!)
    const fixture = harness([row(1), broken])
    const result = await readFormanceTreasuryAudit(fixture.context, input)
    expect(result).toEqual({ kind: 'unavailable', code: 'formance_treasury_audit_transactions_invalid' })
    expect(result).not.toHaveProperty('transactions')
  })

  it.each(['missing', 'repeated', 'empty', 'oversized_page'] as const)('refuses %s pagination evidence', async fault => {
    const fixture = harness()
    let sequence = 0
    fixture.listTransactions.mockImplementation(async () => ({ v2TransactionsCursorResponse: { cursor: {
      data: fault === 'empty' ? [] : Array.from({ length: fault === 'oversized_page' ? 16 : 1 }, () => row(++sequence)),
      hasMore: true, next: fault === 'missing' ? undefined : 'same-cursor',
    } } }))
    const result = await readFormanceTreasuryAudit(fixture.context, input)
    expect(result).toMatchObject({ kind: 'unavailable' })
    expect(result).not.toHaveProperty('transactions')
  })

  it('counts unrelated rows toward the complete-history bound rather than returning a partial green selection', async () => {
    const fixture = harness(Array.from({ length: TREASURY_AUDIT_TRANSACTION_LIMIT + 1 }, (_, index) => row(index + 1, 'world', 'unrelated:available')))
    expect(await readFormanceTreasuryAudit(fixture.context, input)).toEqual({ kind: 'unavailable', code: 'formance_treasury_audit_history_incomplete' })
  })

  it('accepts a genuinely complete empty native history', async () => {
    const fixture = harness()
    expect(await readFormanceTreasuryAudit(fixture.context, input)).toEqual({ kind: 'available', snapshotAt, complete: true, transactions: [] })
  })

  it('surfaces native read failure after a successful page without partial history', async () => {
    const fixture = harness(Array.from({ length: 16 }, (_, index) => row(index + 1)))
    fixture.listTransactions.mockImplementationOnce(async () => ({ v2TransactionsCursorResponse: { cursor: { data: [row(1)], hasMore: true, next: 'next' } } }))
    fixture.listTransactions.mockRejectedValueOnce(new Error('native_unavailable'))
    expect(await readFormanceTreasuryAudit(fixture.context, input)).toEqual({ kind: 'unavailable', code: 'formance_treasury_audit_read_unavailable' })
  })

  it('refuses malformed response shape', async () => {
    const fixture = harness()
    fixture.listTransactions.mockResolvedValueOnce({} as never)
    expect(await readFormanceTreasuryAudit(fixture.context, input)).toEqual({ kind: 'unavailable', code: 'formance_treasury_audit_response_invalid' })
  })

  it.each([{ custodyRef: '' }, { custodyGeneration: 0 }, { snapshotAt: -1 }, { snapshotAt: 1.5 },
    { snapshotAt: Date.now() + 86_400_000 }])('refuses invalid input before native reads %j', async change => {
    const fixture = harness()
    expect(await readFormanceTreasuryAudit(fixture.context, { ...input, ...change })).toEqual({ kind: 'setup_required', code: 'formance_treasury_audit_input_invalid' })
    expect(fixture.listTransactions).not.toHaveBeenCalled()
  })
})

const durableEvidence = `sha256:${'b'.repeat(64)}`
const policyDigest = `sha256:${'c'.repeat(64)}`
const providerBooking: FormanceManagedCallBooking = {
  callRef: 'call:audit-match', quoteRef: 'quote:audit-match', idempotencyKey: 'call:audit-match:key',
  accountRef: 'account:audit-match', principalRef: 'principal:audit-match', agentBudgetGeneration: 1,
  legalCustomerRef: 'customer:audit-match', legalCustomerGeneration: 1,
  treasuryRef: input.custodyRef, treasuryGeneration: input.custodyGeneration,
  toolRef: 'tool:audit-match', providerRef: 'provider:audit-match', authorityGeneration: 1, policyGeneration: 1,
  buyerAmountUnits: '100', buyerRevenueUnits: '99', buyerTaxUnits: '1', providerAmountUnits: '50',
  quoteDigest: policyDigest, inputDigest: durableEvidence, policyDigest, rateEvidenceDigest: durableEvidence,
  treasuryEvidenceDigest: policyDigest, x402RequirementDigest: durableEvidence,
}
const fundingBooking: FormanceFundingBooking = {
  commandRef: 'funding:audit-match', idempotencyKey: 'funding:audit-match:key', accountRef: 'account:audit-match',
  processorRef: 'checkout:audit-match', principalUnits: '100', serviceFeeUnits: '10', taxUnits: '1', totalUnits: '111',
  policyDigest, externalEvidenceDigest: durableEvidence,
}

function providerFixture(): FormanceTreasuryAuditTransaction {
  const prepared = prepareFormanceManagedCallSettlement({ booking: providerBooking, externalEvidenceDigest: durableEvidence })
  if (prepared.kind !== 'prepared') throw new Error(prepared.code)
  const command = prepared.bulk.commands.find(value => value.template === 'PROVIDER_SETTLED')!
  const call = digestReference('call', providerBooking.callRef)
  // Independent chart/posting fixture; command builder supplies canonical envelope only.
  return { id: '1', commandRef: command.commandRef, template: 'PROVIDER_SETTLED',
    insertedAt: snapshotAt - 3, effectiveAt: snapshotAt - 5, reverted: false, revertedAt: null,
    metadata: { ...command.metadata }, postings: [
      { source: committed, destination: `providers:${digestReference('provider', providerBooking.providerRef)}:settlement`,
        asset: 'USDC/6', amountUnits: '50' },
      { source: `provider_obligations:${call}:accrued`, destination: `provider_obligations:${call}:settled`,
        asset: 'USDC/6', amountUnits: '50' },
    ] }
}

function fundingFixture(kind: 'settlement' | 'reversal'): FormanceTreasuryAuditTransaction {
  const prepared = kind === 'settlement' ? prepareFormanceFundingSettlement(fundingBooking) : prepareFormanceFundingReversal(fundingBooking)
  if (prepared.kind !== 'prepared') throw new Error(prepared.code)
  const processorAddress = `processor:${digestReference('processor', fundingBooking.processorRef)}:settlement`
  const account = `accounts:${digestReference('account', fundingBooking.accountRef)}:available`
  const postings = [
    { source: 'world', destination: processorAddress, asset: 'AUD/6', amountUnits: '111' },
    { source: processorAddress, destination: account, asset: 'AUD/6', amountUnits: '100' },
    { source: processorAddress, destination: 'platform:revenue:sales', asset: 'AUD/6', amountUnits: '10' },
    { source: processorAddress, destination: 'platform:tax:gst', asset: 'AUD/6', amountUnits: '1' },
  ].map(posting => kind === 'settlement' ? posting : { ...posting, source: posting.destination, destination: posting.source })
  return { id: '1', commandRef: prepared.command.commandRef, template: prepared.command.template,
    insertedAt: snapshotAt - 3, effectiveAt: snapshotAt - 5, reverted: false, revertedAt: null,
    metadata: { ...prepared.command.metadata }, postings }
}

describe('exact native treasury settlement matching', () => {
  it('matches both provider postings against durable evidence regardless of posting order or unrelated native metadata', () => {
    const native = providerFixture()
    expect(matchTreasuryProviderSettlement({ ...native, postings: [...native.postings].reverse(),
      metadata: { ...native.metadata, harmless_native_key: 'native annotation' } }, providerBooking,
    [policyDigest, durableEvidence])).toBe(true)
    // No Call state/settlement-ref count is part of this proof: paid lost-response
    // remedies use the exact same Provider command even when buyer funds release.
    expect(matchTreasuryProviderSettlement(native, providerBooking, [durableEvidence])).toBe(true)
  })

  it.each(['empty', 'unrelated', 'unprefixed', 'malformed', 'native_substitution'] as const)(
    'refuses %s external payment evidence', fault => {
      const native = providerFixture()
      const allowed = fault === 'empty' ? [] : fault === 'unrelated' ? [policyDigest]
        : fault === 'unprefixed' ? [durableEvidence.slice(7)] : fault === 'malformed' ? ['sha256:invalid'] : [durableEvidence]
      const altered = fault === 'native_substitution'
        ? { ...native, metadata: { ...native.metadata, external_evidence_digest: policyDigest.slice(7) } } : native
      expect(matchTreasuryProviderSettlement(altered, providerBooking, allowed)).toBe(false)
    },
  )

  it.each(['cash_amount', 'obligation_amount', 'cash_source', 'obligation_destination', 'asset', 'missing_obligation',
    'duplicate_cash', 'extra_posting', 'extra_zero_posting', 'reference', 'template', 'reverted', 'compensation',
    'missing_metadata', 'wrong_metadata', 'wrong_booking', 'unsafe_units', 'malformed_units'] as const)(
    'refuses provider %s substitution', fault => {
      const native = providerFixture()
      let postings = native.postings.map(posting => ({ ...posting }))
      const metadata = { ...native.metadata }
      if (fault === 'cash_amount') postings[0]!.amountUnits = '51'
      if (fault === 'obligation_amount') postings[1]!.amountUnits = '51'
      if (fault === 'cash_source') postings[0]!.source = available
      if (fault === 'obligation_destination') postings[1]!.destination = 'wrong:obligation'
      if (fault === 'asset') postings[0]!.asset = 'AUD/6'
      if (fault === 'missing_obligation') postings = postings.slice(0, 1)
      if (fault === 'duplicate_cash') postings[1] = { ...postings[0]! }
      if (fault === 'extra_posting' || fault === 'extra_zero_posting') postings.push({ ...postings[0]!, amountUnits: fault === 'extra_zero_posting' ? '0' : '1' })
      if (fault === 'compensation') metadata['com.formance.spec/state/reverts'] = '99'
      if (fault === 'missing_metadata') delete metadata.command_digest
      if (fault === 'wrong_metadata') metadata.policy_digest = durableEvidence.slice(7)
      if (fault === 'unsafe_units') postings[0]!.amountUnits = '9007199254740992'
      if (fault === 'malformed_units') postings[0]!.amountUnits = '050'
      expect(matchTreasuryProviderSettlement({ ...native, postings, metadata,
        commandRef: fault === 'reference' ? 'orphan:reference' : native.commandRef,
        template: fault === 'template' ? 'PROVIDER_REVERSED' : native.template,
        reverted: fault === 'reverted', revertedAt: fault === 'reverted' ? snapshotAt - 1 : null,
      }, fault === 'wrong_booking' ? { ...providerBooking, quoteDigest: durableEvidence } : providerBooking, [durableEvidence])).toBe(false)
    },
  )

  it.each(['settlement', 'reversal'] as const)('matches exact funding %s principal, fee, tax and processor total', kind => {
    const native = fundingFixture(kind)
    expect(matchTreasuryFunding({ ...native, postings: [...native.postings].reverse(),
      metadata: { ...native.metadata, harmless_native_key: 'annotation' } }, fundingBooking, kind)).toBe(true)
    expect(matchTreasuryFunding(native, fundingBooking, kind === 'settlement' ? 'reversal' : 'settlement')).toBe(false)
  })

  it.each(['settlement', 'reversal'] as const)('refuses every independently changed %s funding amount or endpoint', kind => {
    const native = fundingFixture(kind)
    for (const index of [0, 1, 2, 3]) {
      for (const field of ['amountUnits', 'source', 'destination', 'asset'] as const) {
        const postings = native.postings.map(posting => ({ ...posting }))
        postings[index]![field] = field === 'amountUnits' ? '999' : 'wrong:value'
        expect(matchTreasuryFunding({ ...native, postings }, fundingBooking, kind), `${kind}/${index}/${field}`).toBe(false)
      }
    }
    expect(matchTreasuryFunding({ ...native, postings: native.postings.slice(1) }, fundingBooking, kind)).toBe(false)
  })

  it.each(['reference', 'template', 'reverted', 'compensation', 'missing_metadata', 'external_digest',
    'extra_posting', 'zero_booking', 'wrong_booking'] as const)('refuses funding %s evidence', fault => {
    const native = fundingFixture('settlement')
    const metadata = { ...native.metadata }
    if (fault === 'compensation') metadata['com.formance.spec/state/reverts'] = '99'
    if (fault === 'missing_metadata') delete metadata.command_digest
    if (fault === 'external_digest') metadata.external_evidence_digest = policyDigest.slice(7)
    expect(matchTreasuryFunding({ ...native, metadata,
      commandRef: fault === 'reference' ? 'orphan:reference' : native.commandRef,
      template: fault === 'template' ? 'UNKNOWN_FUNDING' : native.template,
      reverted: fault === 'reverted', revertedAt: fault === 'reverted' ? snapshotAt - 1 : null,
      postings: fault === 'extra_posting' ? [...native.postings, native.postings[0]!] : native.postings,
    }, fault === 'zero_booking' ? { ...fundingBooking, taxUnits: '0', totalUnits: '110' }
      : fault === 'wrong_booking' ? { ...fundingBooking, policyDigest: durableEvidence } : fundingBooking, 'settlement')).toBe(false)
  })

  it('refuses malformed pure-boundary input without throwing', () => {
    for (const invalid of [null, undefined, {}, { ...providerFixture(), metadata: null },
      { ...providerFixture(), postings: null }, { ...providerFixture(), id: 1 },
      { ...providerFixture(), insertedAt: Number.NaN }]) {
      expect(matchTreasuryProviderSettlement(invalid as never, providerBooking, [durableEvidence])).toBe(false)
      expect(matchTreasuryFunding(invalid as never, fundingBooking, 'settlement')).toBe(false)
    }
    expect(matchTreasuryProviderSettlement(providerFixture(), null as never, [durableEvidence])).toBe(false)
    expect(matchTreasuryFunding(fundingFixture('settlement'), null as never, 'settlement')).toBe(false)
  })
})
