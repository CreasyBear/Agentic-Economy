import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ToolObjectView } from './object-family.contracts'
import { ToolFacts } from './ToolFacts'

export type ToolDetailFactsProps = Readonly<{
  view: ToolObjectView
  primary: Readonly<{ label: string; onSelect: () => void }>
  chatHref?: string
  cliCommand?: string
  onCopyCli?: () => void
  hideTechnicalRefs?: boolean
}>

export function ToolDetailFacts({ view, primary, chatHref, cliCommand, onCopyCli, hideTechnicalRefs = false }: ToolDetailFactsProps) {
  return (
    <section aria-label="Tool decision facts" className="grid min-w-0 gap-section">
      <div className="grid min-w-0 gap-related">
        <h1 className="min-w-0 wrap-anywhere text-title-lg font-medium tracking-tight">{view.title}</h1>
        {view.outcome === undefined ? null : <p className="min-w-0 wrap-anywhere text-deck text-muted-foreground">{view.outcome}</p>}
        <ToolFacts view={view} />
        <p className="text-xs text-muted-foreground">Title source: {view.listing.identity.title.provenance.replaceAll('_', ' ')}</p>
        {view.price === undefined ? null : <p className="text-xs text-muted-foreground">Price source: {view.listing.facts.price.provenance.replaceAll('_', ' ')}</p>}
        {view.readiness.source === undefined ? null : <p className="text-xs text-muted-foreground">Readiness source: {view.listing.facts.readiness.provenance.replaceAll('_', ' ')}</p>}
        {view.identity === undefined ? null : <p className="text-sm">{view.identity.kind === 'verified_provider' ? 'Provider' : view.identity.kind === 'publisher' ? 'Publisher' : 'Directory Host'}: {view.identity.kind === 'publisher' ? <span>{view.identity.name}</span> : <a href={view.identity.href} className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">{view.identity.name}</a>}</p>}
        {view.identity?.kind === 'publisher' && view.listing.identity.hostName.kind === 'present' && view.listing.hostPage.kind === 'present' ? <p className="text-sm">Directory Host: <a href={view.listing.hostPage.value} className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">{view.listing.identity.hostName.value}</a></p> : null}
        {view.listing.canonicalToolRef.kind === 'absent' ? <p className="text-sm text-muted-foreground">Directory or catalogue listing, not callable through AE.</p> : null}
      </div>
      <Card id="start" className="min-w-0 scroll-mt-20">
        <CardHeader><CardTitle><h2 className="text-lg">Start</h2></CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button type="button" className="min-h-touch h-auto min-w-0 max-w-full whitespace-normal text-center" onClick={primary.onSelect}>{primary.label}</Button>
          {chatHref === undefined ? null : <a href={chatHref} className="min-h-touch content-center px-3 text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">Try in chat (may charge after approval)</a>}
          {cliCommand === undefined || onCopyCli === undefined ? null : <Button type="button" variant="outline" className="min-h-touch h-auto min-w-0 max-w-full whitespace-normal text-center" onClick={onCopyCli}>Copy CLI command</Button>}
        </CardContent>
      </Card>
      {hideTechnicalRefs ? null : <details className="min-w-0 border-t border-border pt-related">
        <summary className="min-h-touch cursor-pointer text-sm font-medium">Technical source references</summary>
        <dl className="grid min-w-0 gap-intra pt-related text-xs">
          <dt>Title source</dt><dd className="break-all font-mono">{view.listing.identity.title.sourceRef}</dd>
          {view.price === undefined ? null : <><dt>Price source</dt><dd className="break-all font-mono">{view.listing.facts.price.sourceRef}</dd></>}
          {view.readiness.source === undefined ? null : <><dt>Readiness source</dt><dd className="break-all font-mono">{view.listing.facts.readiness.sourceRef}</dd></>}
          {view.listing.technical.operationId.kind === 'present' ? <><dt>Operation ID</dt><dd className="break-all font-mono">{view.listing.technical.operationId.value}</dd></> : null}
          {view.listing.technical.endpoint.kind === 'present' ? <><dt>Endpoint</dt><dd className="break-all font-mono">{view.listing.technical.endpoint.value}</dd></> : null}
          {cliCommand === undefined ? null : <><dt>CLI command</dt><dd className="break-all font-mono">{cliCommand}</dd></>}
        </dl>
      </details>}
    </section>
  )
}
