import { formatCount } from '@/lib/ui/format-time'
import { ArrowUpRight } from 'lucide-react'
import { ProductListing } from '@/components/ae/shared/arc-pro/market/ProductListing'
import { ProviderListingCard } from '@/components/ae/shared/arc-pro/market/ProviderListing'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

type Props = { entries: readonly X402DirectoryEntry[]; onSelect: (provider: string) => void }

export function DirectoryProviderCards({ entries, onSelect }: Props) {
  const groups = new Map<string, Map<string, X402DirectoryEntry>>()
  for (const entry of entries) {
    const group = groups.get(entry.provider) ?? new Map<string, X402DirectoryEntry>()
    group.set(entry.resource, entry)
    groups.set(entry.provider, group)
  }
  return <ProductListing>
    {[...groups].map(([provider, group]) => {
      const tools = [...group.values()]
      const tags = [...new Set(tools.flatMap(tool => [...(tool.category === undefined ? [] : [tool.category]), ...(tool.tags ?? [])]))].slice(0, 3)
      const networks = [...new Set(tools.flatMap(tool => tool.prices.map(price => price.networkLabel ?? price.network)))]
      const mark = tools.find(tool => tool.iconUrl !== undefined)
      return <li key={provider}><ProviderListingCard provider={provider} {...(mark?.iconUrl === undefined ? {} : { iconUrl: mark.iconUrl })} countLabel={`${formatCount(tools.length)} ${tools.length === 1 ? 'Tool' : 'Tools'} in these results`} countScope="Unique endpoints in the supplied results" tools={tools} tags={tags} networks={networks} action={<button type="button" className="arc-provider-action" onClick={() => onSelect(provider)} aria-label={`View Tools from ${provider}`}>See their Tools<ArrowUpRight size={16} aria-hidden="true" /></button>} /></li>
    })}
  </ProductListing>
}
