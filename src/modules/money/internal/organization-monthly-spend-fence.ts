export interface OrganizationMonthlySpendFenceInput {
  enabled?: boolean | undefined
  ceilingUnits?: string | undefined
  monthSpendUnits?: string | undefined
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
  if (input.monthSpendUnits === undefined) return { kind: 'unavailable' }
  const ceiling = BigInt(input.ceilingUnits ?? '0')
  const current = BigInt(input.monthSpendUnits)
  const requested = BigInt(input.requestUnits)
  if (current + requested > ceiling) {
    return { kind: 'refused', reason: 'organization_monthly_ceiling' }
  }
  return { kind: 'admitted' }
}
