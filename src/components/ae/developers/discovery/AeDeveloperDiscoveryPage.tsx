import { useId, useState } from 'react'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeEmptyState } from '@/components/ae/shared/empty-state/AeEmptyState'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { Badge } from '@/components/arc/badge/badge'
import { cn } from '@/lib/utils'
import { DiscoveryRows } from './components/DiscoveryRows'
import { DEVELOPER_DISCOVERY_UI_COPY } from './discovery.contracts'
import type { DeveloperDiscoveryViewModel } from './discovery.contracts'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import '../DeveloperReferenceComposition.css'

export type AeDeveloperDiscoveryPageProps = Readonly<{
  model: DeveloperDiscoveryViewModel
}>

export function AeDeveloperDiscoveryPage({ model }: AeDeveloperDiscoveryPageProps) {
  const outlineId = useId()
  const [outlineOpen, setOutlineOpen] = useState(false)
  const contents = [
    { id: 'schema', title: DEVELOPER_DISCOVERY_UI_COPY.artifactsHeading },
    { id: 'facts', title: DEVELOPER_DISCOVERY_UI_COPY.factsHeading },
    { id: 'discovery-source', title: DEVELOPER_DISCOVERY_UI_COPY.sourceHeading },
    { id: 'discovery-read-paths', title: DEVELOPER_DISCOVERY_UI_COPY.readPathsHeading },
  ]

  return (
    <AePublicPage
      kind="document"
      eyebrow={model.copy.eyebrow}
      title={model.copy.title}
      description={model.copy.description}
    >
      <div className="arc-market arc-developer-reference">
        <div className="arc-reference-reading">
          <div className="arc-reference-outline">
            <button type="button" className="arc-reference-outline-toggle" aria-expanded={outlineOpen} aria-controls={outlineId} onClick={() => setOutlineOpen((open) => !open)}>
              Discovery contents
            </button>
            <div id={outlineId} className="arc-reference-outline-panel" data-open={outlineOpen}>
              <nav aria-label="Discovery contents">
                <p className="arc-reference-outline-title">On this page</p>
                <ul>{contents.map((item) => <li key={item.id}><a href={`#${item.id}`} onClick={() => setOutlineOpen(false)}>{item.title}</a></li>)}</ul>
              </nav>
            </div>
          </div>
          <div className="arc-reference-content">
            <section className="arc-reference-region" aria-labelledby="schema">
              <header>
                <h2 id="schema" tabIndex={-1}>{DEVELOPER_DISCOVERY_UI_COPY.artifactsHeading}</h2>
                <p>{DEVELOPER_DISCOVERY_UI_COPY.artifactsDescription}</p>
              </header>
              <div className="arc-reference-records">
                {model.artifacts.map((artifact) => (
                  <section key={artifact.kind} id={artifact.kind} aria-labelledby={`${artifact.kind}-title`} className="arc-reference-artifact">
                    <div>
                      <h3 id={`${artifact.kind}-title`}>{artifact.label}</h3>
                      <p>{artifact.origin}</p>
                    </div>
                    <div className="arc-reference-artifact-status">
                      <Badge tone={artifact.statusVariant}>{artifact.statusLabel}</Badge>
                      <span>{artifact.checkedLabel}</span>
                      <a href={artifact.href} aria-label={`${artifact.actionLabel}, ${artifact.label}`} className={cn(actionLinkClassName('secondary', 'md'))}>
                        {artifact.actionLabel}
                      </a>
                    </div>
                  </section>
                ))}
              </div>
            </section>
            <section className="arc-reference-region" aria-labelledby="facts">
              <header>
                <h2 id="facts" tabIndex={-1}>{DEVELOPER_DISCOVERY_UI_COPY.factsHeading}</h2>
                <p>{DEVELOPER_DISCOVERY_UI_COPY.factsDescription}</p>
              </header>
              {model.publicFacts.length === 0 ? (
                <AeEmptyState title={DEVELOPER_DISCOVERY_UI_COPY.emptyFactsHeading} description={DEVELOPER_DISCOVERY_UI_COPY.emptyFactsDescription} titleAs="p" />
              ) : <DiscoveryRows rows={model.publicFacts} />}
            </section>
            <section className="arc-reference-region" aria-labelledby="discovery-source">
              <header>
                <h2 id="discovery-source" tabIndex={-1}>{DEVELOPER_DISCOVERY_UI_COPY.sourceHeading}</h2>
                <p>{model.copy.readOnlyNotice}</p>
              </header>
              <AeFactList facts={model.summaryFacts} />
            </section>
            <section className="arc-reference-region" aria-labelledby="discovery-read-paths">
              <header>
                <h2 id="discovery-read-paths" tabIndex={-1}>{DEVELOPER_DISCOVERY_UI_COPY.readPathsHeading}</h2>
                <p>{DEVELOPER_DISCOVERY_UI_COPY.readPathsDescription}</p>
              </header>
              <DiscoveryRows rows={model.routeHealth} />
            </section>
          </div>
        </div>
      </div>
    </AePublicPage>
  )
}
