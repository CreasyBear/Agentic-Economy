export function formatCurrencyAmount(currency: string, amountMinor: number): string {
  return `${currency} ${(amountMinor / 100).toFixed(2)}`
}
