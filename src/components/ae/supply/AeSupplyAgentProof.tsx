import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

import type { SupplyLandingTool } from '@/modules/capability-supply/supply-funnel.functions'
import type { ServiceDto } from '@/modules/registry/public'
import { formatPublishedPrice } from '@/components/ae/services/money'

const INITIAL_PROOF_COUNT = 3

export function AeSupplyAgentProof({
  tools,
  services,
}: Readonly<{
  tools: readonly SupplyLandingTool[]
  services: readonly ServiceDto[]
}>) {
  return (
    <section aria-labelledby="supply-agent-proof" className="grid gap-5">
      <div className="grid gap-1">
        <h2 id="supply-agent-proof" className="text-xl font-semibold text-foreground">What agents can inspect</h2>
        <p className="block max-w-3xl text-sm text-muted-foreground">
          This is the public Operation and tool evidence agents use to compare suppliers.
        </p>
      </div>
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle>
            <h3 className="text-lg font-semibold text-foreground">Published Operations</h3>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 p-5">
          {services.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No Operations are listed yet.</EmptyTitle>
                <EmptyDescription>Publish one to make it available to agents.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <ul className="m-0 grid list-none gap-3 p-0">
                {services.slice(0, INITIAL_PROOF_COUNT).map((service, index) => <ServiceProofRow key={`${service.id}:${index}`} service={service} />)}
              </ul>
              {services.length > INITIAL_PROOF_COUNT ? (
                <details className="mt-3 rounded-md border border-border">
                  <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium text-foreground">
                    Show {services.length - INITIAL_PROOF_COUNT} more published Operations
                  </summary>
                  <ul className="m-0 grid list-none gap-3 border-t border-border p-3">
                    {services.slice(INITIAL_PROOF_COUNT).map((service, index) => <ServiceProofRow key={`${service.id}:${INITIAL_PROOF_COUNT + index}`} service={service} />)}
                  </ul>
                </details>
              ) : null}
            </>
          )}
        </CardContent>
        <CardHeader className="border-t border-border p-5 pb-0">
          <CardTitle>
            <h3 className="text-lg font-semibold text-foreground">Callable tools</h3>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 p-5">
          {tools.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No public actions are available yet.</EmptyTitle>
                <EmptyDescription>Publish an Operation to make one available.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <ul className="m-0 grid list-none gap-3 p-0">
                {tools.slice(0, INITIAL_PROOF_COUNT).map((tool, index) => <ToolProofRow key={`${tool.id}:${index}`} tool={tool} />)}
              </ul>
              {tools.length > INITIAL_PROOF_COUNT ? (
                <details className="mt-3 rounded-md border border-border">
                  <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium text-foreground">
                    Show {tools.length - INITIAL_PROOF_COUNT} more tools
                  </summary>
                  <ul className="m-0 grid list-none gap-3 border-t border-border p-3">
                    {tools.slice(INITIAL_PROOF_COUNT).map((tool, index) => <ToolProofRow key={`${tool.id}:${INITIAL_PROOF_COUNT + index}`} tool={tool} />)}
                  </ul>
                </details>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function ToolProofRow({ tool }: Readonly<{ tool: SupplyLandingTool }>) {
  return (
    <li className="grid gap-1 rounded-md border border-border p-3">
      <p className="block font-semibold text-foreground">{tool.name}</p>
      <p className="block text-muted-foreground">{tool.summary}</p>
      <details className="text-sm text-muted-foreground">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium text-foreground">Technical details</summary>
        <div className="mt-2 grid gap-4">
          <p className="block text-sm text-muted-foreground">{tool.boundaries.join(' ')}</p>
          <RefDisclosure label="Action" raw={tool.id} />
          <RefDisclosure
            label="Request schema"
            raw={tool.inputJsonSchema ?? 'Not supplied'}
          />
          <RefDisclosure
            label="Response schema"
            raw={tool.outputJsonSchema ?? 'Not supplied'}
          />
        </div>
      </details>
    </li>
  )
}

function RefDisclosure({ label, raw }: { label: string; raw: string }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</p>
      <Collapsible className="grid gap-1">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm font-medium text-foreground transition-colors hover:text-primary"
          >
            View
            <span aria-hidden="true">{'▾'}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <code className="block whitespace-pre-wrap break-words font-mono text-xs leading-5 text-muted-foreground">
            {raw}
          </code>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function ServiceProofRow({ service }: Readonly<{ service: ServiceDto }>) {
  const firstOffering = service.ae.offerings[0]
  const priceText = firstOffering?.price === undefined
    ? (firstOffering?.pricingSummary ?? 'Price supplied in the Operation details')
    : formatPublishedPrice(firstOffering.price)
  return (
    <li className="grid gap-2 rounded-md border border-border p-3">
      <div className="grid gap-1 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="block font-semibold text-foreground">{service.name}</p>
          <p className="block text-sm text-muted-foreground">{service.category}</p>
        </div>
        <p className="block text-sm text-muted-foreground">{priceText}</p>
      </div>
      <p className="block text-muted-foreground">{firstOffering?.summary ?? service.category}</p>
      <details className="text-sm text-muted-foreground">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium text-foreground">Technical connection details</summary>
        <div className="mt-2 grid gap-1">
          {service.endpoints.map((endpoint, index) => <div key={`${endpoint.url}:${endpoint.method ?? 'request'}:${index}`}><span className="font-medium text-foreground">{endpoint.description}</span> · {endpoint.method ?? 'Request'} · {endpoint.url}</div>)}
        </div>
      </details>
      <div className="flex flex-wrap gap-3 text-sm">
        <a href={service.ae.links.business} className="inline-flex min-h-11 items-center underline underline-offset-4">Supplier profile</a>
        <a href={service.ae.links.manifest} className="inline-flex min-h-11 items-center underline underline-offset-4">Operation manifest</a>
      </div>
    </li>
  )
}
