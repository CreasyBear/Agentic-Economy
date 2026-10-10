import { useEffect, useRef, useState } from 'react'
import { Combobox } from '@/components/arc/combobox/combobox'
import { Button } from '@/components/arc/button/button'
import { readX402DirectoryProvidersServer } from '@/modules/market/x402-directory-index.functions'
import type { X402DirectoryFacet } from '@/modules/market/x402-directory-catalogue'

type State = Readonly<{ prefix: string; items: readonly X402DirectoryFacet[]; cursor?: string; busy: boolean; failed: boolean }>

/** The picker searches the owner index; its suggestions are never confined to overview's twelve hosts. */
export function ProviderFacetPicker({ selected, onChange }: Readonly<{ selected: string | undefined; onChange: (host: string | undefined) => void }>) {
  const [active, setActive] = useState(false)
  const [prefix, setPrefix] = useState('')
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState<State>({ prefix: '', items: [], busy: false, failed: false })
  const generation = useRef(0)
  useEffect(() => {
    const current = ++generation.current
    if (!active) return
    const timer = window.setTimeout(() => {
      setState({ prefix, items: [], busy: true, failed: false })
      void readX402DirectoryProvidersServer({ data: prefix ? { providerPrefix: prefix } : {} }).then(result => {
        if (generation.current !== current) return
        setState(result.kind === 'ok'
          ? { prefix, items: result.page, busy: false, failed: false, ...(result.isDone ? {} : { cursor: result.continueCursor }) }
          : { prefix, items: [], busy: false, failed: true })
      }).catch(() => {
        if (generation.current === current) setState({ prefix, items: [], busy: false, failed: true })
      })
    }, 200)
    return () => { clearTimeout(timer); generation.current += 1 }
  }, [active, prefix, retry])

  async function more() {
    if (state.cursor === undefined || state.busy || state.prefix !== prefix) return
    const current = generation.current
    setState(previous => ({ ...previous, busy: true, failed: false }))
    try {
      const result = await readX402DirectoryProvidersServer({ data: { providerCursor: state.cursor, ...(prefix ? { providerPrefix: prefix } : {}) } })
      if (generation.current !== current) return
      if (result.kind !== 'ok') { setState(previous => ({ ...previous, busy: false, failed: true })); return }
      const items = [...new Map([...state.items, ...result.page].map(item => [item.key, item])).values()]
      setState({ prefix, items, busy: false, failed: false, ...(result.isDone ? {} : { cursor: result.continueCursor }) })
    } catch {
      if (generation.current === current) setState(previous => ({ ...previous, busy: false, failed: true }))
    }
  }
  const options = (state.prefix === prefix ? state.items : []).map(item => ({ value: item.key, label: item.label, keywords: [item.key] }))
  if (selected && !options.some(option => option.value === selected)) options.push({ value: selected, label: selected, keywords: [selected] })
  return <div className="ae-market-host-picker">
    <Combobox label="Provider" placeholder="Search providers" options={options} value={selected ?? ''}
      onValueChange={value => { setPrefix(''); onChange(value || undefined) }}
      onFocus={() => { setActive(true); setPrefix('') }}
      onClickCapture={() => setPrefix('')}
      onKeyDownCapture={event => {
        // Arc resets its visible query on Escape and when reopening with an arrow key.
        if (event.key === 'Escape' || ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && event.currentTarget.getAttribute('aria-expanded') !== 'true')) setPrefix('')
      }}
      onInput={event => setPrefix(event.currentTarget.value.trim().toLowerCase())} maxLength={200}
      description="Type the start of a provider’s web address."
      emptyMessage={state.busy || state.prefix !== prefix ? 'Searching providers…' : state.failed ? 'Providers didn’t load.' : 'No matching providers.'} />
    {state.busy ? <p role="status">Searching providers…</p> : null}
    {state.failed ? <div role="alert"><p>Providers didn’t load.</p><Button type="button" variant="ghost" size="sm" onClick={() => state.cursor === undefined ? setRetry(value => value + 1) : void more()}>Try again</Button></div> : null}
    {state.cursor === undefined || state.failed ? null : <Button type="button" variant="ghost" size="sm" disabled={state.busy} onClick={() => void more()}>Show more providers</Button>}
  </div>
}
