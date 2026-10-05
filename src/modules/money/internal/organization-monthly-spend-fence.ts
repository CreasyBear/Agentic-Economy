export interface OrganizationMonthlySpendFenceInput {
  enabled?: boolean | undefined
  ceilingUnits?: string | undefined
  monthSpendUnits?: string | undefined
  heldPlanExposure?: Readonly<
    | { kind: 'known'; units: string }
    | { kind: 'unavailable' }
  > | undefined
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
  if (input.monthSpendUnits === undefined || input.heldPlanExposure?.kind === 'unavailable') {
    return { kind: 'unavailable' }
  }
  const ceiling = BigInt(input.ceilingUnits ?? '0')
  const current = BigInt(input.monthSpendUnits)
  const heldPlan = input.heldPlanExposure?.kind === 'known'
    ? BigInt(input.heldPlanExposure.units)
    : 0n
  const requested = BigInt(input.requestUnits)
  if (current + heldPlan + requested > ceiling) {
    return { kind: 'refused', reason: 'organization_monthly_ceiling' }
  }
  return { kind: 'admitted' }
}
