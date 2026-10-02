import { MAX_PROMOTIONAL_GRANTS_PER_CALL, type AccountCreditBalance, type EligiblePromotionalGrant, promotionalCreditReference } from '../promotional-credit-contracts'
import { canonicalFormanceUnits, formanceMonetaryVariable, PROMOTIONAL_FORMANCE_SCHEMA_VERSION, readFormanceAccount, type FormanceContext, type FormanceMoneyCommand } from '../formance'
import { refused } from '../formance-result'
import { digestReference, digestValue } from './formance-digest'
import { balanceAccount, boundedReference, promotionalGrantAccount, type PreparedCommand } from './formance-transaction-templates'

const SHA256 = /^sha256:[a-f0-9]{64}$/u

export type FormancePromotionalCreditBooking = Readonly<{
  grantRef: string
  accountRef: string
  amountUnits: string
  expiresAt: number
  commandDigest: string
  revision?: number
}>

export function prepareFormancePromotionalCreditGrant(input: FormancePromotionalCreditBooking): PreparedCommand {
  return preparePromotionalCommand(input, 'grant')
}

export function prepareFormancePromotionalCreditExpiry(input: FormancePromotionalCreditBooking): PreparedCommand {
  return preparePromotionalCommand(input, 'expire')
}

function preparePromotionalCommand(input: FormancePromotionalCreditBooking, stage: 'grant' | 'expire'): PreparedCommand {
  if (!boundedReference(input.grantRef) || !boundedReference(input.accountRef)
    || canonicalFormanceUnits(input.amountUnits) === undefined
    || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= 0
    || !SHA256.test(input.commandDigest)
    || (input.revision !== undefined && (!Number.isSafeInteger(input.revision) || input.revision <= 0))
    || (stage === 'grant' && input.revision !== undefined && input.revision !== 1)) {
    return refused('formance_promotional_credit_input_invalid')
  }
  const amount = formanceMonetaryVariable('AUD', input.amountUnits)
  if (amount === undefined) return refused('formance_promotional_credit_input_invalid')
  const identity = { grantRef: input.grantRef, revision: input.revision ?? 1, stage }
  const idempotencyKey = digestValue('promotional-credit-idempotency', identity)
  const grantAccount = promotionalGrantAccount(input.accountRef, input.grantRef)
  const command: FormanceMoneyCommand = Object.freeze({
    commandRef: promotionalCreditReference(input.grantRef, input.revision ?? 1, stage),
    idempotencyKey,
    schemaVersion: PROMOTIONAL_FORMANCE_SCHEMA_VERSION,
    template: stage === 'grant' ? 'PROMO_GRANTED' : 'PROMO_EXPIRED',
    variables: Object.freeze(stage === 'grant'
      ? { destination: grantAccount, amount }
      : { source: grantAccount, amount }),
    metadata: Object.freeze({
      account_digest: digestReference('account', input.accountRef),
      command_digest: digestValue('promotional-credit-command', { input, stage }),
      idempotency_digest: idempotencyKey,
    }),
  })
  return Object.freeze({ kind: 'prepared', command })
}

/** Informational live snapshot; admission still atomically claims each grant. */
export async function readFormanceAccountCreditBalance(
  context: FormanceContext,
  input: { accountRef: string; grants: readonly EligiblePromotionalGrant[] },
): Promise<AccountCreditBalance> {
  if (!boundedReference(input.accountRef) || input.grants.length > MAX_PROMOTIONAL_GRANTS_PER_CALL
    || new Set(input.grants.map(grant => grant.grantRef)).size !== input.grants.length
    || input.grants.some(grant => !boundedReference(grant.grantRef)
      || canonicalFormanceUnits(grant.availableUnits, false) === undefined
      || !Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= 0)) {
    return { kind: 'unavailable', code: 'promotional_credit_balance_invalid' }
  }
  const candidates = input.grants.filter(grant => grant.expiresAt > Date.now() && grant.availableUnits !== '0')
  const [purchased, promotional] = await Promise.all([
    readFormanceAccount(context, balanceAccount('account_aud', input.accountRef, undefined)),
    Promise.all(candidates.map(async grant => ({
      grant, ledger: await readFormanceAccount(context, promotionalGrantAccount(input.accountRef, grant.grantRef)),
    }))),
  ])
  if (purchased.kind === 'setup_required' || purchased.kind === 'unavailable') return purchased
  const purchasedUnits = purchased.kind === 'not_found' ? '0' : purchased.volumes['AUD/6']?.balanceUnits ?? '0'
  let promotionalUnits = 0n
  let nextPromotionalExpiryAt: number | null = null
  const observedAt = Date.now()
  for (const { grant, ledger } of promotional) {
    // Expiry can pass while awaiting the ledger. Never publish that stale credit.
    if (grant.expiresAt <= observedAt) continue
    if (ledger.kind === 'setup_required' || ledger.kind === 'unavailable') return ledger
    const ledgerUnits = BigInt(ledger.kind === 'not_found' ? '0' : ledger.volumes['AUD/6']?.balanceUnits ?? '0')
    const eligibleUnits = BigInt(grant.availableUnits)
    const available = ledgerUnits < eligibleUnits ? ledgerUnits : eligibleUnits
    if (available === 0n) continue
    promotionalUnits += available
    nextPromotionalExpiryAt = Math.min(nextPromotionalExpiryAt ?? grant.expiresAt, grant.expiresAt)
  }
  const total = BigInt(purchasedUnits) + promotionalUnits
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) return { kind: 'unavailable', code: 'promotional_credit_balance_invalid' }
  return {
    kind: 'available', currency: 'AUD', exponent: 6, units: total.toString(), purchasedUnits,
    promotionalUnits: promotionalUnits.toString(), nextPromotionalExpiryAt, observedAt,
  }
}
