import { createFileRoute } from '@tanstack/react-router'
import { CodeBlock } from '@/components/ai-elements/code-block'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSection } from '@/components/ae/layout/AeSection'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { loadDeveloperDiscoveryRouteServer } from '@/modules/discovery/developer-discovery-route'

export const Route = createFileRoute('/_operator/developers/discovery')({
  ...operatorRouteOptions,
  loader: () => loadDeveloperDiscoveryRouteServer(),
  head: () => ({
    meta: [
      { title: 'Builder readbacks | Agentic Economy' },
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
    <AeOperatorShell
      operatorRole="developer"
      title={readback.copy.title}
      description={readback.copy.description}
      currentPath="/developers/discovery"
      mainContentId="main-content"
      actions={
        <div className="flex flex-wrap gap-2">
          {readback.artifacts.map((artifact) => (
            <Button asChild key={artifact.kind} variant="secondary" size="sm">
              <a href={artifact.route}>{artifact.downloadLabel}</a>
            </Button>
          ))}
        </div>
      }
    >
      <div className="grid w-full gap-8">
        <AeSection title="Source-owned readback" description={readback.copy.readOnlyNotice}>
          <AeFactList
            facts={[
              { label: 'Freshness', value: readback.freshness.label },
              { label: 'Published catalogs', value: String(readback.catalogCount) },
              { label: 'Schema version', value: readback.schemaVersion },
            ]}
          />
          <p className="text-sm text-muted-foreground">{readback.freshness.reason}</p>
        </AeSection>

        <AeSection id="facts" title="Current public catalog facts" description="Rendered from the public catalog DTO, not private owner evidence.">
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
        </AeSection>

        <AeSection id="schema" title="Schema, examples, and fixture labels" description="Each artifact is withheld or marked degraded from the same freshness readback.">
          <div className="grid gap-6">
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
        </AeSection>

        <AeSection title="Read path status" description="Public read paths only.">
          <DiscoveryRows
            rows={readback.routeHealth.map((health) => ({
              id: health.route,
              label: health.label,
              state: health.status,
              description: health.route,
            }))}
          />
        </AeSection>

        <AeSection id="support-matrix" title="Discovery support matrix" description="Shipped rows are limited to route-tested public readbacks.">
          <DiscoveryRows
            rows={readback.supportMatrix.map((row) => ({
              id: row.surface,
              label: row.label,
              state: row.state,
              description: row.nextAction,
            }))}
          />
        </AeSection>

        <AeSection title="Not in this product" description="Unavailable and deferred surfaces are listed so builders do not infer authority.">
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
        </AeSection>
      </div>
    </AeOperatorShell>
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
            <span className="text-sm text-muted-foreground">{row.state}</span>
          </div>
          {row.description === undefined ? null : (
            <p className="text-sm text-muted-foreground">{row.description}</p>
          )}
        </li>
      ))}
    </ul>
  )
}

function developerDiscoveryStateVariant(state: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (state === 'available') return 'default'
  if (state === 'degraded') return 'secondary'
  if (state === 'unavailable') return 'destructive'
  return 'outline'
}
