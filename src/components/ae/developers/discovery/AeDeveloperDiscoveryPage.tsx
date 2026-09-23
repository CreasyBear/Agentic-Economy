import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeCollectionRail } from '@/components/ae/shared/AeCollectionRail'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { DiscoveryRows } from './components/DiscoveryRows'
import { DEVELOPER_DISCOVERY_UI_COPY } from './discovery.contracts'
import type { DeveloperDiscoveryViewModel } from './discovery.contracts'

export type AeDeveloperDiscoveryPageProps = Readonly<{
  model: DeveloperDiscoveryViewModel
}>

export function AeDeveloperDiscoveryPage({ model }: AeDeveloperDiscoveryPageProps) {
  return (
    <AePublicPage
      kind="document"
      eyebrow={model.copy.eyebrow}
      title={model.copy.title}
      description={model.copy.description}
    >
      <div className="ae-rail grid gap-page pb-page">
        <AeCollectionRail
          titleId="schema"
          title={DEVELOPER_DISCOVERY_UI_COPY.artifactsHeading}
          deck={DEVELOPER_DISCOVERY_UI_COPY.artifactsDescription}
        >
          <div className="grid gap-related">
            {model.artifacts.map((artifact) => (
              <section
                key={artifact.kind}
                id={artifact.kind}
                aria-labelledby={`${artifact.kind}-title`}
                className="grid gap-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-1">
                    <h3 id={`${artifact.kind}-title`} className="text-sm font-medium text-foreground">
                      {artifact.label}
                    </h3>
                    <p className="break-all text-sm text-muted-foreground">{artifact.origin}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Badge variant={artifact.statusVariant}>{artifact.statusLabel}</Badge>
                    <span className="text-sm text-muted-foreground">{artifact.checkedLabel}</span>
                    <a
                      href={artifact.href}
                      aria-label={`${artifact.actionLabel}, ${artifact.label}`}
                      className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                    >
                      {artifact.actionLabel}
                    </a>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </AeCollectionRail>

        <AeCollectionRail
          titleId="facts"
          title={DEVELOPER_DISCOVERY_UI_COPY.factsHeading}
          deck={DEVELOPER_DISCOVERY_UI_COPY.factsDescription}
        >
          {model.publicFacts.length === 0 ? (
            <AeEmptyState
              title={DEVELOPER_DISCOVERY_UI_COPY.emptyFactsHeading}
              description={DEVELOPER_DISCOVERY_UI_COPY.emptyFactsDescription}
              titleAs="p"
            />
          ) : (
            <DiscoveryRows rows={model.publicFacts} />
          )}
        </AeCollectionRail>

        <AeCollectionRail title={DEVELOPER_DISCOVERY_UI_COPY.sourceHeading} deck={model.copy.readOnlyNotice}>
          <div className="grid gap-related">
            <AeFactList facts={model.summaryFacts} />
          </div>
        </AeCollectionRail>

        <AeCollectionRail
          title={DEVELOPER_DISCOVERY_UI_COPY.readPathsHeading}
          deck={DEVELOPER_DISCOVERY_UI_COPY.readPathsDescription}
        >
          <DiscoveryRows rows={model.routeHealth} />
        </AeCollectionRail>
      </div>
    </AePublicPage>
  )
}
