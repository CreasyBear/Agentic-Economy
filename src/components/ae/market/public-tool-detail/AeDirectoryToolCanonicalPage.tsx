import { Await, Link } from '@tanstack/react-router'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { DirectoryToolIdentity } from '@/components/ae/market/DirectoryToolIdentity'
import { DirectoryToolPlayground } from '@/components/ae/market/DirectoryToolPlayground'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { directoryTitle, toDirectoryServiceSurface, toDirectoryToolPageModel, type DirectoryToolFieldNote } from '@/modules/market/directory-card.view-model'
import type { ToolDetailPresentation } from '@/modules/market/tool-detail-presentation'

import { MarketBackButton } from './MarketBackButton'
import { PublicToolDetail, toolUnavailablePresentation } from './PublicToolDetail'
import { TOOL_UNAVAILABLE_COPY } from './public-tool-detail.contracts'
import type {
  AeDirectoryToolCanonicalPageProps,
  DirectoryEntrySummaryPageProps,
  DirectoryEntryUnavailableProps,
} from './public-tool-detail.contracts'

export function AeDirectoryToolCanonicalPage({ data }: AeDirectoryToolCanonicalPageProps) {
  if (data.metadata.kind !== 'found' && data.metadata.kind !== 'found_upstream') {
    return <DirectoryEntryUnavailable metadata={data.metadata} />
  }
  const { admission, metadata } = data
  // The loader only omits `admission` alongside a non-'found' metadata, so
  // this is unreachable in practice; kept for type soundness.
  if (admission === undefined) {
    return <DirectoryEntryUnavailable metadata={{ kind: 'unavailable', reason: 'source_unavailable' }} />
  }
  return (
    <Await promise={admission} fallback={<DirectoryEntrySummaryPage entry={metadata.item.entry} upstream={metadata.kind === 'found_upstream'} {...(data.endpoints === undefined ? {} : { endpoints: data.endpoints })} />}>
      {(resolved: ToolDetailPresentation) => resolved.result.kind === 'found'
        ? <PublicToolDetail result={resolved.result} {...(resolved.evidence === undefined ? {} : { evidence: resolved.evidence })} />
        : <DirectoryEntrySummaryPage entry={metadata.item.entry} upstream={metadata.kind === 'found_upstream'} readiness={toolUnavailablePresentation(resolved.result)} {...(data.endpoints === undefined ? {} : { endpoints: data.endpoints })} />}
    </Await>
  )
}

/** Same two-column listing as a Provider page: the story, then a price that stays put. */
function DirectoryEntrySummaryPage({ entry, upstream, readiness, endpoints }: DirectoryEntrySummaryPageProps) {
  const model = toDirectoryToolPageModel(entry)
  const surface = toDirectoryServiceSurface(entry, endpoints?.entries ?? [], endpoints?.truncated === true)
  const priceDetail = model.priceContext === 'Provider price per Call' ? 'Per call, from the Provider' : model.priceContext
  const place = surface.category !== undefined && surface.category.length <= 24 ? surface.category : undefined
  return (
    <AePublicPage>
      <div className="grid gap-section pb-page">
        <AePageHeader
          eyebrow={place ?? 'Tool'}
          title={surface.title}
          description={model.description}
          meta={surface.priceRange}
          actions={<MarketBackButton label="Browse Market" className="min-h-touch" variant="ghost" />}
        />
        <article className="ae-rail grid gap-section">
          <div className="grid gap-section lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
            <div className="grid min-w-0 gap-section">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-related">
                <DirectoryToolIdentity entry={entry} />
                <div className="grid min-w-0 gap-intra">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-intra">
                    <p className="truncate text-base font-medium text-foreground">Offered by {model.providerLine}</p>
                    <Badge variant="outline">{model.methodLabel}</Badge>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {model.providerHost}{model.serviceName === undefined ? '' : ` · ${model.serviceName}`}
                  </p>
                  <Link
                    to="/market"
                    search={{ view: 'tools', provider: model.providerHost }}
                    className="justify-self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Other tools from this Provider
                  </Link>
                </div>
              </div>
              {upstream ? <Badge variant="outline" className="justify-self-start">From the Provider&apos;s listing</Badge> : null}
              <AeFactList
                density="compact"
                className="grid-cols-2 sm:grid-cols-4"
                facts={[
                  { label: 'Category', value: surface.category ?? 'Not published', muted: surface.category === undefined },
                  { label: 'Networks', value: surface.networks },
                  { label: 'Listed price', value: surface.priceRange, mono: true, definition: 'Provider-listed prices across these endpoints. Not an Agentic Economy Quote.' },
                  { label: 'Endpoints', value: surface.endpointCount },
                ]}
              />
              <AeSection title="Endpoints" description={endpoints?.truncated === true ? 'The most-used endpoints from this Provider.' : 'Each route is one Tool, with the Provider’s listed price.'}>
                <ul className="m-0 divide-y divide-border border-y border-border p-0">
                  {surface.endpoints.map(endpoint => (
                    <li key={endpoint.slug} className="grid gap-intra px-gutter py-related sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-section">
                      <div className="grid min-w-0 gap-intra">
                        {endpoint.current ? (
                          <p className="text-base font-medium text-foreground">{endpoint.path}</p>
                        ) : (
                          <Link to="/tools/$providerHost/$slug" params={{ providerHost: endpoint.providerHost, slug: endpoint.slug }} className="text-base font-medium text-foreground underline-offset-4 hover:underline">{endpoint.path}</Link>
                        )}
                        <p className="text-sm text-muted-foreground">{endpoint.title}</p>
                        <p className="text-sm text-muted-foreground">{endpoint.activity}</p>
                      </div>
                      <p className="font-mono text-sm tabular-nums text-foreground">{endpoint.price}</p>
                    </li>
                  ))}
                </ul>
                {endpoints?.truncated === true ? (
                  <Link to="/market" search={{ view: 'tools', provider: surface.host }} className="justify-self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    All tools from this Provider
                  </Link>
                ) : null}
              </AeSection>
              <div className="grid gap-section sm:grid-cols-2">
                {model.asks.length === 0 ? null : (
                  <AeSection title="What you send" description="Fields an agent includes.">
                    <AeFactList facts={listingFacts(model.asks)} />
                  </AeSection>
                )}
                <AeSection title="What comes back" description={model.returns.length === 0 ? model.returnsLabel : 'Named on the listing.'}>
                  {model.returns.length === 0 ? null : <AeFactList facts={listingFacts(model.returns)} />}
                </AeSection>
              </div>
              {model.payments.length < 2 ? null : (
                <AeSection title="Other prices the Provider lists">
                  <AeFactList density="compact" facts={model.payments.map(payment => ({ label: payment.network, value: payment.amount, mono: true }))} />
                </AeSection>
              )}
              <PublishedExample entry={entry} />
            </div>
            <aside aria-label="Price" className="grid gap-related lg:sticky lg:top-20">
              <Card className="grid gap-related">
                <CardHeader className="grid gap-intra">
                  <CardTitle className="font-mono tabular-nums">{model.priceLabel}</CardTitle>
                  <CardDescription>{priceDetail}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">Listed by the Provider. You do not pay on this page. An agent gets a Quote, then one Call.</p>
                </CardContent>
                <CardFooter className="grid items-start gap-intra text-sm text-muted-foreground">
                  {readiness === undefined ? (
                    <p role="status">Checking whether an agent can call this here.</p>
                  ) : (
                    <div role="status" className="grid gap-intra">
                      <p className="font-medium text-foreground">{readiness.title}</p>
                      <p>{readiness.description}</p>
                      <Link to={readiness.action.to} className="inline-flex min-h-touch items-center underline underline-offset-4">{readiness.action.label}</Link>
                    </div>
                  )}
                </CardFooter>
              </Card>
            </aside>
          </div>
        </article>
      </div>
    </AePublicPage>
  )
}

function listingFacts(notes: readonly DirectoryToolFieldNote[]) {
  return notes.map(note => ({
    label: note.label,
    value: note.detail ?? '—',
    muted: note.detail === undefined,
  }))
}

function PublishedExample({ entry }: Readonly<{ entry: DirectoryEntrySummaryPageProps['entry'] }>) {
  return (
    <Collapsible className="grid gap-related">
      <CollapsibleTrigger render={<Button type="button" variant="outline" className="min-h-touch w-fit">See the input and a sample response</Button>} />
      <CollapsibleContent>
        <DirectoryToolPlayground entry={entry} />
      </CollapsibleContent>
    </Collapsible>
  )
}

function DirectoryEntryUnavailable({ metadata }: DirectoryEntryUnavailableProps) {
  const reason = metadata.kind === 'not_found'
    ? 'resource_not_found'
    : metadata.reason === 'query_invalid'
      ? 'query_invalid'
      : 'source_unavailable'
  const presentation = TOOL_UNAVAILABLE_COPY[reason]
  return (
    <AePageState
      tone={presentation.action.to === '/status' ? 'warning' : 'neutral'}
      title={presentation.title}
      description={`${presentation.cause} ${presentation.nextStep}`}
      action={(
        <Link
          to={presentation.action.to}
          className={buttonVariants({ className: 'min-h-touch' })}
        >
          {presentation.action.label}
        </Link>
      )}
    />
  )
}
