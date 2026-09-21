import { createFileRoute } from '@tanstack/react-router'
import { SearchCode } from 'lucide-react'
import { CodeBlock } from '@/components/ai-elements/code-block'

import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeCollectionRail } from '@/components/ae/shared/AeCollectionRail'
import { loadDeveloperDiscoveryRouteServer } from '@/modules/discovery/developer-discovery-route'

export const Route = createFileRoute('/developers/discovery')({
  staticData: {
    nav: {
      label: 'Discovery',
      operator: {
        roles: ['developer'],
        group: 'Records',
        groupOrder: 0,
        order: 0,
        icon: SearchCode,
        tier: 'core',
      },
    },
  },
  loader: () => loadDeveloperDiscoveryRouteServer(),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.copy.title ?? 'Discovery'} | Agentic Economy` },
      {
        name: 'description',
        content: 'Read-only public catalog facts, schema shape, examples, freshness, and unavailable states.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: DevelopersDiscoveryRoute,
})

function DevelopersDiscoveryRoute() {
  const readback = Route.useLoaderData()

  return (
    <AePublicPage
      kind="document"
      eyebrow="Developers"
      title={readback.copy.title}
      description={readback.copy.description}
      actions={
        <div className="flex flex-wrap gap-2">
          {readback.artifacts.map((artifact) => (
            <a
              key={artifact.kind}
              href={artifact.route}
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
            >
              {artifact.downloadLabel}
            </a>
          ))}
        </div>
      }
    >
      <div className="ae-rail grid gap-page pb-page">
        <AeCollectionRail title="Source-owned readback" deck={readback.copy.readOnlyNotice}>
          <div className="grid gap-related">
            <AeFactList
              facts={[
                { label: 'Freshness', value: readback.freshness.label },
                { label: 'Published catalogs', value: String(readback.catalogCount) },
                { label: 'Schema version', value: readback.schemaVersion },
              ]}
            />
            <p className="text-sm text-muted-foreground">{readback.freshness.reason}</p>
          </div>
        </AeCollectionRail>

        <AeCollectionRail
          titleId="facts"
          title="Current public catalog facts"
          deck="Rendered from the public catalog DTO, not private owner evidence."
        >
          {readback.publicFacts.length === 0 ? (
            <AeEmptyState
              title="No published catalog facts"
              description="No source-owned public catalog facts are published."
            />
          ) : (
            <DiscoveryRows
              rows={readback.publicFacts.map((fact) => ({
                id: fact.slug,
                label: fact.name,
                state: fact.disposition,
                description: fact.businessContext.kind === 'local_human'
                  ? `${fact.category} in ${fact.businessContext.suburb}, ${fact.businessContext.stateTerritory}`
                  : `${fact.category} from ${fact.businessContext.providerIdentifier}`,
              }))}
            />
          )}
        </AeCollectionRail>

        <AeCollectionRail
          titleId="schema"
          title="Schema, examples, and fixture labels"
          deck="Each artifact is withheld or marked degraded from the same freshness readback."
        >
          <div className="grid gap-related">
            {readback.artifacts.map((artifact) => (
              <section key={artifact.kind} id={artifact.kind} className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-foreground">{artifact.label}</h3>
                  <Badge variant={developerDiscoveryStateVariant(artifact.state)}>{`${artifact.state.charAt(0).toUpperCase()}${artifact.state.slice(1)}`}</Badge>
                </div>
                <CodeBlock
                  code={JSON.stringify({ route: artifact.route, fields: artifact.schemaFields.slice(0, 8) }, null, 2)}
                  language="json"
                  className="min-w-0 [&_code]:break-all [&_pre]:whitespace-pre-wrap"
                />
              </section>
            ))}
          </div>
        </AeCollectionRail>

        <AeCollectionRail title="Read path status" deck="Public read paths only.">
          <DiscoveryRows
            rows={readback.routeHealth.map((health) => ({
              id: health.route,
              label: health.label,
              state: health.status,
              description: health.route,
            }))}
          />
        </AeCollectionRail>

        <AeCollectionRail
          titleId="support-matrix"
          title="Discovery support matrix"
          deck="Shipped rows are limited to route-tested public readbacks."
        >
          <DiscoveryRows
            rows={readback.supportMatrix.map((row) => ({
              id: row.surface,
              label: row.label,
              state: row.state,
              description: row.nextAction,
            }))}
          />
        </AeCollectionRail>

        <AeCollectionRail
          title="Not in this product"
          deck="Unavailable and deferred surfaces are listed so builders do not infer authority."
        >
          <DiscoveryRows
            rows={[
              ...readback.unsupportedCapabilities.map((capability) => ({
                id: capability.label,
                label: capability.label,
                state: capability.state,
                description: capability.reason,
              })),
              ...readback.gatedExclusions.map((exclusion) => ({
                id: exclusion.surface,
                label: exclusion.label,
                state: exclusion.state,
                description: exclusion.reason,
              })),
            ]}
          />
        </AeCollectionRail>
      </div>
    </AePublicPage>
  )
}

function DiscoveryRows({
  rows,
}: {
  rows: readonly { id: string; label: string; state: string; description?: string }[]
}) {
  if (rows.length === 0) {
    return (
      <AeEmptyState
        title="No rows"
        description="Nothing is recorded for this readback."
      />
    )
  }

  return (
    <ul className="m-0 grid list-none divide-y divide-border p-0">
      {rows.map((row) => (
        <li key={row.id} className="grid gap-1 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-medium text-foreground">{row.label}</span>
            <span className="text-sm text-muted-foreground">{discoveryRowStateLabel(row.state)}</span>
          </div>
          {row.description === undefined ? null : (
            <p className="text-sm text-muted-foreground">{row.description}</p>
          )}
        </li>
      ))}
    </ul>
  )
}

function discoveryRowStateLabel(state: string): string {
  if (state === '') {
    return state
  }
  return `${state.charAt(0).toUpperCase()}${state.slice(1)}`
}

function developerDiscoveryStateVariant(state: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (state === 'available') return 'default'
  if (state === 'degraded') return 'secondary'
  if (state === 'unavailable') return 'destructive'
  return 'outline'
}
