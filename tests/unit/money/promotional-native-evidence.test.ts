import { describe, expect, it, vi } from 'vitest'
import { PROMOTIONAL_FORMANCE_SCHEMA, PROMOTIONAL_FORMANCE_SCHEMA_VERSION,
  type FormanceContext } from '@/modules/money/formance'
import { grantFormancePromotionalCredit, expireFormancePromotionalCredit,
  prepareFormancePromotionalCreditGrant, prepareFormancePromotionalCreditExpiry,
  type FormancePromotionalCreditBooking } from '@/modules/money/formance-workflows'

type Kind = 'grant' | 'expiry'
type Posting = { source: string; destination: string; asset: string; amount: bigint }
type Row = { id: bigint; reference: string; template: string; metadata: Record<string, string>; postings: Posting[]; reverted?: boolean }
const input: FormancePromotionalCreditBooking = {
  grantRef: 'promo:original', accountRef: 'account:original', amountUnits: '10000000',
  expiresAt: Date.UTC(2027, 0, 1), commandDigest: `sha256:${'a'.repeat(64)}`, revision: 1,
}

function fixture(kind: Kind, existing: boolean, booking = input) {
  const prepared = kind === 'grant' ? prepareFormancePromotionalCreditGrant(booking) : prepareFormancePromotionalCreditExpiry(booking)
  if (prepared.kind !== 'prepared') throw new Error(prepared.code)
  const command = prepared.command
  const row = (): Row => ({ id: 41n, reference: command.commandRef, template: command.template,
    metadata: { ...command.metadata }, postings: [{
      source: kind === 'grant' ? 'world' : command.variables.source!,
      destination: kind === 'grant' ? command.variables.destination! : 'world',
      asset: 'AUD/6', amount: BigInt(booking.amountUnits),
    }] })
  const rows = new Map<string, Row>(existing ? [[command.commandRef, row()]] : [])
  let failedReads = false
  const ledger = {
    getSchema: vi.fn(async () => ({ v2SchemaResponse: {
      data: { version: PROMOTIONAL_FORMANCE_SCHEMA_VERSION, ...PROMOTIONAL_FORMANCE_SCHEMA },
    } })),
    listTransactions: vi.fn(async ({ query }: { query: { $match: { reference: string } } }) => {
      if (failedReads) throw new TypeError('native_read_unavailable')
      const actual = rows.get(query.$match.reference)
      return { v2TransactionsCursorResponse: { cursor: { data: actual === undefined ? [] : [actual] } } }
    }),
    createTransaction: vi.fn(async (request: {
      idempotencyKey: string; schemaVersion: string;
      v2PostTransaction: { reference: string; metadata: Record<string, string>; script: { template: string; vars: Record<string, string> } };
    }) => {
      expect(request.idempotencyKey).toBe(command.idempotencyKey)
      expect(request.schemaVersion).toBe(command.schemaVersion)
      expect(request.v2PostTransaction).toMatchObject({ reference: command.commandRef, metadata: command.metadata,
        script: { template: command.template, vars: command.variables } })
      const actual = row()
      rows.set(command.commandRef, actual)
      return { v2CreateTransactionResponse: { data: actual } }
    }),
    createBulk: vi.fn(),
  }
  const context = { configuration: { environment: 'sandbox', gatewayUrl: 'http://127.0.0.1:8080',
    ledger: 'test-ledger', requestTimeoutMs: 1_000 }, sdk: { ledger: { v2: ledger } } } as unknown as FormanceContext
  const run = (material = booking) => kind === 'grant'
    ? grantFormancePromotionalCredit(context, material) : expireFormancePromotionalCredit(context, material)
  const noWrites = () => {
    expect(ledger.createTransaction).not.toHaveBeenCalled()
    expect(ledger.createBulk).not.toHaveBeenCalled()
  }
  return { booking, command, row, rows, ledger, run, noWrites, failReads: (value: boolean) => { failedReads = value } }
}

describe.each(['grant', 'expiry'] as const)('exact promotional %s native confirmation', kind => {
  it('confirms fresh canonical posting and preserves its reference, then replays without a second write', async () => {
    const f = fixture(kind, false)
    expect(await f.run()).toEqual({ kind: 'completed', transactionRefs: [f.command.commandRef], replayed: false })
    const before = structuredClone([...f.rows])
    expect(await f.run()).toEqual({ kind: 'completed', transactionRefs: [f.command.commandRef], replayed: true })
    expect([...f.rows]).toEqual(before)
    expect(f.ledger.createTransaction).toHaveBeenCalledTimes(1)
    expect(f.ledger.createBulk).not.toHaveBeenCalled()
  })

  it('proves an exact existing replay without native writes and retains the maintained schema gate', async () => {
    const f = fixture(kind, true)
    const before = structuredClone([...f.rows])
    expect(await f.run()).toEqual({ kind: 'completed', transactionRefs: [f.command.commandRef], replayed: true })
    expect(f.ledger.getSchema).toHaveBeenCalled()
    expect([...f.rows]).toEqual(before)
    f.noWrites()
  })

  it('refuses malformed or zero input before native reads', async () => {
    const f = fixture(kind, true)
    for (const patch of [{ amountUnits: '0' }, { commandDigest: 'invalid' }, { revision: 0 }]) {
      expect(await f.run({ ...input, ...patch })).toEqual({
        kind: 'refused', code: 'formance_promotional_credit_input_invalid', retryable: false,
      })
    }
    expect(f.ledger.listTransactions).not.toHaveBeenCalled()
    f.noWrites()
  })

  it('rechecks full metadata after replay even when the existing writer accepts unchanged command/idempotency digests', async () => {
    const f = fixture(kind, true)
    let reads = 0
    f.ledger.listTransactions.mockImplementation(async () => {
      const actual = f.rows.get(f.command.commandRef)!
      if (++reads > 1) actual.metadata.account_digest = 'b'.repeat(64)
      return { v2TransactionsCursorResponse: { cursor: { data: [actual] } } }
    })
    expect(await f.run()).toEqual({ kind: 'refused', code: 'formance_promotional_credit_evidence_invalid', retryable: false })
    expect(reads).toBe(3)
    f.noWrites()
  })

  it.each(['amount', 'source', 'destination', 'asset', 'missing', 'extra', 'template'] as const)(
    'refuses existing %s conflict despite exact command metadata before effects', async alteration => {
      const f = fixture(kind, true)
      const actual = f.rows.get(f.command.commandRef)!
      const posting = actual.postings[0]!
      if (alteration === 'amount') posting.amount += 1n
      if (alteration === 'source') posting.source = 'wrong:source'
      if (alteration === 'destination') posting.destination = 'wrong:destination'
      if (alteration === 'asset') posting.asset = 'USDC/6'
      if (alteration === 'missing') actual.postings = []
      if (alteration === 'extra') actual.postings.push({ ...posting })
      if (alteration === 'template') actual.template = kind === 'grant' ? 'PROMO_EXPIRED' : 'PROMO_GRANTED'
      const before = structuredClone([...f.rows])
      expect(await f.run()).toEqual({ kind: 'refused', code: 'formance_promotional_credit_evidence_invalid', retryable: false })
      expect([...f.rows]).toEqual(before)
      f.noWrites()
    },
  )

  it.each(['account_digest', 'command_digest', 'idempotency_digest'] as const)(
    'requires original %s as well as exact native postings', async key => {
      const f = fixture(kind, true)
      f.rows.get(f.command.commandRef)!.metadata[key] = 'b'.repeat(64)
      expect(await f.run()).toEqual({ kind: 'refused', code: 'formance_promotional_credit_evidence_invalid', retryable: false })
      f.noWrites()
    },
  )

  it.each(['reverted', 'unsafe', 'duplicate', 'reference'] as const)(
    'refuses %s evidence through the maintained reference reader', async alteration => {
      const f = fixture(kind, true)
      const actual = f.rows.get(f.command.commandRef)!
      if (alteration === 'reverted') actual.reverted = true
      if (alteration === 'unsafe') actual.postings[0]!.amount = BigInt(Number.MAX_SAFE_INTEGER) + 1n
      if (alteration === 'reference') actual.reference = 'wrong:reference'
      if (alteration === 'duplicate') f.ledger.listTransactions.mockImplementation(async () => ({
        v2TransactionsCursorResponse: { cursor: { data: [actual, actual] } },
      }))
      const codes = { reverted: 'formance_reference_reverted', unsafe: 'formance_unsafe_integer',
        duplicate: 'formance_reference_conflict', reference: 'formance_reference_conflict' }
      expect(await f.run()).toEqual({ kind: 'refused', code: codes[alteration], retryable: false })
      f.noWrites()
    },
  )

  it('makes no write when preflight is unavailable', async () => {
    const f = fixture(kind, true)
    f.failReads(true)
    expect(await f.run()).toEqual({ kind: 'unavailable', code: 'formance_read_unavailable', submissionProvenAbsent: true })
    f.noWrites()
  })

  it.each(['missing', 'unavailable', 'conflict'] as const)(
    'cannot complete when post-write confirmation is %s', async alteration => {
      const f = fixture(kind, false)
      f.ledger.createTransaction.mockImplementationOnce(async () => {
        const actual = f.row()
        if (alteration !== 'missing') f.rows.set(f.command.commandRef, actual)
        if (alteration === 'unavailable') f.failReads(true)
        if (alteration === 'conflict') actual.postings[0]!.amount += 1n
        return { v2CreateTransactionResponse: { data: actual } }
      })
      const result = await f.run()
      expect(result).toEqual(alteration === 'conflict'
        ? { kind: 'refused', code: 'formance_promotional_credit_evidence_invalid', retryable: false }
        : { kind: 'outcome_unknown', reference: f.command.commandRef, statusRef: `formance-transaction:${f.command.commandRef}` })
      expect(result).not.toHaveProperty('submissionProvenAbsent')
      expect(f.ledger.createTransaction).toHaveBeenCalledTimes(1)
      expect(f.ledger.createBulk).not.toHaveBeenCalled()
    },
  )

  it('retains the original command through a committed write with lost acknowledgement and unavailable read, then recovers once', async () => {
    const f = fixture(kind, false)
    f.ledger.createTransaction.mockImplementationOnce(async () => {
      f.rows.set(f.command.commandRef, f.row())
      f.failReads(true)
      throw new TypeError('native_ack_lost')
    })
    expect(await f.run()).toEqual({ kind: 'outcome_unknown', reference: f.command.commandRef,
      statusRef: `formance-transaction:${f.command.commandRef}` })
    const before = structuredClone([...f.rows])
    f.failReads(false)
    expect(await f.run()).toEqual({ kind: 'completed', transactionRefs: [f.command.commandRef], replayed: true })
    expect([...f.rows]).toEqual(before)
    expect(f.ledger.createTransaction).toHaveBeenCalledTimes(1)
  })

  it('preserves accepted optional-revision input shape rather than normalizing its command digest', async () => {
    const { revision: _revision, ...withoutRevision } = input
    void _revision
    const f = fixture(kind, true, withoutRevision)
    expect(await f.run()).toEqual({ kind: 'completed', transactionRefs: [f.command.commandRef], replayed: true })
    expect(await f.run({ ...withoutRevision, revision: 1 })).toEqual({
      kind: 'refused', code: 'formance_promotional_credit_evidence_invalid', retryable: false,
    })
    f.noWrites()
  })
})
