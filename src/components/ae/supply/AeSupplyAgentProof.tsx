import { useId, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'

import type { SupplyLandingTool } from '@/modules/capability-supply/supply-funnel.functions'
import type { ToolCardViewModel } from '@/modules/market/tool-view-model'
import './SupplyProofGalleryComposition.css'

const INITIAL_PROOF_COUNT = 3

export function AeSupplyAgentProof({
  tools,
  publishedTools,
}: Readonly<{
  tools: readonly SupplyLandingTool[]
  publishedTools: readonly ToolCardViewModel[]
}>) {
  const id = useId()

  return (
    <section className="arc-market arc-supply-proof" aria-labelledby={id}>
      <header className="arc-supply-proof__header">
        <h2 id={id} className="arc-supply-proof__title">What agents can inspect</h2>
        <p className="arc-supply-proof__deck">Provider profiles are business metadata. Agentic Economy interface actions help agents inspect them; neither becomes callable supply until a Tool is admitted and published.</p>
      </header>
      <div className="arc-supply-proof__groups">
        <section className="arc-supply-proof__group" aria-labelledby={`${id}-published`}>
          <h3 id={`${id}-published`} className="arc-supply-proof__group-title">Tools agents can find now</h3>
          {publishedTools.length === 0 ? (
            <p className="arc-supply-proof__empty">No Tools are published yet. Be the first provider to add one bounded job.</p>
          ) : (
            <ProofList
              items={publishedTools}
              remainingLabel="more Tools"
              listClassName="arc-supply-proof__published-list"
              getKey={(tool) => tool.toolRef}
              render={(tool) => <PublishedToolProofRow tool={tool} />}
            />
          )}
        </section>
        <section className="arc-supply-proof__group" aria-labelledby={`${id}-inspection`}>
          <h3 id={`${id}-inspection`} className="arc-supply-proof__group-title">Agentic Economy public inspection actions</h3>
          {tools.length === 0 ? (
            <p className="arc-supply-proof__empty">Agentic Economy public inspection actions are temporarily unavailable.</p>
          ) : (
            <ProofList
              items={tools}
              remainingLabel="more Tools"
              listClassName="arc-supply-proof__inspection-list"
              getKey={(tool) => tool.id}
              render={(tool) => <ToolProofRow tool={tool} />}
            />
          )}
        </section>
      </div>
    </section>
  )
}

function ProofList<T>({
  items,
  remainingLabel,
  listClassName,
  getKey,
  render,
}: {
  items: readonly T[]
  remainingLabel: string
  listClassName: 'arc-supply-proof__published-list' | 'arc-supply-proof__inspection-list'
  getKey: (item: T) => string
  render: (item: T) => ReactNode
}) {
  const visible = items.slice(0, INITIAL_PROOF_COUNT)
  const hidden = items.slice(INITIAL_PROOF_COUNT)

  return (
    <>
      <ul className={`arc-supply-proof__list ${listClassName}`}>
        {visible.map((item) => (
          <li key={getKey(item)} className="arc-supply-proof__item">
            {render(item)}
          </li>
        ))}
      </ul>
      {hidden.length === 0 ? null : (
        <details className="arc-supply-proof__details">
          <summary className="arc-supply-proof__summary">
            Show {hidden.length} {remainingLabel}
          </summary>
          <ul className={`arc-supply-proof__list ${listClassName} arc-supply-proof__hidden-list`}>
            {hidden.map((item) => (
              <li key={getKey(item)} className="arc-supply-proof__item">
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
    <div className="arc-supply-proof__inspection-row">
      <p className="arc-supply-proof__inspection-name">{tool.name}</p>
      <p className="arc-supply-proof__inspection-summary">{tool.summary}</p>
    </div>
  )
}

function PublishedToolProofRow({ tool }: Readonly<{ tool: ToolCardViewModel }>) {
  return (
    <article className="arc-supply-proof__tool-card">
      <div className="arc-supply-proof__tool-surface">
        <p className="arc-supply-proof__tool-source">{tool.providerName} · {tool.category.label}</p>
      </div>
      <div className="arc-supply-proof__tool-info">
        <h4 className="arc-supply-proof__tool-name">{tool.title}</h4>
        <div className="arc-supply-proof__tool-state">
          <Badge className="arc-supply-proof__readiness" variant={tool.readiness === 'Routeable' ? 'success' : tool.readiness === 'SetupRequired' ? 'warning' : 'outline'}>
            {tool.readinessLabel}
          </Badge>
        </div>
        <p className="arc-supply-proof__tool-summary">{tool.summary}</p>
        <div className="arc-supply-proof__tool-meta">
          <span className="arc-supply-proof__tool-price">{tool.price}</span>
        </div>
      </div>
    </article>
  )
}
