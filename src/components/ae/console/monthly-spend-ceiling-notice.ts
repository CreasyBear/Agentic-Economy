export function monthlySpendCeilingSavedNotice(
  enabled: boolean,
  previouslyEnabled: boolean,
  amountLabel: string,
): string {
  if (enabled) return `Monthly spending cap updated: ${amountLabel}`
  if (previouslyEnabled) return 'Monthly spending cap disabled'
  return 'Monthly spending cap is already off'
}
