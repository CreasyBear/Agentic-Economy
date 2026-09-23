import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

export { directoryDate, directoryOutputLabel, directoryPrice, directoryPriceContext, directoryTitle } from '@/modules/market/directory-card.view-model'

export function directoryCount(value: number): string {
  return new Intl.NumberFormat('en-AU', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

export function directoryNetworkLabel(entry: X402DirectoryEntry): string | undefined {
  const price = entry.prices[0]
  if (price === undefined) return undefined
  if (/^solana:[A-Za-z0-9]{1,44}$/u.test(price.network)) return price.networkLabel === 'Solana Devnet' ? price.networkLabel : 'Solana'
  return price.networkLabel ?? price.network
}
