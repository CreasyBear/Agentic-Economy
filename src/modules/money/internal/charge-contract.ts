import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  addExactAmounts,
  compareExactAmounts,
  type ExactAmount,
} from './exact-amount'
import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
} from './account-ref'

export type ChargeEntryLeg = Readonly<{
  entryType: string
  direction: string
}>

export type SelectedChargeEntries<T extends ChargeEntryLeg = ChargeEntryLeg> = Readonly<{
  charge: T
  provider: T
  rake: T
  recovery?: T
}>

export function sameEvidenceRefs(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((ref, index) => ref === right[index])
}

export function recoveryExceedsProvider(
  recovery: ExactAmount | undefined,
  provider: ExactAmount,
): boolean {
  if (recovery === undefined) return true
  const compared = compareExactAmounts(recovery, provider)
  return compared === undefined || compared === 1
}

export function selectChargeEntries<T extends ChargeEntryLeg>(
  entries: readonly T[],
): SelectedChargeEntries<T> | undefined {
  if (entries.length !== 3 && entries.length !== 4) return undefined
  const charges = entries.filter((entry) => entry.entryType === 'charge' && entry.direction === 'debit')
  const providers = entries.filter((entry) => entry.entryType === 'payout_accrual' && entry.direction === 'credit')
  const rakes = entries.filter((entry) => entry.entryType === 'rake' && entry.direction === 'credit')
  const recoveries = entries.filter((entry) => entry.entryType === 'payout_accrual' && entry.direction === 'debit')
  if (charges.length !== 1 || providers.length !== 1 || rakes.length !== 1 || recoveries.length > 1 || entries.length !== 3 + recoveries.length) return undefined
  const charge = charges[0]
  const provider = providers[0]
  const rake = rakes[0]
  if (charge === undefined || provider === undefined || rake === undefined) return undefined
  return { charge, provider, rake, ...(recoveries[0] === undefined ? {} : { recovery: recoveries[0] }) }
}

export type ChargeContractAccount = Readonly<{
  accountRef: string
}>

export type ChargeContractOriginal = Readonly<{
  transactionRef: string
  kind: string
  idempotencyKey: string
  principalId: string
  accountId?: string
  credentialId?: string
  currency: string
  exponent: number
  amount: ExactAmount
  createdAt: number
}>

export type ChargeContractUsage = Readonly<{
  principalId: string
  credentialId: string
  accountId?: string
  businessId: string
  transactionRef?: string
  chargeState: string
  amount: ExactAmount
  observedAt: number
  invocationRef: string
  attemptRef: string
}>

export type ChargeContractEntry = ChargeEntryLeg & Readonly<{
  entryRef: string
  accountRef: string
  transactionRef: string
  idempotencyKey: string
  createdAt: number
  sourceDigest: string
  evidenceRefs: readonly string[]
  amount: ExactAmount
  principalId?: string
  businessId?: string
  invocationRef?: string
  attemptRef?: string
  reversalOf?: string
}>

export type ValidateChargeContractInput<T extends ChargeContractEntry = ChargeContractEntry> = Readonly<{
  original: ChargeContractOriginal
  usage: ChargeContractUsage | undefined
  selected: SelectedChargeEntries<T> | undefined
  operator: ChargeContractAccount
  provider: ChargeContractAccount
  rake: ChargeContractAccount
}>

export type ValidatedChargeContract<T extends ChargeContractEntry = ChargeContractEntry> = Readonly<{
  selected: SelectedChargeEntries<T>
  usage: ChargeContractUsage
  accountId: string
  businessId: string
  chargeAmount: ExactAmount
  providerAmount: ExactAmount
  rakeAmount: ExactAmount
  operator: ChargeContractAccount
  provider: ChargeContractAccount
  rake: ChargeContractAccount
}>

export function validateChargeContract<T extends ChargeContractEntry>(
  input: ValidateChargeContractInput<T>,
): ValidatedChargeContract<T> | undefined {
  const { original, usage, selected, operator, provider, rake } = input
  const accountId = original.accountId
  const businessId = usage?.businessId
  const chargeAmount = selected?.charge.amount
  const providerAmount = selected?.provider.amount
  const rakeAmount = selected?.rake.amount
  if (
    accountId === undefined
    || businessId === undefined
    || usage === undefined
    || selected === undefined
    || chargeAmount === undefined
    || providerAmount === undefined
    || rakeAmount === undefined
    || original.kind !== 'charge'
    || original.idempotencyKey !== original.transactionRef
    || original.principalId !== usage.principalId
    || original.credentialId === undefined
    || original.credentialId !== usage.credentialId
    || original.accountId !== usage.accountId
    || usage.transactionRef !== original.transactionRef
    || usage.chargeState !== 'paid'
    || usage.observedAt !== original.createdAt
    || usage.amount.currency !== original.currency
    || usage.amount.exponent !== original.exponent
    || compareExactAmounts(usage.amount, original.amount) !== 0
    || selected.charge.entryRef !== `${original.transactionRef}:charge`
    || selected.provider.entryRef !== `${original.transactionRef}:provider`
    || selected.rake.entryRef !== `${original.transactionRef}:rake`
    || operator.accountRef !== accountRefForOwner(accountId, original.currency)
    || provider.accountRef !== accountRefForProvider(businessId, original.currency)
    || rake.accountRef !== accountRefForRake(original.currency)
    || selected.charge.accountRef !== operator.accountRef
    || selected.provider.accountRef !== provider.accountRef
    || selected.rake.accountRef !== rake.accountRef
    || selected.charge.entryType !== 'charge'
    || selected.charge.direction !== 'debit'
    || selected.provider.entryType !== 'payout_accrual'
    || selected.provider.direction !== 'credit'
    || selected.rake.entryType !== 'rake'
    || selected.rake.direction !== 'credit'
    || selected.charge.transactionRef !== original.transactionRef
    || selected.provider.transactionRef !== original.transactionRef
    || selected.rake.transactionRef !== original.transactionRef
    || selected.charge.idempotencyKey !== original.idempotencyKey
    || selected.provider.idempotencyKey !== original.idempotencyKey
    || selected.rake.idempotencyKey !== original.idempotencyKey
    || selected.charge.createdAt !== original.createdAt
    || selected.provider.createdAt !== original.createdAt
    || selected.rake.createdAt !== original.createdAt
    || selected.charge.principalId !== original.principalId
    || selected.charge.businessId !== undefined
    || selected.charge.invocationRef !== usage.invocationRef
    || selected.charge.attemptRef !== usage.attemptRef
    || selected.charge.reversalOf !== undefined
    || selected.provider.principalId !== undefined
    || selected.provider.businessId !== businessId
    || selected.provider.invocationRef !== usage.invocationRef
    || selected.provider.attemptRef !== usage.attemptRef
    || selected.provider.reversalOf !== undefined
    || selected.rake.principalId !== undefined
    || selected.rake.businessId !== businessId
    || selected.rake.invocationRef !== undefined
    || selected.rake.attemptRef !== undefined
    || selected.rake.reversalOf !== undefined
    || selected.charge.sourceDigest !== selected.provider.sourceDigest
    || selected.charge.sourceDigest !== selected.rake.sourceDigest
    || !sameEvidenceRefs(selected.charge.evidenceRefs, selected.provider.evidenceRefs)
    || !sameEvidenceRefs(selected.charge.evidenceRefs, selected.rake.evidenceRefs)
    || compareExactAmounts(chargeAmount, original.amount) !== 0
    || chargeAmount.currency !== original.currency
    || providerAmount.currency !== original.currency
    || rakeAmount.currency !== original.currency
    || chargeAmount.exponent !== original.exponent
    || providerAmount.exponent !== original.exponent
    || rakeAmount.exponent !== original.exponent
    || compareExactAmounts(addExactAmounts(providerAmount, rakeAmount), chargeAmount) !== 0
  ) return undefined
  if (
    selected.recovery !== undefined
    && (
      selected.recovery.entryRef !== `${original.transactionRef}:provider-recovery`
      || selected.recovery.accountRef !== selected.provider.accountRef
      || selected.recovery.entryType !== 'payout_accrual'
      || selected.recovery.direction !== 'debit'
      || selected.recovery.businessId !== businessId
      || selected.recovery.businessId !== selected.provider.businessId
      || selected.recovery.principalId !== undefined
      || selected.recovery.invocationRef !== usage.invocationRef
      || selected.recovery.invocationRef !== selected.provider.invocationRef
      || selected.recovery.attemptRef !== usage.attemptRef
      || selected.recovery.attemptRef !== selected.provider.attemptRef
      || selected.recovery.reversalOf !== undefined
      || selected.recovery.transactionRef !== original.transactionRef
      || selected.recovery.transactionRef !== selected.provider.transactionRef
      || selected.recovery.idempotencyKey !== original.idempotencyKey
      || selected.recovery.idempotencyKey !== selected.provider.idempotencyKey
      || selected.recovery.sourceDigest !== selected.charge.sourceDigest
      || selected.recovery.sourceDigest !== selected.provider.sourceDigest
      || !sameEvidenceRefs(selected.recovery.evidenceRefs, selected.charge.evidenceRefs)
      || !sameEvidenceRefs(selected.recovery.evidenceRefs, selected.provider.evidenceRefs)
      || selected.recovery.createdAt !== original.createdAt
      || selected.recovery.createdAt !== selected.provider.createdAt
      || selected.recovery.amount.currency !== selected.provider.amount.currency
      || selected.recovery.amount.exponent !== selected.provider.amount.exponent
      || recoveryExceedsProvider(selected.recovery.amount, providerAmount)
    )
  ) return undefined
  return { selected, usage, accountId, businessId, chargeAmount, providerAmount, rakeAmount, operator, provider, rake }
}

export const CHARGE_JOURNAL_DIGEST_FORMAT = 'charge-journal:v1' as const

export type ChargeJournalUsageIdentity = Readonly<{
  usageRef: string
  operationKey: string
  priceDigest: string
}>

function chargeJournalEntryFields(entry: ChargeContractEntry) {
  return {
    entryRef: entry.entryRef,
    accountRef: entry.accountRef,
    transactionRef: entry.transactionRef,
    entryType: entry.entryType,
    direction: entry.direction,
    amount: entry.amount,
    sourceDigest: entry.sourceDigest,
    evidenceRefs: [...entry.evidenceRefs],
    createdAt: entry.createdAt,
    invocationRef: entry.invocationRef ?? null,
    attemptRef: entry.attemptRef ?? null,
  }
}

export function chargeJournalDigest(
  input: ValidateChargeContractInput<ChargeContractEntry> & Readonly<{
    usage: ChargeContractUsage
    selected: SelectedChargeEntries<ChargeContractEntry>
  }>,
  usageIdentity: ChargeJournalUsageIdentity,
): string {
  return canonicalDigest({
    format: CHARGE_JOURNAL_DIGEST_FORMAT,
    original: {
      transactionRef: input.original.transactionRef,
      kind: input.original.kind,
      principalId: input.original.principalId,
      accountId: input.original.accountId ?? null,
      credentialId: input.original.credentialId ?? null,
      amount: input.original.amount,
      createdAt: input.original.createdAt,
    },
    usage: {
      usageRef: usageIdentity.usageRef,
      principalId: input.usage.principalId,
      credentialId: input.usage.credentialId,
      accountId: input.usage.accountId ?? null,
      businessId: input.usage.businessId,
      transactionRef: input.usage.transactionRef ?? null,
      chargeState: input.usage.chargeState,
      amount: input.usage.amount,
      observedAt: input.usage.observedAt,
      invocationRef: input.usage.invocationRef,
      attemptRef: input.usage.attemptRef,
      operationKey: usageIdentity.operationKey,
      priceDigest: usageIdentity.priceDigest,
    },
    selected: {
      charge: chargeJournalEntryFields(input.selected.charge),
      provider: chargeJournalEntryFields(input.selected.provider),
      rake: chargeJournalEntryFields(input.selected.rake),
      recovery: input.selected.recovery === undefined
        ? null
        : chargeJournalEntryFields(input.selected.recovery),
    },
    operatorAccountRef: input.operator.accountRef,
    providerAccountRef: input.provider.accountRef,
    rakeAccountRef: input.rake.accountRef,
  })
}
