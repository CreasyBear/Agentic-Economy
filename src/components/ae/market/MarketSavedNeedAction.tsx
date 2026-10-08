import { useAuth } from '@clerk/tanstack-react-start'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/arc/button/button'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import type { MarketRequestScope } from '@/modules/market-demand/request-identity'
import { useMarketSavedNeed } from './useMarketSavedNeed'
import { MARKET_LINK_STATE } from './market-return-context'

type Props = Readonly<{ input: MarketRequestScope; signInSearch: { redirect: string } }>
export function MarketSavedNeedAction({ input, signInSearch }: Props) {
  const { isLoaded, isSignedIn, userId } = useAuth()
  const owner = isLoaded && isSignedIn && userId ? userId : undefined
  const need = useMarketSavedNeed(input, owner)
  if (!isLoaded) return <p role="status">Checking account…</p>
  if (!isSignedIn) return <Link to="/sign-in/$" params={{ _splat: '' }} search={signInSearch} className={actionLinkClassName('secondary', 'md')}>Sign in to save this need</Link>
  const busy = need.phase !== 'ready'
  return <section aria-label="Saved need" className="flex flex-col gap-3">
    <p className="text-sm">Save this exact need and its search filters. Matching runs for 30 days; saving does not buy a Tool.</p>
    {need.requestRef === undefined ? null : <p className="text-sm">Request reference: <code className="break-all">{need.requestRef}</code></p>}
    {need.record === undefined ? null : <>
      <p className="text-sm">{need.record.kind === 'matched' ? `${need.record.matchedCount} matching Tools` : 'Waiting for matching supply'}</p>
      {need.record.kind === 'matched' ? <ul>{need.record.tools.map(tool => <li key={tool.toolRef}><Link to="/tools/$toolRef" params={{ toolRef: tool.toolRef }} state={MARKET_LINK_STATE}>{tool.title}</Link></li>)}</ul> : null}
    </>}
    <div className="flex flex-wrap items-center gap-3">
      {need.record === undefined && need.error === undefined ? <Button type="button" variant="secondary" disabled={busy} onClick={() => void need.save()}>{need.phase === 'loading' ? 'Checking saved needs…' : need.phase === 'saving' ? 'Saving…' : 'Save this need'}</Button> : null}
      <Button type="button" variant="secondary" disabled={busy} onClick={() => void need.lookup()}>Check status</Button>
      {need.requestRef === undefined ? null : <Button type="button" variant="ghost" disabled={busy} onClick={() => void need.withdraw()}>{need.phase === 'withdrawing' ? 'Withdrawing…' : 'Withdraw'}</Button>}
      <Link to="/market" search={{ view: 'saved' }} className={actionLinkClassName('ghost', 'md')}>View saved needs</Link>
    </div>
    {need.withdrawn ? <p role="status">Need withdrawn.</p> : null}
    {need.error === undefined ? null : <p role="alert" className="text-sm text-destructive">{need.error}</p>}
  </section>
}
