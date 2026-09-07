import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/ui/badge'

import type { SupplyLandingTool } from '@/modules/capability-supply/supply-funnel.functions'
import type { ToolCardViewModel } from '@/modules/market/tool-view-model'

const INITIAL_PROOF_COUNT = 3

export function AeSupplyAgentProof({
  tools,
  publishedTools,
}: Readonly<{
  tools: readonly SupplyLandingTool[]
  publishedTools: readonly ToolCardViewModel[]
}>) {
  return (
    <AeSection
      title="What agents can inspect"
      description="Provider profiles are business metadata. AE interface actions help agents inspect them; neither becomes callable supply until a Tool is admitted and published."
    >
      <div className="grid gap-8">
        <div className="grid gap-3">
          <h3 className="text-sm font-medium text-foreground">Tools agents can find now</h3>
          {publishedTools.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Tools are published yet. Be the first provider to add one bounded job.</p>
          ) : (
            <ProofList
              items={publishedTools}
              remainingLabel="more Tools"
              getKey={(tool) => tool.toolRef}
              render={(tool) => <PublishedToolProofRow tool={tool} />}
            />
          )}
        </div>
        <div className="grid gap-3">
          <h3 className="text-sm font-medium text-foreground">AE public inspection actions</h3>
          {tools.length === 0 ? (
            <p className="text-sm text-muted-foreground">AE public inspection actions are temporarily unavailable.</p>
          ) : (
            <ProofList
              items={tools}
              remainingLabel="more tools"
              getKey={(tool) => tool.id}
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
  getKey,
  render,
}: {
  items: readonly T[]
  remainingLabel: string
  getKey: (item: T) => string
  render: (item: T) => ReactNode
}) {
  const visible = items.slice(0, INITIAL_PROOF_COUNT)
  const hidden = items.slice(INITIAL_PROOF_COUNT)

  return (
    <>
      <ul className="m-0 grid list-none divide-y divide-border p-0">
        {visible.map((item) => (
          <li key={getKey(item)} className="py-4 first:pt-0 last:pb-0">
            {render(item)}
          </li>
        ))}
      </ul>
      {hidden.length === 0 ? null : (
        <details className="mt-3">
          <summary className="flex min-h-touch cursor-pointer items-center font-medium text-foreground">
            Show {hidden.length} {remainingLabel}
          </summary>
          <ul className="m-0 mt-3 grid list-none divide-y divide-border border-t border-border p-0 pt-3">
            {hidden.map((item) => (
              <li key={getKey(item)} className="py-4">
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

function PublishedToolProofRow({ tool }: Readonly<{ tool: ToolCardViewModel }>) {
  return (
    <div className="grid gap-2">
      <div className="grid gap-1 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <Link
            to="/tools/$toolRef"
            params={{ toolRef: tool.toolRef }}
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tool.title}
          </Link>
          <p className="text-sm text-muted-foreground">{tool.providerName} · {tool.category.label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Badge variant={tool.readiness === 'Routeable' ? 'success' : tool.readiness === 'SetupRequired' ? 'warning' : 'outline'}>
            {tool.readinessLabel}
          </Badge>
          <span className="text-sm tabular-nums text-muted-foreground">{tool.price}</span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{tool.summary}</p>
    </div>
  )
}
