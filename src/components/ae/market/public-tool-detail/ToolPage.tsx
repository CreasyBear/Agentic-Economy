import { useEffect, useState, type ReactNode } from 'react'

import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { Avatar } from '@/components/arc/avatar/avatar'
import type { AeStatus } from '@/lib/ui/status-presentation'
import { Card } from '@/components/arc/card/card'
import { CopyButton } from '@/components/arc/copy-button/copy-button'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { JsonViewer } from '@/components/arc/json-viewer/json-viewer'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs'
import { PUBLIC_SURFACE } from '@/content/brand-copy'
import { parseToolInputJson } from '@/components/ae/shared/tool-input-form/tool-input-form'

import { DirectoryToolPlayground, PageLink, RunAction, useToolInput, type ToolRun } from '../DirectoryToolPlayground'
import { MarketBackButton } from './MarketBackButton'
import { ToolConnect } from './ToolConnect'
import { TOOL_INPUT_SEARCH_LIMIT, type ToolPageSearch, type ToolPageSearchChange, type ToolPageTab } from './tool-page-search'
import styles from './ToolPage.module.css'

export type ToolPageModel = Readonly<{
  title: string
  summary?: string
  /** `host` follows the name so the source is plain: "weather-now · example.com". */
  provider?: Readonly<{ name: string; host?: string; href?: string; iconUrl?: string }>
  /** Real listed price, formatted without "per call". */
  price?: string
  /** The source price behind an estimated price, as a secondary line on the price card. */
  priceNote?: string
  readiness: AeStatus
  /** Real usage for the title meta row, Airbnb's rating slot. Omitted when there is none. */
  activity?: string
  /** Copyable tool ref, OpenRouter model-id style. Only callable tools have one. */
  reference?: Readonly<{ label: string; value: string }>
  /** The provider's own URL, shown with the schema. */
  endpoint?: string
  /** HTTP method the provider declared, for example "GET". */
  method?: string
  run: ToolRun
  /** The site's canonical URL for the connect block; absent when it can't be resolved. */
  baseUrl: string | undefined
  inputSchemaJson?: string
  outputSchemaJson?: string
  sampleInputJson?: string
  sampleOutputJson?: string
  inputNotice?: ReactNode
  /** Shown as a section below the tabs, like Airbnb reviews. */
  trackRecord: ReactNode
}>

const TAB_LABELS: Readonly<Record<ToolPageTab, string>> = { try: 'Try it', schema: 'Schema', sample: 'Sample' }

export type ToolPageProps = Readonly<{ model: ToolPageModel; search?: ToolPageSearch; onSearchChange?: ToolPageSearchChange }>

/** OpenRouter model page with an Airbnb listing's sticky price card, from stock Arc components. */
export function ToolPage(props: ToolPageProps) {
  // A different tool starts from its own sample and default tab.
  return <ToolPageBody key={props.model.reference?.value ?? props.model.endpoint ?? props.model.title} {...props} />
}

function ToolPageBody({ model, search, onSearchChange }: ToolPageProps) {
  const { title, summary, provider, price, readiness, reference, run, baseUrl } = model
  const callable = run.kind === 'callable'
  const inputSchema = parseToolInputJson(model.inputSchemaJson)
  const outputSchema = parseToolInputJson(model.outputSchemaJson)
  const sampleOutput = parseToolInputJson(model.sampleOutputJson)
  // A preview has no Try it tab, so its published input example shows beside the sample response.
  const sampleInput = callable ? undefined : parseToolInputJson(model.sampleInputJson)
  const currentTab = search?.tab
  const currentInput = search?.input === undefined ? undefined : JSON.stringify(search.input)
  const input = useToolInput(model.inputSchemaJson, model.sampleInputJson, currentInput)
  // Preview listings have nothing to run, so they open on the real sample and have no Try it tab.
  const tabs: readonly ToolPageTab[] = callable ? ['try', 'schema', 'sample'] : ['sample', 'schema']
  const [tab, setTab] = useState<ToolPageTab>(() => tabs.find(value => value === search?.tab) ?? tabs[0] ?? 'sample')

  // A changed, valid input rides in the URL, so a reload or the sign-in round trip comes back to it.
  const changed = input.errors.length === 0 && input.text !== input.startText && input.value !== null && typeof input.value === 'object' && !Array.isArray(input.value) ? JSON.stringify(input.value) : undefined
  const urlInput = changed !== undefined && changed.length <= TOOL_INPUT_SEARCH_LIMIT ? changed : undefined
  useEffect(() => {
    if (onSearchChange === undefined || urlInput === currentInput) return
    const timer = setTimeout(() => onSearchChange({ ...(currentTab === undefined ? {} : { tab: currentTab }), ...(urlInput === undefined ? {} : { input: JSON.parse(urlInput) as Record<string, unknown> }) }), 400)
    return () => clearTimeout(timer)
  }, [urlInput, currentInput, currentTab, onSearchChange])

  const changeTab = (next: string) => {
    const value = tabs.find(item => item === next)
    if (value === undefined) return
    setTab(value)
    onSearchChange?.({ tab: value, ...(search?.input === undefined ? {} : { input: search.input }) })
  }
  const priceLabel = price === undefined ? 'Priced per call' : PUBLIC_SURFACE.pricePerCall(price)
  // Only a tool aecon runs can promise no account with its provider; a preview says why it can't run instead.
  const cardNotes: string[] = run.kind === 'callable'
    ? [`Pay per call. No subscription, no account with ${provider?.name ?? 'the provider'}.`, 'You approve the exact price before anything is paid.']
    : [run.reason]
  if (model.priceNote !== undefined) cardNotes.push(model.priceNote)

  return <AePublicPage>
    <div className={`arc-market ${styles.page}`}>
      <nav aria-label="Breadcrumb" className={styles.crumbs}><MarketBackButton label="Back to tools" className="min-h-touch" variant="ghost" /></nav>

      <header className={styles.header}>
        {provider === undefined ? null : <p className={styles.provider}>
          <Avatar name={provider.name} size="sm" {...(provider.iconUrl === undefined ? {} : { src: provider.iconUrl })} />
          <span>{provider.href === undefined ? provider.name : <PageLink href={provider.href}>{provider.name}</PageLink>}{provider.host === undefined ? null : ` · ${provider.host}`}</span>
        </p>}
        <h1 className={styles.title} title={title}>{title}</h1>
        {summary === undefined || summary === '' ? null : <p className={styles.summary}>{summary}</p>}
        <div className={styles.meta}>
          <AeStatusBadge status={readiness} density="cell" />
          {model.activity === undefined ? null : <span className={styles.activity}>{model.activity}</span>}
          {reference === undefined ? null : <span className={styles.ref}><span>{reference.label}</span><code title={reference.value}>{reference.value}</code><CopyButton value={reference.value} label={`Copy ${reference.label.toLowerCase()}`} iconOnly variant="plain" /></span>}
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          <Tabs value={tab} onValueChange={changeTab}>
            <TabsList aria-label="Tool details">
              {tabs.map(value => <TabsTrigger key={value} value={value}>{TAB_LABELS[value]}</TabsTrigger>)}
            </TabsList>
            {callable
              ? <TabsContent value="try">
                <DirectoryToolPlayground run={run} input={input} {...optional({ sampleOutputJson: model.sampleOutputJson, inputNotice: model.inputNotice })} />
              </TabsContent>
              : null}
            <TabsContent value="schema">
              <div className={styles.panel}>
                {model.endpoint === undefined ? null : <section className={styles.stack}>
                  <div className={styles.sectionHead}><h2>Request</h2></div>
                  <span className={styles.endpoint}><code title={model.endpoint}>{model.method === undefined ? null : <span className={styles.method}>{model.method} </span>}{model.endpoint}</code><CopyButton value={model.endpoint} label="Copy endpoint" iconOnly variant="plain" /></span>
                </section>}
                <SchemaSection title="Input" data={inputSchema} empty="The provider hasn't published an input schema." />
                <SchemaSection title="Output" data={outputSchema} empty="The provider hasn't published an output schema." />
              </div>
            </TabsContent>
            <TabsContent value="sample">
              <div className={styles.panel}>
                {sampleInput === undefined ? null : <><div className={styles.sectionHead}><h2>Sample input</h2></div><JsonViewer data={sampleInput} rootName="input" label="Sample input" defaultExpandDepth={2} maxHeight={360} /></>}
                {sampleOutput === undefined
                  ? <EmptyState title="No sample output yet" description="The provider hasn't published a sample response." titleAs="p" />
                  : <><div className={styles.sectionHead}><h2>Sample response</h2></div><JsonViewer data={sampleOutput} rootName="response" label="Sample response" defaultExpandDepth={2} maxHeight={560} /></>}
              </div>
            </TabsContent>
          </Tabs>

          {/* OpenRouter keeps the API snippet beside the model; for a callable tool the agent setup comes before its history. */}
          {callable
            ? <section id="connect" className={styles.section} aria-labelledby="connect-title">
              <div className={styles.sectionHead}><h2 id="connect-title">Connect your agent</h2></div>
              {baseUrl === undefined
                ? <p className={styles.muted}>Agent setup is unavailable right now. You can still run this tool here.</p>
                : <>
                  <p className={styles.muted}>Add one MCP URL and your agent can find and run this tool. It asks you before it pays.</p>
                  <ToolConnect baseUrl={baseUrl} toolRef={run.toolRef} sampleInput={input.errors.length === 0 ? input.value : parseToolInputJson(model.sampleInputJson)} />
                </>}
            </section>
            : null}

          <section className={styles.section} aria-labelledby="record-title">
            <div className={styles.sectionHead}><h2 id="record-title">Track record</h2></div>
            {model.trackRecord}
          </section>
        </div>

        <aside className={styles.aside} aria-label="Price">
          <Card title={priceLabel} className={styles.reserve}>
            <div className={styles.reserveBody}>
              <RunAction run={run} input={input} size="lg" className={styles.full} />
              {cardNotes.map(note => <p key={note} className={styles.muted}>{note}</p>)}
            </div>
          </Card>
        </aside>
      </div>
    </div>
    {/* Airbnb's reserve bar: fixed, full width, lifted; the spacer keeps the footer clear of it. */}
    <div className={styles.barSpace} aria-hidden="true" />
    <div className={`arc-market ${styles.bar}`} role="region" aria-label="Price and action">
      <p className={styles.barPrice}>{price === undefined ? priceLabel : <>{price}<span> per call</span></>}</p>
      <RunAction run={run} input={input} size="md" />
    </div>
  </AePublicPage>
}

function SchemaSection({ title, data, empty }: Readonly<{ title: string; data: unknown; empty: string }>) {
  return <section className={styles.stack}>
    <div className={styles.sectionHead}><h2>{title}</h2></div>
    {data === undefined ? <p className={styles.muted}>{empty}</p> : <JsonViewer data={data} rootName={title.toLowerCase()} label={`${title} schema`} defaultExpandDepth={3} maxHeight={480} />}
  </section>
}

function optional<T extends Record<string, unknown>>(values: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> }
}
