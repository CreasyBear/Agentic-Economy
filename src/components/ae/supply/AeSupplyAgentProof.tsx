import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

import type { AgentToolDescriptor } from '@/modules/actions'
import type { ServiceDto } from '@/modules/registry/public'

const INITIAL_PROOF_COUNT = 3

export function AeSupplyAgentProof({
  tools,
  services,
}: Readonly<{
  tools: readonly AgentToolDescriptor[]
  services: readonly ServiceDto[]
}>) {
  return (
    <section aria-labelledby="supply-agent-proof" className="grid gap-5">
      <div className="grid gap-1">
        <h2 id="supply-agent-proof" className="text-xl font-semibold text-foreground">What assistants can see</h2>
        <p className="block max-w-3xl text-sm text-muted-foreground">
          This is the information assistants use to find your business and choose your service.
        </p>
      </div>
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle>
            <h3 className="text-lg font-semibold text-foreground">Published services</h3>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 p-5">
          {services.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No services are listed yet.</EmptyTitle>
                <EmptyDescription>Publish one to make it available to assistants.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <ul className="m-0 grid list-none gap-3 p-0">
                {services.slice(0, INITIAL_PROOF_COUNT).map((service) => <ServiceProofRow key={`${service.id}:${service.revision}`} service={service} />)}
              </ul>
              {services.length > INITIAL_PROOF_COUNT ? (
                <details className="mt-3 rounded-md border border-border">
                  <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium text-foreground">
                    Show {services.length - INITIAL_PROOF_COUNT} more published services
                  </summary>
                  <ul className="m-0 grid list-none gap-3 border-t border-border p-3">
                    {services.slice(INITIAL_PROOF_COUNT).map((service) => <ServiceProofRow key={`${service.id}:${service.revision}`} service={service} />)}
                  </ul>
                </details>
              ) : null}
            </>
          )}
        </CardContent>
        <CardHeader className="border-t border-border p-5 pb-0">
          <CardTitle>
            <h3 className="text-lg font-semibold text-foreground">Actions assistants can use</h3>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 p-5">
          {tools.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No public actions are available yet.</EmptyTitle>
                <EmptyDescription>Publish a service to make one available.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <ul className="m-0 grid list-none gap-3 p-0">
                {tools.slice(0, INITIAL_PROOF_COUNT).map((tool) => <ToolProofRow key={tool.id} tool={tool} />)}
              </ul>
              {tools.length > INITIAL_PROOF_COUNT ? (
                <details className="mt-3 rounded-md border border-border">
                  <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium text-foreground">
                    Show {tools.length - INITIAL_PROOF_COUNT} more assistant actions
                  </summary>
                  <ul className="m-0 grid list-none gap-3 border-t border-border p-3">
                    {tools.slice(INITIAL_PROOF_COUNT).map((tool) => <ToolProofRow key={tool.id} tool={tool} />)}
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

function ToolProofRow({ tool }: Readonly<{ tool: AgentToolDescriptor }>) {
  return (
    <li className="grid gap-1 rounded-md border border-border p-3">
      <p className="block font-semibold text-foreground">{tool.name}</p>
      <p className="block text-muted-foreground">{tool.summary}</p>
      <details className="text-sm text-muted-foreground">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium text-foreground">Technical details</summary>
        <div className="mt-2 grid gap-1">
          <p className="block text-sm text-muted-foreground">{tool.boundaries.join(' ')}</p>
          <dl className="grid gap-1">
            <div><dt className="font-medium text-foreground">Action ID</dt><dd className="break-all">{tool.id}</dd></div>
            <div><dt className="font-medium text-foreground">Input schema</dt><dd className="break-all">{tool.inputJsonSchema === undefined ? 'Not supplied' : JSON.stringify(tool.inputJsonSchema)}</dd></div>
            <div><dt className="font-medium text-foreground">Output schema</dt><dd className="break-all">{tool.outputJsonSchema === undefined ? 'Not supplied' : JSON.stringify(tool.outputJsonSchema)}</dd></div>
          </dl>
        </div>
      </details>
    </li>
  )
}

function ServiceProofRow({ service }: Readonly<{ service: ServiceDto }>) {
  return (
    <li className="grid gap-2 rounded-md border border-border p-3">
      <div className="grid gap-1 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="block font-semibold text-foreground">{service.name}</p>
          <p className="block text-sm text-muted-foreground">{service.business.name} · {service.category}</p>
        </div>
        <p className="block text-sm text-muted-foreground">{service.pricingSummary ?? 'Price supplied in the service details'}</p>
      </div>
      <p className="block text-muted-foreground">{service.summary}</p>
      <details className="text-sm text-muted-foreground">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium text-foreground">Technical connection details</summary>
        <div className="mt-2 grid gap-1">
          {service.endpoints.map((endpoint) => <div key={`${endpoint.url}:${endpoint.name}`}><span className="font-medium text-foreground">{endpoint.name}</span> · {endpoint.method ?? 'Request'} · {endpoint.url}</div>)}
        </div>
      </details>
      <div className="flex flex-wrap gap-3 text-sm">
        <a href={service.links.business} className="inline-flex min-h-11 items-center underline underline-offset-4">Business details</a>
        <a href={service.links.manifest} className="inline-flex min-h-11 items-center underline underline-offset-4">Published service details</a>
      </div>
    </li>
  )
}

