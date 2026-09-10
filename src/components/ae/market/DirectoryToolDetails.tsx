import { Link } from '@tanstack/react-router'
import { ArrowRightIcon, HeartIcon } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { CodeBlock, CodeBlockHeader, CodeBlockTitle } from '@/components/ai-elements/code-block'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { MarketWindow } from '@/modules/market/contracts'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { prepareX402DirectoryResourceServer } from '@/modules/market/x402-directory.functions'
import { readPublicToolDetailRouteServer } from '@/modules/registry/tool-detail-route.functions'
import type { SavedDirectoryTool } from './DirectorySavedTools'
import { DirectoryToolIdentity } from './DirectoryToolIdentity'
import { directoryCount, directoryDate, directoryNetworkLabel, directoryPrice, directoryTitle } from './directory-presentation'
import { buildMarketReturnContext } from './market-return-context'

const Playground = lazy(() => import('./DirectoryToolPlayground').then(module => ({ default: module.DirectoryToolPlayground })))
type Preparation = Readonly<{ toolRef?: string; inputSchemaJson?: string; inputExampleJson?: string; error?: string }>
type Props = Readonly<{
  selected?: SavedDirectoryTool
  window: MarketWindow
  saved: boolean
  onSave: () => void
  onClose: () => void
  onCloseAutoFocus: (event: Event) => void
  onProviderSelect: (provider: string) => void
}>

export function DirectoryToolDetails(props: Props) {
  return <Dialog open={props.selected !== undefined} onOpenChange={open => { if (!open) props.onClose() }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-[min(76rem,calc(100%-3rem))]" onCloseAutoFocus={props.onCloseAutoFocus}>
      {props.selected === undefined ? null : <ToolDetails key={`${props.selected.entry.resource}:${JSON.stringify(props.selected.search)}`} {...props} selected={props.selected} />}
    </DialogContent>
  </Dialog>
}

function ToolDetails({ selected, window: marketWindow, saved, onSave, onProviderSelect }: Props & Readonly<{ selected: SavedDirectoryTool }>) {
  const { entry, search } = selected
  const [tab, setTab] = useState('overview')
  const [preparation, setPreparation] = useState<Preparation>()
  const [attempt, setAttempt] = useState(0)
  const { query, offset, network, provider, maxUsdPrice } = search
  useEffect(() => {
    let active = true
    setPreparation(undefined)
    async function prepare() {
      try {
        const resolution = await prepareX402DirectoryResourceServer({ data: { resource: entry.resource,
          ...(query === undefined ? {} : { query }), ...(offset === undefined ? {} : { offset }),
          ...(network === undefined ? {} : { network }), ...(provider === undefined ? {} : { provider }),
          ...(maxUsdPrice === undefined ? {} : { maxUsdPrice }),
        } })
        if (!active) return
        if (resolution.kind !== 'ready') { setPreparation({ error: 'AE could not prepare this Tool. Its published details remain available.' }); return }
        setPreparation({ toolRef: resolution.toolRef })
        try {
          const detail = await readPublicToolDetailRouteServer({ data: { toolRef: resolution.toolRef } })
          if (!active) return
          if (detail.kind !== 'found') { setPreparation({ toolRef: resolution.toolRef, error: 'The AE input contract is temporarily unavailable.' }); return }
          const example = detail.tool.contract.inputExamples?.[0]?.input
          setPreparation({ toolRef: resolution.toolRef, inputSchemaJson: JSON.stringify(detail.tool.contract.inputJsonSchema),
            ...(example === undefined ? {} : { inputExampleJson: JSON.stringify(example) }),
          })
        } catch { if (active) setPreparation({ toolRef: resolution.toolRef, error: 'The AE input contract is temporarily unavailable.' }) }
      } catch { if (active) setPreparation({ error: 'AE could not prepare this Tool. Its published details remain available.' }) }
    }
    void prepare()
    return () => { active = false }
  }, [entry.resource, query, offset, network, provider, maxUsdPrice, attempt])
  const returnContext = buildMarketReturnContext({ window: marketWindow, resource: entry.resource,
    ...(query === undefined ? {} : { query }), ...(offset === undefined ? {} : { offset }),
    ...(network === undefined ? {} : { network }), ...(provider === undefined ? {} : { provider }),
    ...(maxUsdPrice === undefined ? {} : { maxUsdPrice }),
  })
  const listingUrl = typeof window === 'undefined' ? returnContext : new URL(returnContext, window.location.origin).href
  const title = directoryTitle(entry)
  const priceLabel = directoryPrice(entry)
  const description = entry.description && entry.description !== title ? entry.description : 'Explore the published input, output and payment requirements for this service.'

  return <>
    <DialogHeader className="border-b border-border px-6 pt-8 pb-6 text-left sm:px-8">
      <div className="flex items-start gap-4 pr-8">
        <DirectoryToolIdentity entry={entry} className="size-16 shrink-0 sm:size-20" />
        <div className="min-w-0 flex-1">
          <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => onProviderSelect(entry.provider)}>{entry.provider}</button>
          <DialogTitle className="mt-2 break-words text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">{title}</DialogTitle>
          <div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">{entry.methodLabel ?? entry.method ?? entry.protocol}</Badge>{[...new Set([...(entry.category ? [entry.category] : []), ...(entry.tags ?? [])])].slice(0, 4).map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>
        </div>
      </div>
      <DialogDescription className="mt-4 max-w-4xl text-sm leading-relaxed sm:text-base">{description}</DialogDescription>
    </DialogHeader>
    <div className="grid min-w-0 gap-8 px-6 pb-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <Tabs value={tab} onValueChange={setTab} className="min-w-0">
        <TabsList variant="line" aria-label="Tool details" className="mb-5 w-full justify-start border-b border-border"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="playground">Playground</TabsTrigger><TabsTrigger value="contract">Contract</TabsTrigger></TabsList>
        <TabsContent value="overview" className="grid gap-7">
          <InputFields entry={entry} />
          <section className="grid min-w-0 gap-3" aria-label="Provider output example"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-semibold">What you get back</h3><Badge variant="secondary">Provider example</Badge></div>
            {entry.outputSummary === undefined ? null : <p className="text-sm leading-relaxed text-muted-foreground">{entry.outputSummary}</p>}
            <OutputExample entry={entry} />
          </section>
          <section className="grid min-w-0 gap-3 border-t border-border pt-6" aria-label="Call from your agent"><h3 className="text-lg font-semibold">Use with your agent</h3>
            {preparation?.toolRef ? <><AeCopyCommand label="call command" code={`ae call ${shellArgument(preparation.toolRef)} --input '<input-json>' --json`} /><p className="text-xs leading-relaxed text-muted-foreground">Open the Playground to fill in your input. AE checks the live price and your spending policy when your agent calls.</p></> : <p role="status" className="text-sm text-muted-foreground">{preparation?.error ?? 'Loading the AE call command…'}</p>}
          </section>
        </TabsContent>
        <TabsContent value="playground"><Suspense fallback={<p role="status" className="py-8 text-sm text-muted-foreground">Loading the input workspace…</p>}><Playground entry={entry} {...(preparation?.toolRef ? { toolRef: preparation.toolRef } : {})} {...(preparation?.inputSchemaJson === undefined ? {} : { inputSchemaJson: preparation.inputSchemaJson })} {...(preparation?.inputExampleJson === undefined ? {} : { inputExampleJson: preparation.inputExampleJson })} /></Suspense></TabsContent>
        <TabsContent value="contract" className="grid min-w-0 gap-5">
          <div><h3 className="text-lg font-semibold">Connection & contract</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Published source details and the input accepted by AE.</p></div>
          <AeCopyCommand compact label="endpoint" code={entry.resource} /><AeCopyCommand compact label="listing link" code={listingUrl} />
          {preparation?.inputSchemaJson === undefined ? null : <JsonDisclosure title="AE input schema" code={preparation.inputSchemaJson} />}
          {entry.input?.schemaJson === undefined ? null : <JsonDisclosure title="Provider input schema" code={entry.input.schemaJson} />}
          {entry.output?.schemaJson === undefined ? null : <JsonDisclosure title="Provider output schema" code={entry.output.schemaJson} />}
          <JsonDisclosure title="Source metadata" code={entry.metadataJson} />
        </TabsContent>
      </Tabs>
      <aside className="grid min-w-0 content-start gap-5 lg:border-l lg:border-border lg:pl-7" aria-label="Published payment requirements">
        <section className="grid gap-3"><p className="text-xs font-medium text-muted-foreground">PROVIDER PRICE</p>
          <p className="break-words text-3xl font-semibold tracking-tight tabular-nums">{priceLabel}</p>
          {priceLabel === 'See payment details' && entry.prices[0] !== undefined ? <dl className="grid min-w-0 gap-1 text-xs"><dt className="font-medium">Token amount</dt><dd className="break-all text-muted-foreground">{entry.prices[0].amount}</dd><dt className="sr-only">Network</dt><dd className="break-all text-muted-foreground">{entry.prices[0].network}</dd></dl> : null}
          {entry.prices[0] === undefined ? null : <p className="text-xs text-muted-foreground">{directoryNetworkLabel(entry)} · {entry.prices[0].scheme}</p>}
          {entry.prices.length < 2 ? null : <details><summary className="cursor-pointer text-xs font-medium">{entry.prices.length} payment options</summary><ul className="mt-3 grid gap-2">{entry.prices.slice(1).map((price, index) => <li key={index} className="text-xs">{price.amount} · {price.networkLabel ?? price.network}</li>)}</ul></details>}
          <p className="text-xs leading-relaxed text-muted-foreground">The endpoint confirms the price for your actual request.</p>
          <Button className="mt-1 w-full" onClick={() => setTab('playground')}>Prepare request<ArrowRightIcon /></Button>
          <Button variant="outline" className="w-full" onClick={onSave} aria-pressed={saved}><HeartIcon className={saved ? 'fill-current' : ''} />{saved ? 'Saved' : 'Save Tool'}</Button>
          {preparation?.error ? <div className="grid gap-2"><p role="status" className="text-xs text-muted-foreground">{preparation.error}</p><Button variant="ghost" size="sm" onClick={() => setAttempt(value => value + 1)}>Retry preparation</Button></div> : null}
          {preparation?.toolRef ? <Button asChild variant="ghost" size="sm"><Link to="/tools/$toolRef" params={{ toolRef: preparation.toolRef }} search={{ from: returnContext }}>View input contract</Link></Button> : null}
        </section>
        {entry.activity?.calls30d === undefined && entry.activity?.payers30d === undefined ? null : <section className="grid gap-3 border-t border-border pt-5"><h3 className="text-sm font-semibold">Last 30 days</h3><dl className="grid gap-2 text-sm">{entry.activity.calls30d === undefined ? null : <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Calls</dt><dd className="font-medium tabular-nums">{directoryCount(entry.activity.calls30d)}</dd></div>}{entry.activity.payers30d === undefined ? null : <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Payers</dt><dd className="font-medium tabular-nums">{directoryCount(entry.activity.payers30d)}</dd></div>}</dl><p className="text-xs text-muted-foreground">Reported by Coinbase Bazaar</p></section>}
        <section className="grid gap-3 border-t border-border pt-5"><h3 className="text-sm font-semibold">Listing source</h3><p className="text-sm">Coinbase Bazaar</p><p className="text-xs leading-relaxed text-muted-foreground">Descriptions, examples and payment requirements are published by the Provider.</p>{entry.provenance?.updatedAt === undefined ? null : <p className="text-xs text-muted-foreground">Updated {directoryDate(entry.provenance.updatedAt)}</p>}{entry.activity?.lastCalledAt === undefined ? null : <p className="text-xs text-muted-foreground">Last Call {directoryDate(entry.activity.lastCalledAt)}</p>}</section>
      </aside>
    </div>
  </>
}

function InputFields({ entry }: Readonly<{ entry: X402DirectoryEntry }>) {
  const fields = entry.input?.fields ?? []
  return <section className="grid gap-3" aria-label="Input fields"><h3 className="text-lg font-semibold">What it needs</h3>
    {entry.schemaSummary === undefined ? null : <p className="text-sm leading-relaxed text-muted-foreground">{entry.schemaSummary}</p>}
    {fields.length === 0 ? <p className="text-sm text-muted-foreground">{entry.input?.schemaOmitted ? 'The published schema is too large to display here.' : 'No individual input fields are published. Check the contract or prepare a request to explore the AE input.'}</p> : <dl className="divide-y divide-border rounded-xl border border-border px-4">{fields.slice(0, 10).map(field => <div key={`${field.location}:${field.path}`} className="grid gap-1.5 py-3.5"><dt className="flex flex-wrap items-center gap-2"><span className="break-all font-mono text-sm">{field.name}</span>{field.type ? <span className="text-xs text-muted-foreground">{field.type}</span> : null}{field.required ? <Badge variant="outline">Required</Badge> : null}</dt><dd className="text-sm leading-relaxed text-muted-foreground">{field.description ?? `${field.location === 'queryParams' ? 'Query parameter' : field.location === 'pathParams' ? 'Path parameter' : field.location === 'body' ? 'Request body' : field.location} · ${field.source === 'example' ? 'From published example' : field.path}`}{field.enumValues?.length ? <span className="mt-1 block text-xs">Values: {field.enumValues.join(', ')}</span> : null}</dd></div>)}</dl>}
    {fields.length > 10 || entry.input?.fieldsTruncated ? <p className="text-xs text-muted-foreground">Showing the first {Math.min(fields.length, 10)} published fields. The Contract tab contains the available schema.</p> : null}
  </section>
}

function shellArgument(value: string) { return /^[a-zA-Z0-9:._/-]+$/u.test(value) ? value : `'${value.replaceAll("'", "'\"'\"'")}'` }
function parseJson(value: string | undefined): unknown { try { return value === undefined ? undefined : JSON.parse(value) } catch { return undefined } }
function imageExample(value: unknown, qualified = false, depth = 0): string | undefined {
  if (depth > 5) return undefined
  if (typeof value === 'string') {
    try { const url = new URL(value); return /^(https?:)$/u.test(url.protocol) && !url.username && !url.password && (qualified || /\.(?:png|jpe?g|webp|gif|avif)$/iu.test(url.pathname)) ? url.href : undefined } catch { return undefined }
  }
  if (Array.isArray(value)) { for (const item of value.slice(0, 10)) { const image = imageExample(item, qualified, depth + 1); if (image) return image } }
  else if (value && typeof value === 'object') { for (const [key, item] of Object.entries(value).slice(0, 30)) { const image = imageExample(item, /^(?:image|images|image_url|imageUrl|image_urls|imageUrls|thumbnail|thumbnail_url)$/u.test(key), depth + 1); if (image) return image } }
  return undefined
}
function OutputExample({ entry }: Readonly<{ entry: X402DirectoryEntry }>) {
  const example = parseJson(entry.output?.exampleJson)
  const image = imageExample(example)
  const [failed, setFailed] = useState(false)
  if (example === undefined) return <div className="rounded-xl border border-dashed border-border px-5 py-7"><p className="text-sm font-medium">No output example published</p><p className="mt-1 text-sm text-muted-foreground">{entry.output?.exampleOmitted ? 'The sample response is too large to display here.' : 'Check the output schema in Contract for the response structure.'}</p></div>
  return <div className="grid min-w-0 gap-3">{image && !failed ? <figure className="overflow-hidden rounded-xl border border-border bg-muted/20"><img src={image} alt="Provider example output" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-80 w-full object-contain" /><figcaption className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Provider example · Published sample, not a generated result</figcaption></figure> : null}{failed ? <p className="text-xs text-muted-foreground">The example image is unavailable. Its published response is below.</p> : null}<JsonDisclosure title="Example response" code={JSON.stringify(example, null, 2)} open={!image || failed} /></div>
}
function JsonDisclosure({ title, code, open = false }: Readonly<{ title: string; code: string; open?: boolean }>) {
  const parsed = parseJson(code)
  return <details open={open} className="min-w-0 rounded-lg border border-border"><summary className="cursor-pointer px-4 py-3 text-sm font-medium">{title}</summary><CodeBlock code={parsed === undefined ? code : JSON.stringify(parsed, null, 2)} language="json" className="max-h-80 overflow-auto rounded-t-none border-x-0 border-b-0"><CodeBlockHeader><CodeBlockTitle>{title}</CodeBlockTitle></CodeBlockHeader></CodeBlock></details>
}
