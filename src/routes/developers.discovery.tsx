import { createFileRoute } from '@tanstack/react-router'

import { AeOperatorStatusList } from '@/components/ae/operator/AeOperatorStatusList'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from '@/components/ui/item'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { DeveloperDiscoveryRouteReadback } from '@/modules/discovery/developer-discovery'

export const Route = createFileRoute('/developers/discovery')({
  loader: loadDeveloperDiscoveryRoute,
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

export async function loadDeveloperDiscoveryRoute(): Promise<DeveloperDiscoveryRouteReadback> {
  const [{ readDeveloperDiscoveryRoute }, { buildDeveloperDiscoveryRouteSnapshot }, { createDefaultDiscoverySourceState }] =
    await Promise.all([
      import('@/modules/discovery/developer-discovery'),
      import('./api.discovery.schema'),
      import('@/modules/discovery/public'),
    ])
  const request = new Request('https://ae.example/developers/discovery')
  const routeSnapshot = await buildDeveloperDiscoveryRouteSnapshot(request, {
    canonicalBaseUrl: 'https://ae.example',
    now: 0,
  })

  return readDeveloperDiscoveryRoute(createDefaultDiscoverySourceState(), {
    canonicalBaseUrl: 'https://ae.example',
    now: 0,
    routeSnapshot,
  })
}

function DevelopersDiscoveryRoute() {
  const readback = Route.useLoaderData()

  return (
    <AeOperatorShell
      role="developer"
      eyebrow={readback.copy.eyebrow}
      title={readback.copy.title}
      description={readback.copy.description}
      currentPath="/developers/discovery"
      actions={
        <div className="flex flex-wrap gap-2">
          {readback.artifacts.map((artifact) => (
            <Button key={artifact.kind} asChild variant="outline" size="sm">
              <a href={artifact.route}>{artifact.downloadLabel}</a>
            </Button>
          ))}
        </div>
      }
    >
      <section className="grid w-full gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Source-owned readback</CardTitle>
              <CardDescription>{readback.copy.readOnlyNotice}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm md:grid-cols-3">
                <div>
                  <dt className="font-medium">Freshness</dt>
                  <dd className="text-muted-foreground">{readback.freshness.label}</dd>
                </div>
                <div>
                  <dt className="font-medium">Published catalogs</dt>
                  <dd className="text-muted-foreground">{readback.catalogCount}</dd>
                </div>
                <div>
                  <dt className="font-medium">Schema version</dt>
                  <dd className="text-muted-foreground">{readback.schemaVersion}</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm text-muted-foreground">{readback.freshness.reason}</p>
            </CardContent>
          </Card>

          <Card id="facts">
            <CardHeader>
              <CardTitle>Current public catalog facts</CardTitle>
              <CardDescription>Rendered from the public catalog DTO, not private owner evidence.</CardDescription>
            </CardHeader>
            <CardContent>
              {readback.publicFacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No source-owned public catalog facts are published.</p>
              ) : (
                <ScrollArea className="ae-operator-scroll-panel ae-operator-scroll-panel--medium border">
                  <ItemGroup className="gap-3 p-3">
                    {readback.publicFacts.map((fact) => (
                      <Item key={fact.slug} variant="outline" size="sm">
                        <ItemContent>
                          <ItemHeader>
                            <ItemTitle className="font-heading text-base">{fact.name}</ItemTitle>
                          </ItemHeader>
                          <ItemDescription>
                            {fact.category} in {fact.suburb}, {fact.stateTerritory}
                          </ItemDescription>
                          <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                            <div>
                              <dt className="font-medium text-muted-foreground">Discovery</dt>
                              <dd>{fact.discoveryStatus}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-muted-foreground">Services</dt>
                              <dd data-numeric>{fact.serviceCount}</dd>
                            </div>
                          </dl>
                        </ItemContent>
                      </Item>
                    ))}
                  </ItemGroup>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card id="schema">
            <CardHeader>
              <CardTitle>Schema, examples, and fixture labels</CardTitle>
              <CardDescription>Each artifact is withheld or marked degraded from the same freshness readback.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {readback.artifacts.map((artifact) => (
                  <section key={artifact.kind} id={artifact.kind} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="font-heading text-base font-semibold">{artifact.label}</h2>
                      <span className="rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide">
                        {artifact.state}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{artifact.reason}</p>
                    <p className="mt-2 text-sm font-medium">{artifact.downloadLabel}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Fields: {artifact.schemaFields.slice(0, 8).join(', ')}
                    </p>
                  </section>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Read path status</CardTitle>
              <CardDescription>Public read paths only.</CardDescription>
            </CardHeader>
            <CardContent>
              <AeOperatorStatusList
                scroll
                rows={readback.routeHealth.map((health) => ({
                  id: health.route,
                  label: health.label,
                  state: health.status,
                  description: health.route,
                  meta: (
                    <p className="text-xs text-muted-foreground">
                      HTTP {health.httpStatus ?? 'n/a'} · checked {health.checkedAt} · schema {health.schemaVersion ?? 'n/a'} · cache{' '}
                      {health.cacheControl ?? 'n/a'}
                      {health.errorCode === undefined ? '' : ` · code ${health.errorCode}`}
                    </p>
                  ),
                }))}
              />
            </CardContent>
          </Card>

          <Card id="support-matrix">
            <CardHeader>
              <CardTitle>Discovery support matrix</CardTitle>
              <CardDescription>Shipped rows are limited to route-tested public readbacks.</CardDescription>
            </CardHeader>
            <CardContent>
              <AeOperatorStatusList
                rows={readback.supportMatrix.map((row) => ({
                  id: row.surface,
                  label: row.label,
                  state: row.state,
                  description: `Route readback: ${row.routeReadbackStatus}. ${row.nextAction}`,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Unsupported here</CardTitle>
              <CardDescription>Unavailable capabilities are explicit so builders do not infer authority.</CardDescription>
            </CardHeader>
            <CardContent>
              <AeOperatorStatusList
                rows={readback.unsupportedCapabilities.map((capability) => ({
                  id: capability.label,
                  label: capability.label,
                  state: capability.state,
                  description: capability.reason,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gated exclusions</CardTitle>
              <CardDescription>Deferred surfaces are not part of the shipped read-only product.</CardDescription>
            </CardHeader>
            <CardContent>
              <AeOperatorStatusList
                rows={readback.gatedExclusions.map((exclusion) => ({
                  id: exclusion.surface,
                  label: exclusion.label,
                  state: exclusion.state,
                  description: exclusion.reason,
                }))}
              />
            </CardContent>
          </Card>
        </aside>
      </section>
    </AeOperatorShell>
  )
}
