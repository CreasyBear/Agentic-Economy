import { formatDate } from '@/lib/ui/format-time'
import { useAuth } from '@clerk/tanstack-react-start'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/arc/button/button'
import { listOwnerMarketDemand, getOwnerMarketDemandStatus, withdrawOwnerMarketDemand, type OwnerMarketDemandRequest, type OwnerMarketDemandStatusResult } from '@/modules/market-demand/market-demand.functions'
import { MARKET_LINK_STATE } from './market-return-context'

type ListState = Readonly<{ owner: string; phase: 'loading' | 'ready'; items: readonly OwnerMarketDemandRequest[]; cursor?: string; error?: string }>
type RowState = Readonly<{ busy?: boolean; result?: OwnerMarketDemandStatusResult; error?: string }>

/** Demand is owner-scoped and paginated using the existing opaque cursor. */
export function DirectorySavedNeeds() {
  const { isLoaded, isSignedIn, userId } = useAuth()
  const owner = isLoaded && isSignedIn && userId ? userId : undefined
  const currentOwner = useRef(owner)
  useLayoutEffect(() => { currentOwner.current = owner }, [owner])
  const [state, setState] = useState<ListState>()
  const [rows, setRows] = useState<Readonly<{ owner: string; states: Record<string, RowState> }>>()
  const sequence = useRef(0)
  const pending = useRef(new Set<string>())
  const load = useCallback(async (cursor?: string) => {
    if (owner === undefined) return
    const target = owner, generation = ++sequence.current
    setState(previous => ({ owner: target, phase: 'loading', items: previous?.owner === target ? previous.items : [], ...(cursor === undefined ? {} : { cursor }) }))
    try {
      const result = await listOwnerMarketDemand({ data: { numItems: 20, ...(cursor === undefined ? {} : { cursor }) } })
      if (currentOwner.current !== target || sequence.current !== generation) return
      if (result.kind !== 'available') { setState(previous => ({ owner: target, phase: 'ready', items: previous?.owner === target ? previous.items : [], ...(cursor === undefined ? {} : { cursor }), error: 'Saved needs could not be loaded. Try again.' })); return }
      setState(previous => ({ owner: target, phase: 'ready', items: [...(cursor !== undefined && previous?.owner === target ? previous.items : []), ...result.requests.page], ...(result.requests.isDone ? {} : { cursor: result.requests.continueCursor }) }))
    } catch { if (currentOwner.current === target && sequence.current === generation) setState(previous => ({ owner: target, phase: 'ready', items: previous?.owner === target ? previous.items : [], ...(cursor === undefined ? {} : { cursor }), error: 'Saved needs could not be loaded. Try again.' })) }
  }, [owner])
  useEffect(() => { setRows(undefined); void load(); return () => { sequence.current += 1 } }, [load])
  const shown = state?.owner === owner ? state : undefined
  const shownRows = rows !== undefined && rows.owner === owner ? rows.states : {}
  function setRow(target: string, requestRef: string, row: RowState) {
    if (currentOwner.current !== target) return
    setRows(previous => ({ owner: target, states: { ...(previous?.owner === target ? previous.states : {}), [requestRef]: row } }))
  }
  async function action(requestRef: string, kind: 'check' | 'withdraw') {
    if (owner === undefined) return
    const target = owner, key = `${target}:${requestRef}`
    if (pending.current.has(key)) return
    pending.current.add(key)
    const previous = shownRows[requestRef]
    setRow(target, requestRef, { ...previous, busy: true })
    try {
      if (kind === 'check') {
        const result = await getOwnerMarketDemandStatus({ data: { requestRef } })
        setRow(target, requestRef, result.kind === 'error' ? { error: 'Current status is unavailable. Try again.' } : { result })
      } else {
        const result = await withdrawOwnerMarketDemand({ data: { requestRef } })
        if (currentOwner.current !== target) return
        if (result.kind === 'withdrawn' || result.kind === 'not_found') {
          setState(current => current?.owner === target ? { ...current, items: current.items.filter(item => item.requestRef !== requestRef) } : current)
          setRow(target, requestRef, {})
        } else setRow(target, requestRef, { ...previous, error: 'Withdrawal could not be confirmed. Check status.' })
      }
    } catch { setRow(target, requestRef, { ...previous, error: 'The request could not be confirmed. Check status.' }) }
    finally { pending.current.delete(key) }
  }
  if (owner === undefined) return null
  return <section aria-labelledby="saved-needs-heading" className="mb-8 border-b border-border pb-6">
    <h2 id="saved-needs-heading" className="text-lg font-medium">Saved needs</h2>
    <p className="text-sm text-muted-foreground">Matching runs for 30 days after saving. Check current supply or withdraw a need you no longer have.</p>
    {shown === undefined || shown.phase === 'loading' ? <p role="status">Loading saved needs…</p> : null}
    {shown?.error === undefined ? null : <div role="alert"><p>{shown.error}</p><Button type="button" variant="secondary" onClick={() => void load()}>Try again</Button></div>}
    {shown?.phase === 'ready' && shown.items.length === 0 && shown.error === undefined ? <p className="py-3 text-sm">No saved needs. When a search finds no suitable Tool, save the need from its results.</p> : null}
    <ul className="divide-y divide-border">{shown?.items.map(item => {
      const row = shownRows[item.requestRef]
      return <li key={item.requestRef} className="flex flex-col gap-3 py-4">
        <p className="font-medium">{item.query}</p>
        <p className="text-xs text-muted-foreground">Saved {formatDate(item.createdAt)} · Request reference: <code className="break-all">{item.requestRef}</code></p>
        {item.filters === undefined ? null : <details><summary className="text-sm">Saved search filters</summary><pre className="overflow-auto text-xs">{JSON.stringify(item.filters, null, 2)}</pre></details>}
        <p role="status" className="text-sm">{row?.result?.kind === 'matched' ? `${row.result.matchedCount} matching Tools` : row?.result?.kind === 'open' ? 'Waiting for matching supply' : row?.result?.kind === 'not_found' ? 'This need has expired or was withdrawn.' : 'Check status to assess current supply.'}</p>
        {row?.result?.kind === 'matched' ? <ul>{row.result.tools.map(tool => <li key={tool.toolRef}><Link to="/tools/$toolRef" params={{ toolRef: tool.toolRef }} state={MARKET_LINK_STATE}>{tool.title}</Link></li>)}</ul> : null}
        <div className="flex flex-wrap gap-3"><Button type="button" variant="secondary" disabled={row?.busy} onClick={() => void action(item.requestRef, 'check')}>Check status</Button><Button type="button" variant="ghost" disabled={row?.busy} onClick={() => void action(item.requestRef, 'withdraw')}>Withdraw</Button></div>
        {row?.error === undefined ? null : <p role="alert" className="text-sm text-destructive">{row.error}</p>}
      </li>
    })}</ul>
    {shown?.cursor === undefined ? null : <Button type="button" variant="secondary" disabled={shown.phase === 'loading'} onClick={() => void load(shown.cursor)}>Load more saved needs</Button>}
  </section>
}
