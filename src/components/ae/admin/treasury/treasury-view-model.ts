import Decimal from 'decimal.js'
import { formatCurrencyAmount, parseDecimalExactAmount } from '@/modules/money/public'
import type { TreasurySnapshot } from '@/modules/money/treasury-report'

export function treasuryMoney(units: string, currency: 'USDC' | 'AUD' = 'USDC'): string {
  const negative = units.startsWith('-')
  return `${negative ? '−' : ''}${formatCurrencyAmount({ currency, units: negative ? units.slice(1) : units, exponent: 6 })}`
}
export function sumTreasuryUnits(...units: string[]): string {
  return units.reduce((total, value) => total + BigInt(value), 0n).toString()
}

/** Exact money stays in atomic strings. Only bounded, dimensionless display ratios become numbers. */
export function treasuryRatios(snapshot: TreasurySnapshot | null): {
  runway: number | null; coverage: number | null; creditAudUnits: string | null; creditUsdcUnits: string | null
} {
  const empty = { runway: null, coverage: null, creditAudUnits: null, creditUsdcUnits: null }
  if (snapshot?.ledger.kind !== 'available') return empty
  const ledger = snapshot.ledger
  const free = new Decimal(ledger.availableUnits)
  const burn = new Decimal(ledger.payments7dUnits)
  const runway = burn.gt(0) ? Decimal.min(free.mul(7).div(burn), 9999).toNumber() : null
  const creditAudUnits = sumTreasuryUnits(ledger.purchasedAvailableAudUnits, ledger.purchasedReservedAudUnits,
    ledger.promotionalAvailableAudUnits, ledger.promotionalReservedAudUnits)
  if (snapshot.referenceRate.kind !== 'available') return { ...empty, runway, creditAudUnits }
  const rate = new Decimal(snapshot.referenceRate.usdcToAudRate)
  if (!rate.isFinite() || rate.lte(0)) return { ...empty, runway, creditAudUnits }
  // Both currencies use exponent six; round the displayed liability up to one USDC atomic unit.
  const creditUsdc = new Decimal(creditAudUnits).div(rate)
  return { runway, creditAudUnits, creditUsdcUnits: creditUsdc.ceil().toFixed(0),
    coverage: creditUsdc.gt(0) ? Decimal.min(free.div(creditUsdc), 9999).toNumber() : null }
}

export function parseTreasuryThresholdInputs(lowWater: string, target: string): {
  lowWaterUnits: string; targetFloatUnits: string
} | null {
  const low = parseDecimalExactAmount('USDC', lowWater.trim(), 6)
  const high = parseDecimalExactAmount('USDC', target.trim(), 6)
  if (low === undefined || high === undefined || BigInt(high.units) <= 0n
    || BigInt(low.units) > BigInt(high.units) || BigInt(high.units) > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return { lowWaterUnits: low.units, targetFloatUnits: high.units }
}

export const TREASURY_ALERT_LABELS = {
  float_low: 'Float below the low-water mark', observation_stale: 'Wallet observation is stale',
  cash_difference: 'Cash reconciliation needs review', settlement_difference: 'Payment reconciliation needs review',
  funding_difference: 'Customer funding reconciliation needs review', reservation_overdue: 'A reservation is overdue',
  reservation_difference: 'Payment reservation records disagree',
  reconciliation_unavailable: 'Reconciliation is unavailable', reconciliation_stale: 'Reconciliation is stale',
  daily_limit_80_percent: 'Rolling spend limit is at least 80% used',
} as const
