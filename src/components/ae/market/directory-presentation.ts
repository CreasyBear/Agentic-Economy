import { formatCompactCount, formatCount } from '@/lib/ui/format-time'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

export { directoryDate, directoryOutputLabel, directoryPrice, directoryPriceContext, directoryTitle } from '@/modules/market/directory-card.view-model'

export function directoryCount(value: number): string {
  return value >= 10_000 ? formatCompactCount(value) : formatCount(value)
}

export function directoryNetworkLabel(entry: X402DirectoryEntry): string | undefined {
  const price = entry.prices[0]
  if (price === undefined) return undefined
  if (/^solana:[A-Za-z0-9]{1,44}$/u.test(price.network)) return price.networkLabel === 'Solana Devnet' ? price.networkLabel : 'Solana'
  return price.networkLabel ?? price.network
}
