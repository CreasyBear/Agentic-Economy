import Decimal from 'decimal.js'

import { canonicalDigest } from '../../common/canonical-digest'

export const AUD_EXPONENT = 6 as const
const MAX_UNITS_DIGITS = 30
const BPS_DENOMINATOR = 10_000n
const AudDecimal = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP })

export const ACCOUNT_FUNDING_POLICY_V1 = Object.freeze({
  policyRef: 'ae.account-funding-policy:v1',
  currency: 'AUD' as const,
  exponent: AUD_EXPONENT,
  minimumPrincipalUnits: 5_000_000n,
  maximumPrincipalUnits: 25_000_000_000n,
  serviceFeeBps: 500,
  taxOnServiceFeeBps: 1_000,
})

export type MoneyJournalNormalBalance = 'debit' | 'credit'
export type MoneyJournalPostingSide = MoneyJournalNormalBalance
export type MoneyJournalAccountKind =
  | 'cash_clearing_asset'
  | 'customer_prepayment_liability'
  | 'call_reservation_liability'
  | 'service_fee_revenue'
  | 'tax_payable_liability'
  | 'provider_obligation_liability'
  | 'corporate_treasury_asset'
  | 'adjustment_control'

export type MoneyJournalAccount = Readonly<{
  ledgerAccountRef: string
  accountRef: string
  asset: string
  exponent: number
  accountKind: MoneyJournalAccountKind
  normalBalance: MoneyJournalNormalBalance
}>

export type MoneyJournalPostingInput = Readonly<{
  postingRef: string
  ledgerAccountRef: string
  side: MoneyJournalPostingSide
  amountUnits: bigint
}>

export type MoneyJournalPosting = MoneyJournalPostingInput & Readonly<{
  position: number
}>

export type MoneyJournalTransaction = Readonly<{
  transactionRef: string
  idempotencyKey: string
  accountRef: string
  kind: 'funding_settlement' | 'funding_adjustment' | 'call_reservation' | 'call_settlement' | 'call_release' | 'provider_obligation' | 'treasury_movement'
  asset: string
  exponent: number
  debitUnits: bigint
  creditUnits: bigint
  postings: readonly MoneyJournalPosting[]
  evidenceRefs: readonly string[]
  journalDigest: string
  occurredAt: number
}>

export type MoneyBalanceProjection = Readonly<{
  ledgerAccountRef: string
  accountRef: string
  asset: string
  exponent: number
  balanceUnits: bigint
  version: number
  lastTransactionRef?: string
}>

export function canonicalAudUnits(value: string): bigint | undefined {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u.test(value)) return undefined
  try {
    const decimal = new AudDecimal(value)
    const scaled = decimal.mul(new AudDecimal(10).pow(AUD_EXPONENT))
    if (!scaled.isInteger() || scaled.lte(0)) return undefined
    const units = scaled.toFixed(0)
    return units.length <= MAX_UNITS_DIGITS ? BigInt(units) : undefined
  } catch {
    return undefined
  }
}

export function calculateAudFundingFinancials(input: Readonly<{
  principalUnits: bigint
  serviceFeeBps: number
  taxOnServiceFeeBps: number
}>): Readonly<{
  principalUnits: bigint
  serviceFeeUnits: bigint
  taxUnits: bigint
  totalUnits: bigint
}> {
  if (!canonicalPositiveUnits(input.principalUnits)
    || !basisPoints(input.serviceFeeBps)
    || !basisPoints(input.taxOnServiceFeeBps)) {
    throw new Error('aud_funding_financials_invalid')
  }
  const serviceFeeUnits = roundedBasisPoints(input.principalUnits, input.serviceFeeBps)
  const taxUnits = roundedBasisPoints(serviceFeeUnits, input.taxOnServiceFeeBps)
  return Object.freeze({
    principalUnits: input.principalUnits,
    serviceFeeUnits,
    taxUnits,
    totalUnits: input.principalUnits + serviceFeeUnits + taxUnits,
  })
}

export function quoteAudAccountFunding(principalUnits: bigint) {
  if (principalUnits < ACCOUNT_FUNDING_POLICY_V1.minimumPrincipalUnits
    || principalUnits > ACCOUNT_FUNDING_POLICY_V1.maximumPrincipalUnits
    || principalUnits % 10_000n !== 0n) {
    return undefined
  }
  const calculated = calculateAudFundingFinancials({
    principalUnits,
    serviceFeeBps: ACCOUNT_FUNDING_POLICY_V1.serviceFeeBps,
    taxOnServiceFeeBps: ACCOUNT_FUNDING_POLICY_V1.taxOnServiceFeeBps,
  })
  const serviceFeeUnits = roundAudUnitsToCent(calculated.serviceFeeUnits)
  const taxUnits = roundAudUnitsToCent(calculated.taxUnits)
  return Object.freeze({
    principalUnits,
    serviceFeeUnits,
    taxUnits,
    totalUnits: principalUnits + serviceFeeUnits + taxUnits,
  })
}

export function roundAudUnitsToCent(units: bigint): bigint {
  return ((units + 5_000n) / 10_000n) * 10_000n
}

export function roundAudStatementTotal(totalUnits: bigint): Readonly<{
  roundedUnits: bigint
  residualUnits: bigint
}> {
  if (totalUnits < 0n) throw new Error('aud_statement_total_invalid')
  const roundedUnits = roundAudUnitsToCent(totalUnits)
  return Object.freeze({ roundedUnits, residualUnits: roundedUnits - totalUnits })
}

export function prepareBalancedJournalTransaction(
  input: Readonly<{
    transactionRef: string
    idempotencyKey: string
    accountRef: string
    kind: MoneyJournalTransaction['kind']
    asset: string
    exponent: number
    postings: readonly MoneyJournalPostingInput[]
    evidenceRefs: readonly string[]
    occurredAt: number
  }>,
  accounts: readonly MoneyJournalAccount[],
): Readonly<
  | { kind: 'prepared'; transaction: MoneyJournalTransaction }
  | { kind: 'refused'; code: 'journal_invalid' | 'journal_account_invalid' | 'journal_unbalanced' }
> {
  if (!boundedRef(input.transactionRef)
    || !boundedRef(input.idempotencyKey)
    || !boundedRef(input.accountRef)
    || !/^[A-Z][A-Z0-9]{2,19}$/u.test(input.asset)
    || !Number.isSafeInteger(input.exponent)
    || input.exponent < 0
    || input.exponent > 18
    || !Number.isSafeInteger(input.occurredAt)
    || input.occurredAt < 0
    || input.postings.length < 2
    || input.postings.length > 32
    || input.evidenceRefs.length > 32
    || input.evidenceRefs.some((ref) => !boundedRef(ref))) {
    return Object.freeze({ kind: 'refused', code: 'journal_invalid' })
  }
  const accountsByRef = new Map(accounts.map((account) => [account.ledgerAccountRef, account]))
  const postingRefs = new Set<string>()
  let debitUnits = 0n
  let creditUnits = 0n
  const postings: MoneyJournalPosting[] = []
  for (const [position, posting] of input.postings.entries()) {
    const account = accountsByRef.get(posting.ledgerAccountRef)
    if (!boundedRef(posting.postingRef)
      || postingRefs.has(posting.postingRef)
      || account === undefined
      || account.asset !== input.asset
      || account.exponent !== input.exponent
      || !canonicalPositiveUnits(posting.amountUnits)) {
      return Object.freeze({ kind: 'refused', code: 'journal_account_invalid' })
    }
    postingRefs.add(posting.postingRef)
    if (posting.side === 'debit') debitUnits += posting.amountUnits
    else creditUnits += posting.amountUnits
    postings.push(Object.freeze({ ...posting, position }))
  }
  if (debitUnits !== creditUnits) {
    return Object.freeze({ kind: 'refused', code: 'journal_unbalanced' })
  }
  const evidenceRefs = Object.freeze([...input.evidenceRefs])
  const frozenPostings = Object.freeze(postings)
  const journalDigest = canonicalDigest({
    format: 'ae.money-journal:v1',
    transactionRef: input.transactionRef,
    idempotencyKey: input.idempotencyKey,
    accountRef: input.accountRef,
    kind: input.kind,
    asset: input.asset,
    exponent: input.exponent,
    debitUnits: debitUnits.toString(),
    creditUnits: creditUnits.toString(),
    postings: postings.map((posting) => ({
      ...posting,
      amountUnits: posting.amountUnits.toString(),
    })),
    evidenceRefs,
    occurredAt: input.occurredAt,
  })
  return Object.freeze({
    kind: 'prepared',
    transaction: Object.freeze({
      transactionRef: input.transactionRef,
      idempotencyKey: input.idempotencyKey,
      accountRef: input.accountRef,
      kind: input.kind,
      asset: input.asset,
      exponent: input.exponent,
      debitUnits,
      creditUnits,
      postings: frozenPostings,
      evidenceRefs,
      journalDigest,
      occurredAt: input.occurredAt,
    }),
  })
}

export function applyJournalTransaction(
  projections: readonly MoneyBalanceProjection[],
  accounts: readonly MoneyJournalAccount[],
  transaction: MoneyJournalTransaction,
): readonly MoneyBalanceProjection[] {
  const accountsByRef = new Map(accounts.map((account) => [account.ledgerAccountRef, account]))
  const next = new Map(projections.map((projection) => [projection.ledgerAccountRef, { ...projection }]))
  for (const posting of transaction.postings) {
    const account = accountsByRef.get(posting.ledgerAccountRef)
    if (account === undefined
      || account.asset !== transaction.asset
      || account.exponent !== transaction.exponent) {
      throw new Error('journal_projection_account_invalid')
    }
    const current = next.get(account.ledgerAccountRef) ?? {
      ledgerAccountRef: account.ledgerAccountRef,
      accountRef: account.accountRef,
      asset: account.asset,
      exponent: account.exponent,
      balanceUnits: 0n,
      version: 0,
    }
    const delta = posting.side === account.normalBalance
      ? posting.amountUnits
      : -posting.amountUnits
    const balanceUnits = current.balanceUnits + delta
    if (balanceUnits < 0n) throw new Error('journal_projection_negative')
    next.set(account.ledgerAccountRef, {
      ...current,
      balanceUnits,
      version: current.version + 1,
      lastTransactionRef: transaction.transactionRef,
    })
  }
  return Object.freeze([...next.values()]
    .sort((left, right) => left.ledgerAccountRef.localeCompare(right.ledgerAccountRef))
    .map((projection) => Object.freeze(projection)))
}

export function rebuildJournalProjections(
  accounts: readonly MoneyJournalAccount[],
  transactions: readonly MoneyJournalTransaction[],
): readonly MoneyBalanceProjection[] {
  return [...transactions]
    .sort((left, right) => left.occurredAt - right.occurredAt
      || left.transactionRef.localeCompare(right.transactionRef))
    .reduce<readonly MoneyBalanceProjection[]>(
      (projections, transaction) => applyJournalTransaction(projections, accounts, transaction),
      [],
    )
}

export function projectionChecksum(projections: readonly MoneyBalanceProjection[]): string {
  return canonicalDigest({
    format: 'ae.money-balance-projection:v1',
    projections: [...projections]
      .sort((left, right) => left.ledgerAccountRef.localeCompare(right.ledgerAccountRef))
      .map((projection) => ({
        ...projection,
        balanceUnits: projection.balanceUnits.toString(),
      })),
  })
}

function canonicalPositiveUnits(value: bigint): boolean {
  return value > 0n && value.toString().length <= MAX_UNITS_DIGITS
}

function basisPoints(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 10_000
}

function roundedBasisPoints(units: bigint, bps: number): bigint {
  const numerator = units * BigInt(bps)
  const quotient = numerator / BPS_DENOMINATOR
  const remainder = numerator % BPS_DENOMINATOR
  return remainder * 2n >= BPS_DENOMINATOR ? quotient + 1n : quotient
}

function boundedRef(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/u.test(value)
}
