import type { ReactNode } from 'react'

import { AeSection } from '@/components/ae/layout/AeSection'

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
    <AeSection
      title="What agents can inspect"
      description="This is the public Operation and tool evidence agents use to compare suppliers."
    >
      <div className="grid gap-8">
        <div className="grid gap-3">
          <h3 className="text-sm font-medium text-foreground">Published Operations</h3>
          {services.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Operations are listed yet.</p>
          ) : (
            <ProofList
              items={services}
              remainingLabel="more published Operations"
              render={(service) => <ServiceProofRow service={service} />}
            />
          )}
        </div>
        <div className="grid gap-3">
          <h3 className="text-sm font-medium text-foreground">Callable tools</h3>
          {tools.length === 0 ? (
            <p className="text-sm text-muted-foreground">No public actions are available yet. Publish an Operation to make one available.</p>
          ) : (
            <ProofList
              items={tools}
              remainingLabel="more tools"
              render={(tool) => <ToolProofRow tool={tool} />}
            />
          )}
        </div>
      </div>
    </AeSection>
  )
}

function ProofList<T>({
  items,
  remainingLabel,
  render,
}: {
  items: readonly T[]
  remainingLabel: string
  render: (item: T) => ReactNode
}) {
  const visible = items.slice(0, INITIAL_PROOF_COUNT)
  const hidden = items.slice(INITIAL_PROOF_COUNT)

  return (
    <>
      <ul className="m-0 grid list-none divide-y divide-border p-0">
        {visible.map((item, index) => (
          <li key={index} className="py-4 first:pt-0 last:pb-0">
            {render(item)}
          </li>
        ))}
      </ul>
      {hidden.length === 0 ? null : (
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium text-foreground">
            Show {hidden.length} {remainingLabel}
          </summary>
          <ul className="m-0 mt-3 grid list-none divide-y divide-border border-t border-border p-0 pt-3">
            {hidden.map((item, index) => (
              <li key={index} className="py-4">
                {render(item)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

function ToolProofRow({ tool }: Readonly<{ tool: SupplyLandingTool }>) {
  return (
    <div className="grid gap-1">
      <p className="font-medium text-foreground">{tool.name}</p>
      <p className="text-sm text-muted-foreground">{tool.summary}</p>
    </div>
  )
}

function ServiceProofRow({ service }: Readonly<{ service: ServiceDto }>) {
  const firstOffering = service.ae.offerings[0]
  const priceText = firstOffering?.price === undefined
    ? (firstOffering?.pricingSummary ?? 'Price supplied in the Operation details')
    : formatPublishedPrice(firstOffering.price)
  return (
    <div className="grid gap-2">
      <div className="grid gap-1 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="font-medium text-foreground">{service.name}</p>
          <p className="text-sm text-muted-foreground">{service.category}</p>
        </div>
        <p className="text-sm text-muted-foreground">{priceText}</p>
      </div>
      <p className="text-sm text-muted-foreground">{firstOffering?.summary ?? service.category}</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <a href={service.ae.links.business} className="inline-flex min-h-11 items-center underline underline-offset-4">Supplier profile</a>
        <a href={service.ae.links.manifest} className="inline-flex min-h-11 items-center underline underline-offset-4">Operation manifest</a>
      </div>
    </div>
  )
}
