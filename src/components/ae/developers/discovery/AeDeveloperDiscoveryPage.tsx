import { CodeBlock } from '@/components/ai-elements/code-block'
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
      actions={
        <div className="flex flex-wrap gap-2">
          {model.artifacts.map((artifact) => (
            <a
              key={artifact.kind}
              href={artifact.href}
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
            >
              {artifact.actionLabel}
            </a>
          ))}
        </div>
      }
    >
      <div className="ae-rail grid gap-page pb-page">
        <AeCollectionRail title={DEVELOPER_DISCOVERY_UI_COPY.sourceHeading} deck={model.copy.readOnlyNotice}>
          <div className="grid gap-related">
            <AeFactList facts={model.summaryFacts} />
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
            />
          ) : (
            <DiscoveryRows rows={model.publicFacts} />
          )}
        </AeCollectionRail>

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
                      className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                    >
                      {DEVELOPER_DISCOVERY_UI_COPY.actions.artifact}
                    </a>
                  </div>
                </div>
                <CodeBlock
                  code={artifact.code}
                  language="json"
                  className="min-w-0 [&_code]:break-all [&_pre]:whitespace-pre-wrap"
                />
              </section>
            ))}
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
