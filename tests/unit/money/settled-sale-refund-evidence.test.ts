import { describe, expect, it, vi } from 'vitest'

import { FORMANCE_SCHEMA, FORMANCE_SCHEMA_VERSION, type FormanceContext, type FormanceMoneyCommand } from '@/modules/money/formance'
import {
  prepareFormanceManagedCallSettlement,
  prepareFormanceSettledSaleRefund,
  refundFormanceSettledSale,
  type FormanceManagedCallBooking,
} from '@/modules/money/formance-workflows'

const digestA = `sha256:${'a'.repeat(64)}`
const digestB = `sha256:${'b'.repeat(64)}`
const digestC = `sha256:${'c'.repeat(64)}`

const booking: FormanceManagedCallBooking = Object.freeze({
  callRef: 'call:refund-evidence', quoteRef: 'quote:refund-evidence',
  idempotencyKey: 'call-idempotency-refund-evidence',
  accountRef: 'account:one', principalRef: 'principal:one', agentBudgetGeneration: 1,
  legalCustomerRef: 'legal-customer:one', legalCustomerGeneration: 1,
  treasuryRef: 'treasury:one', treasuryGeneration: 1,
  toolRef: 'tool:one', providerRef: 'provider:one',
  authorityGeneration: 1, policyGeneration: 1,
  buyerAmountUnits: '100', buyerRevenueUnits: '99', buyerTaxUnits: '1',
  providerAmountUnits: '50', quoteDigest: digestA, inputDigest: digestB,
  policyDigest: digestA, rateEvidenceDigest: digestB, treasuryEvidenceDigest: digestA,
  x402RequirementDigest: digestB,
})

type NativePosting = { source: string; destination: string; asset: string; amount: bigint }

function monetaryAmount(command: FormanceMoneyCommand, key: string): { asset: string; units: bigint } {
  const match = command.variables[key]?.match(/^(AUD|USDC)\/6 ([0-9]+)$/u)
  if (match?.[1] === undefined || match[2] === undefined) throw new Error(`Missing ${key}`)
  return { asset: `${match[1]}/6`, units: BigInt(match[2]) }
}

function posting(command: FormanceMoneyCommand, source: string, destination: string, amount: string): NativePosting {
  const sourceAccount = command.variables[source]
  const destinationAccount = command.variables[destination]
  if (sourceAccount === undefined || destinationAccount === undefined) throw new Error('Missing account')
  const monetary = monetaryAmount(command, amount)
  return { source: sourceAccount, destination: destinationAccount, asset: monetary.asset, amount: monetary.units }
}

function nativePostings(command: FormanceMoneyCommand): NativePosting[] {
  if (command.template === 'BUYER_SALE_SETTLED') return [
    posting(command, 'call_reserved', 'revenue', 'revenue_amount'),
    posting(command, 'call_reserved', 'tax', 'tax_amount'),
    posting(command, 'legal_reserved', 'legal_settled', 'exposure_amount'),
    posting(command, 'agent_reserved', 'agent_spent', 'budget_amount'),
  ]
  if (command.template === 'PROVIDER_SETTLED') return [
    posting(command, 'treasury_committed', 'provider_settlement', 'amount'),
    posting(command, 'obligation_accrued', 'obligation_settled', 'amount'),
  ]
  if (command.template === 'BUYER_SALE_REFUNDED') return [
    posting(command, 'revenue', 'account_available', 'revenue_amount'),
    posting(command, 'tax', 'account_available', 'tax_amount'),
    posting(command, 'legal_settled', 'legal_available', 'exposure_amount'),
  ]
  if (command.template === 'CALL_SPEND_REFUNDED') return [
    posting(command, 'source', 'destination', 'amount'),
  ]
  throw new Error(`Unexpected template ${command.template}`)
}

function preparedCommands() {
  const settlement = prepareFormanceManagedCallSettlement({ booking, externalEvidenceDigest: digestB })
  if (settlement.kind !== 'prepared') throw new Error(settlement.code)
  const input = {
    booking,
    originalSettlementRefs: settlement.bulk.commands.map(command => command.commandRef),
    reportDigest: digestC,
  }
  const refund = prepareFormanceSettledSaleRefund(input)
  if (refund.kind !== 'prepared') throw new Error(refund.code)
  return { input, original: settlement.bulk.commands, refund: refund.bulk.commands }
}

function nativeTransaction(command: FormanceMoneyCommand, postings = nativePostings(command)) {
  return {
    id: 1n,
    reference: command.commandRef,
    template: command.template,
    metadata: command.metadata,
    postings,
  }
}

function contextWithNativeRows(
  original: readonly FormanceMoneyCommand[],
  refund: readonly FormanceMoneyCommand[],
  options: { alteredOriginal?: 'amount' | 'destination'; alteredRefund?: 'amount' | 'destination'; revertedOriginal?: boolean } = {},
) {
  let submitted = false
  const originalRows = new Map<string, ReturnType<typeof nativeTransaction> & { reverted?: boolean }>(
    original.map(command => [command.commandRef, nativeTransaction(command)]),
  )
  const refundRows = new Map(refund.map(command => [command.commandRef, nativeTransaction(command)]))
  if (options.revertedOriginal === true) {
    const command = original[0]
    if (command === undefined) throw new Error('Missing original buyer settlement')
    originalRows.set(command.commandRef, { ...nativeTransaction(command), reverted: true })
  }
  if (options.alteredOriginal !== undefined) {
    const command = original[0]
    if (command === undefined) throw new Error('Missing original buyer settlement')
    const postings = nativePostings(command)
    const first = postings[0]
    if (first === undefined) throw new Error('Missing buyer posting')
    postings[0] = options.alteredOriginal === 'amount'
      ? { ...first, amount: first.amount + 1n }
      : { ...first, destination: 'accounts:attacker' }
    originalRows.set(command.commandRef, nativeTransaction(command, postings))
  }
  if (options.alteredRefund !== undefined) {
    const command = refund[0]
    if (command === undefined) throw new Error('Missing buyer refund')
    const postings = nativePostings(command)
    const first = postings[0]
    if (first === undefined) throw new Error('Missing refund posting')
    postings[0] = options.alteredRefund === 'amount'
      ? { ...first, amount: first.amount + 1n }
      : { ...first, destination: 'accounts:attacker' }
    refundRows.set(command.commandRef, nativeTransaction(command, postings))
  }
  const ledger = {
    getSchema: vi.fn(async () => ({
      v2SchemaResponse: { data: { version: FORMANCE_SCHEMA_VERSION, ...FORMANCE_SCHEMA } },
    })),
    listTransactions: vi.fn(async ({ query }: { query: { $match: { reference: string } } }) => {
      const reference = query.$match.reference
      const row = originalRows.get(reference) ?? (submitted ? refundRows.get(reference) : undefined)
      return { v2TransactionsCursorResponse: { cursor: { data: row === undefined ? [] : [row] } } }
    }),
    createBulk: vi.fn(async () => {
      submitted = true
      return { v2BulkResponse: { data: refund.map((command, index) => ({
        responseType: 'CREATE_TRANSACTION', logID: index + 1,
        data: { reference: command.commandRef, postings: nativePostings(command) },
      })) } }
    }),
  }
  const context = {
    configuration: {
      environment: 'sandbox', gatewayUrl: 'http://127.0.0.1:8080',
      ledger: 'test-ledger', requestTimeoutMs: 1_000,
    },
    sdk: { ledger: { v2: ledger } },
  } as unknown as FormanceContext
  return { context, ledger }
}

describe('settled sale refund native evidence', () => {
  it('refuses a reverted original settlement before any refund write', async () => {
    const { input, original, refund } = preparedCommands()
    const { context, ledger } = contextWithNativeRows(original, refund, { revertedOriginal: true })
    expect(await refundFormanceSettledSale(context, input)).toEqual({
      kind: 'refused', code: 'formance_reference_reverted', retryable: false,
    })
    expect(ledger.createBulk).not.toHaveBeenCalled()
  })

  it.each(['amount', 'destination'] as const)(
    'refuses altered original %s with matching reference, template and metadata before any refund write',
    async (alteredOriginal) => {
      const { input, original, refund } = preparedCommands()
      const { context, ledger } = contextWithNativeRows(original, refund, { alteredOriginal })
      expect(await refundFormanceSettledSale(context, input)).toEqual({
        kind: 'refused', code: 'formance_settled_sale_evidence_invalid', retryable: false,
      })
      expect(ledger.createBulk).not.toHaveBeenCalled()
    },
  )

  it('completes when original and refund native postings are exact', async () => {
    const { input, original, refund } = preparedCommands()
    const { context, ledger } = contextWithNativeRows(original, refund)
    expect(await refundFormanceSettledSale(context, input)).toEqual({
      kind: 'completed', transactionRefs: refund.map(command => command.commandRef), replayed: false,
    })
    expect(ledger.createBulk).toHaveBeenCalledOnce()
  })

  it.each(['amount', 'destination'] as const)(
    'cannot claim completion when refund readback has altered %s with matching reference and metadata',
    async (alteredRefund) => {
      const { input, original, refund } = preparedCommands()
      const { context, ledger } = contextWithNativeRows(original, refund, { alteredRefund })
      expect(await refundFormanceSettledSale(context, input)).toEqual({
        kind: 'refused', code: 'formance_refund_evidence_invalid', retryable: false,
      })
      expect(ledger.createBulk).toHaveBeenCalledOnce()
    },
  )
})
