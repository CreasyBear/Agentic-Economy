export interface OrganizationMonthlySpendFenceInput {
  enabled?: boolean | undefined
  ceilingUnits?: string | undefined
  monthSpendUnits?: string | undefined
  heldExposure: Readonly<
    | { kind: 'known'; units: string }
    | { kind: 'unavailable' }
  >
  requestUnits: string
}

export type OrganizationMonthlySpendFenceResult =
  | { kind: 'not_applicable' }
  | { kind: 'admitted' }
  | { kind: 'refused'; reason: 'organization_monthly_ceiling' }
  | { kind: 'unavailable' }

export function evaluateOrganizationMonthlySpendFence(
  input: OrganizationMonthlySpendFenceInput,
): OrganizationMonthlySpendFenceResult {
  if (!input.enabled) return { kind: 'not_applicable' }
  if (input.heldExposure?.kind !== 'known'
    || !validUnits(input.ceilingUnits) || !validUnits(input.monthSpendUnits)
    || !validUnits(input.requestUnits) || !validUnits(input.heldExposure.units)) {
    return { kind: 'unavailable' }
  }
  const ceiling = BigInt(input.ceilingUnits)
  const current = BigInt(input.monthSpendUnits)
  const held = BigInt(input.heldExposure.units)
  const requested = BigInt(input.requestUnits)
  if (current + held + requested > ceiling) {
    return { kind: 'refused', reason: 'organization_monthly_ceiling' }
  }
  return { kind: 'admitted' }
}

function validUnits(units: string | undefined): units is string {
  return typeof units === 'string' && /^(?:0|[1-9]\d{0,30})$/u.test(units)
}
