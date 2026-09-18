export interface AutoRechargeDecisionInput {
  enabled: boolean
  balanceUnits: string | number
  thresholdUnits: string | number
  rechargeAmountUnits?: string | number | undefined
  pendingTopup?: unknown | undefined
  inFlightCommandRef?: string | undefined
  lastTriggeredAt?: number | undefined
  now: number
  chargesUtcDate?: string | undefined
  chargesOnUtcDate?: number | undefined
  utcDateKey?: string | undefined
  mandateState: 'missing' | 'ready' | 'authentication_required' | 'failed'
}

export type AutoRechargeDecisionResult =
  | { kind: 'trigger' }
  | {
      kind: 'skip'
      code:
        | 'disabled'
        | 'above_threshold'
        | 'pending_topup'
        | 'in_flight'
        | 'cooldown'
        | 'daily_charge_cap'
        | 'mandate_missing'
        | 'mandate_authentication_required'
    }

const COOLDOWN_MS = 5 * 60_000
const DAILY_CHARGE_CAP = 3

function unitsBigInt(value: string | number): bigint {
  return BigInt(String(value))
}

export function evaluateAutoRechargeDecision(
  input: AutoRechargeDecisionInput,
): AutoRechargeDecisionResult {
  if (!input.enabled) {
    return { kind: 'skip', code: 'disabled' }
  }

  if (input.mandateState === 'missing' || input.mandateState === 'failed') {
    return { kind: 'skip', code: 'mandate_missing' }
  }

  if (input.mandateState === 'authentication_required') {
    return { kind: 'skip', code: 'mandate_authentication_required' }
  }

  if (input.pendingTopup) {
    return { kind: 'skip', code: 'pending_topup' }
  }

  if (input.inFlightCommandRef !== undefined && input.inFlightCommandRef.length > 0) {
    return { kind: 'skip', code: 'in_flight' }
  }

  if (
    input.lastTriggeredAt !== undefined
    && (input.now - input.lastTriggeredAt) < COOLDOWN_MS
  ) {
    return { kind: 'skip', code: 'cooldown' }
  }

  const currentUtcDate = input.utcDateKey
    ?? new Date(input.now).toISOString().slice(0, 10)
  const chargesUtcDate = input.chargesUtcDate ?? currentUtcDate
  if (chargesUtcDate === currentUtcDate && (input.chargesOnUtcDate ?? 0) >= DAILY_CHARGE_CAP) {
    return { kind: 'skip', code: 'daily_charge_cap' }
  }

  if (unitsBigInt(input.balanceUnits) >= unitsBigInt(input.thresholdUnits)) {
    return { kind: 'skip', code: 'above_threshold' }
  }

  return { kind: 'trigger' }
}
