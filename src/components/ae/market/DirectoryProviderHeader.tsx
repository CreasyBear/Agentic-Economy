import { formatCount, formatDate } from '@/lib/ui/format-time'
import { ArrowUpRight } from 'lucide-react'
import { directoryInitials } from '@/modules/market/directory-card.view-model'
import { x402DirectoryFilterSchema, type X402DirectoryEntry } from '@/modules/market/x402-directory'
import '@/components/ae/shared/arc-pro/market/ProviderListing.css'

type Props = Readonly<{ provider: string; entries: readonly X402DirectoryEntry[]; totalTools?: number }>

export function DirectoryProviderHeader({ provider, entries, totalTools }: Props) {
  const tools = [...new Map(entries.filter(entry => entry.provider === provider).map(entry => [entry.resource, entry])).values()]
  const labels = [...new Set(tools.flatMap(tool => [...(tool.category === undefined ? [] : [tool.category]), ...(tool.tags ?? [])]))].slice(0, 6)
  const networks = [...new Set(tools.flatMap(tool => tool.prices.map(price => price.networkLabel ?? price.network)))]
  const reportedCalls = tools.flatMap(tool => {
    const calls30d = tool.activity?.calls30d
    return calls30d !== undefined && Number.isSafeInteger(calls30d) && calls30d >= 0 ? [calls30d] : []
  })
  const calls = reportedCalls.reduce((sum, value) => sum + BigInt(value), 0n)
  const validHost = x402DirectoryFilterSchema.safeParse({ provider })
  const total = totalTools !== undefined && Number.isSafeInteger(totalTools) && totalTools >= tools.length ? totalTools : undefined
  const updates = tools.flatMap(tool => {
    const date = tool.provenance?.updatedAt
    return date !== undefined && Number.isFinite(Date.parse(date)) ? [Date.parse(date)] : []
  })
  const latestUpdate = updates.length === 0 ? undefined : formatDate(Math.max(...updates), 'UTC')
  const mark = tools.find(tool => tool.iconUrl !== undefined)
  const countLabel = total === undefined
    ? `${tools.length} ${tools.length === 1 ? 'Tool' : 'Tools'} in these results`
    : `${formatCount(total)} ${total === 1 ? 'Tool' : 'Tools'} in the indexed catalogue`
  return <section aria-label={`Directory Host ${provider}`} className="arc-market arc-provider-header">
    <div className="arc-provider-header-identity"><span className="arc-provider-mark" aria-hidden="true">{directoryInitials(provider)}{mark?.iconUrl === undefined ? null : <img src={mark.iconUrl} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }} />}</span><div><h2>{provider}</h2><p>{countLabel}</p><p>Sourced directory listings; this hostname is not a verified Provider identity.</p></div>{validHost.success ? <a href={`https://${validHost.data.provider}/`} target="_blank" rel="noopener noreferrer" className="arc-provider-action">Visit {provider}<ArrowUpRight size={16} aria-hidden="true" /></a> : null}</div>
    {labels.length === 0 ? null : <div className="arc-provider-tags" aria-label="Provider-declared categories and tags">{labels.map(label => <span key={label}>{label}</span>)}</div>}
    {networks.length > 0 || reportedCalls.length > 0 || latestUpdate !== undefined ? <dl className="arc-provider-header-facts">
      {networks.length === 0 ? null : <div><dt>Payment networks in these results</dt><dd>{networks.join(' · ')}</dd></div>}
      {reportedCalls.length === 0 ? null : <div><dt>{formatCount(calls)} reported Calls in 30 days</dt><dd>Across {reportedCalls.length} {reportedCalls.length === 1 ? 'Tool' : 'Tools'} in these results · Coinbase Bazaar</dd></div>}
      {latestUpdate === undefined ? null : <div><dt>Latest directory update</dt><dd>{latestUpdate} · among these results</dd></div>}
    </dl> : null}
    {tools.length === 0 ? null : <ul className="arc-provider-tools" aria-label={`Tools from ${provider}`}>{tools.slice(0, 3).map(tool => <li key={tool.resource}><p>{tool.title}</p><p>{tool.description}</p></li>)}</ul>}
  </section>
}
