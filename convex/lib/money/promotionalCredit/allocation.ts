import type { MutationCtx } from '../../../_generated/server'
import type { Id } from '../../../_generated/dataModel'
import {
  MAX_PROMOTIONAL_GRANTS_PER_CALL,
  type PromotionalCreditAllocation,
} from '../../../../src/modules/money/public'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from '../../../../src/modules/money/public'

type Environment = 'sandbox' | 'production'
type ClaimInput = Readonly<{
  accountRef: string
  environment: Environment
  amountUnits: string
  now: number
}>

const MAX_UNITS = BigInt(PACKAGE4_FORMANCE_REQUIREMENTS.maximumSdkIntegerUnits)
const REFUSED = { kind: 'refused', code: 'promotional_credit_allocation_unavailable' } as const

function units(value: string): bigint | null {
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) return null
  const parsed = BigInt(value)
  return parsed <= MAX_UNITS ? parsed : null
}

function validIdentity(accountRef: string, now: number): boolean {
  return accountRef.length > 0 && Number.isSafeInteger(now) && now >= 0
}

/**
 * Requires a positive safe AUD6 amount and a valid account/environment/time.
 * Ensures the exact amount is split earliest-expiry-first across at most 100
 * booked, unexpired grants and a purchased remainder, with grant decrements
 * committed in the caller's Convex transaction.
 * Invariant: every available balance stays within [0, original grant amount].
 * On violation or grant overflow: refuse before any grant write.
 */
export async function claimPromotionalCredit(ctx: MutationCtx, input: ClaimInput): Promise<
  | { kind: 'claimed'; allocation: PromotionalCreditAllocation }
  | typeof REFUSED
> {
  const requested = units(input.amountUnits)
  if (!validIdentity(input.accountRef, input.now) || requested === null || requested === 0n) return REFUSED

  let remaining = requested
  const grants: PromotionalCreditAllocation['grants'][number][] = []
  const patches: { id: Id<'moneyPromotionalGrants'>; remaining: string }[] = []
  const rows = await ctx.db.query('moneyPromotionalGrants')
    .withIndex('by_accountRef_and_environment_and_expiresAt', (query) => query
      .eq('accountRef', input.accountRef)
      .eq('environment', input.environment)
      .gt('expiresAt', input.now))
    .take(1_001)
  for (const row of rows.slice(0, 1_000)) {
    if (row.bookingState !== 'booked') continue
    const available = units(row.availableUnits)
    const original = units(row.amountUnits)
    if (available === null || original === null || available > original) return REFUSED
    if (available === 0n) continue
    if (grants.length >= MAX_PROMOTIONAL_GRANTS_PER_CALL) return REFUSED
    const taken = available < remaining ? available : remaining
    grants.push({ grantRef: row.grantRef, amountUnits: taken.toString(), expiresAt: row.expiresAt })
    patches.push({ id: row._id, remaining: (available - taken).toString() })
    remaining -= taken
    if (remaining === 0n) break
  }
  // We cannot substitute purchased credit if an uninspected grant could exist.
  if (remaining > 0n && rows.length > 1_000) return REFUSED
  for (const patch of patches) {
    await ctx.db.patch('moneyPromotionalGrants', patch.id, {
      availableUnits: patch.remaining,
      updatedAt: input.now,
    })
  }
  return {
    kind: 'claimed',
    allocation: {
      version: 'ae.promotional-credit-allocation:v1',
      purchasedUnits: remaining.toString(),
      grants,
    },
  }
}

/**
 * Requires an allocation applied exactly once by the caller's financial
 * transition. Ensures only its original grant rows regain the reserved units.
 * An expired return remains excluded by time-based spend reads and queues expiry.
 * Invalid identity, amount, expiry or resulting balance refuses atomically.
 */
export async function restorePromotionalCredit(
  ctx: MutationCtx,
  allocation: PromotionalCreditAllocation,
  accountRef: string,
  environment: Environment,
  now: number,
): Promise<{ kind: 'restored' } | typeof REFUSED> {
  if (allocation.version !== 'ae.promotional-credit-allocation:v1'
    || !validIdentity(accountRef, now)
    || units(allocation.purchasedUnits) === null
    || allocation.grants.length > MAX_PROMOTIONAL_GRANTS_PER_CALL) return REFUSED
  const seen = new Set<string>()
  const patches: { id: Id<'moneyPromotionalGrants'>; availableUnits: string; nextWorkAt?: number }[] = []
  for (const grant of allocation.grants) {
    if (seen.has(grant.grantRef)) return REFUSED
    seen.add(grant.grantRef)
    const returned = units(grant.amountUnits)
    if (returned === null || returned === 0n || !Number.isSafeInteger(grant.expiresAt)) return REFUSED
    const row = await ctx.db.query('moneyPromotionalGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', grant.grantRef))
      .unique()
    if (row === null || row.accountRef !== accountRef || row.environment !== environment
      || row.bookingState !== 'booked' || row.expiresAt !== grant.expiresAt) return REFUSED
    const available = units(row.availableUnits)
    const original = units(row.amountUnits)
    if (available === null || original === null || available + returned > original) return REFUSED
    patches.push({
      id: row._id,
      availableUnits: (available + returned).toString(),
      ...(row.expiresAt <= now ? { nextWorkAt: now } : {}),
    })
  }
  for (const patch of patches) {
    await ctx.db.patch('moneyPromotionalGrants', patch.id, {
      availableUnits: patch.availableUnits,
      updatedAt: now,
      ...(patch.nextWorkAt === undefined ? {} : { nextWorkAt: patch.nextWorkAt }),
    })
  }
  return { kind: 'restored' }
}
