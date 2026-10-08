import { Link } from '@tanstack/react-router'
import { ArrowUpRight, MessageSquare } from 'lucide-react'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import type { MarketReturnSearch } from './market-return-context'
import { directoryCatalogueSearchValues } from '@/modules/market/x402-directory-navigation'

export function marketAgentPrompt(search: MarketReturnSearch, draftQuery: string): string {
  const { query: _query, indexCursor: _cursor, offset: _offset, sort: _sort, ...filters } = directoryCatalogueSearchValues(search)
  const need = draftQuery.trim()
  const request = need ? `Help me find and compare Tools for this need: ${need}` : 'Help me find a Tool for my next task. Ask what I need before searching.'
  return Object.keys(filters).length === 0 ? request : `${request}\nRespect these discovery constraints: ${JSON.stringify(filters)}. These are search preferences, not permission to make a purchase.`
}

/** /t/new?q= sends on arrival. The action therefore names sending, never harmless drafting. */
export function MarketAgentHandoff({ search, draftQuery, recipient }: Readonly<{ search: MarketReturnSearch; draftQuery: string; recipient?: string }>) {
  return <aside className="ae-market-agent" aria-labelledby="market-agent-title">
    <MessageSquare size={22} strokeWidth={1.5} aria-hidden="true" />
    <h2 id="market-agent-title">Start with the task.</h2>
    <p>Tell an Agent what you’re trying to do. Find a capability, compare the options, and work out the next step together.</p>
    {recipient === undefined ? <small id="market-agent-recipient">Your prompt is sent when you continue to chat.</small> : <small id="market-agent-recipient">Your prompt and selected filters go to {recipient} when you continue.</small>}
    <Link aria-describedby="market-agent-recipient" to="/t/new" search={{ q: marketAgentPrompt(search, draftQuery) }} preload={false} className={actionLinkClassName('primary', 'md')}>
      {draftQuery.trim() ? 'Send to Agent' : 'Ask an Agent'}<ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  </aside>
}
