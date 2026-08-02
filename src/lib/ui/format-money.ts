export function formatMoney(currency: string, amountMinor: number): string {
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amountMinor / 100)
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`
  }
}
