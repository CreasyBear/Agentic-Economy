// Provider contribution composition adapted from the licensed Arc Pro
// product-listing block, retrieved 1 October 2026. Authored media/quick/info
// regions are retained; Provider counts describe their stated source scope.
import { Braces } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

import { motionTokens } from '@/components/arc/lib/motion-tokens'
import { directoryInitials } from '@/modules/market/directory-card.view-model'
import './ProviderListing.css'

type ProviderListingCardProps = Readonly<{
  provider: string
  iconUrl?: string
  countLabel: string
  countScope: string
  tools?: readonly Readonly<{ resource: string; title: string; description: string }>[]
  tags?: readonly string[]
  networks?: readonly string[]
  facts?: ReactNode
  action: ReactNode
}>

/** Requires projected source counts; never computes host activity or a buyer price. */
export function ProviderListingCard({ provider, iconUrl, countLabel, countScope, tools = [], tags = [], networks = [], facts, action }: ProviderListingCardProps) {
  const reduced = useReducedMotion()
  return <motion.article className="arc-market arc-provider-card" layout={reduced ? false : 'position'} transition={reduced ? { duration: 0 } : motionTokens.spring.smooth}>
    <div className="arc-provider-media">
      <div className="arc-provider-media-top"><span className="arc-provider-mark" aria-hidden="true">{directoryInitials(provider)}{iconUrl === undefined ? null : <img src={iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }} />}</span><Braces size={22} strokeWidth={1.5} aria-hidden="true" /></div>
      <div className="arc-provider-contribution"><p className="arc-provider-count" aria-hidden="true">{countLabel.split(' ')[0]}</p><p>{countLabel}</p><p className="arc-provider-scope">{countScope}</p></div>
      <div className="arc-provider-quick">{action}</div>
    </div>
    <div className="arc-provider-info"><h3 title={provider}>{provider}</h3>
      {tools.length === 0 ? null : <ul className="arc-provider-tools" aria-label={`Tools from ${provider}`}>{tools.slice(0, 3).map(tool => <li key={tool.resource}><p>{tool.title}</p>{tool.description.trim() === '' ? null : <p>{tool.description}</p>}</li>)}</ul>}
      {facts}
      {tags.length === 0 ? null : <div className="arc-provider-tags">{tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
      {networks.length === 0 ? null : <p className="arc-provider-networks">Networks in these results: {networks.join(' · ')}</p>}
    </div>
  </motion.article>
}
