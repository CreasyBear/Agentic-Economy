import { createFileRoute } from '@tanstack/react-router'
import { CodeBlock } from '@/components/ai-elements/code-block'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeOperatorStatusList } from '@/components/ae/operator/AeOperatorStatusList'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import type { DeveloperDiscoveryRouteReadback } from '@/modules/discovery/developer-discovery'

export const Route = createFileRoute('/_operator/developers/discovery')({
  ...operatorRouteOptions,
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
      import('../api.discovery.schema'),
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
      operatorRole="developer"
      eyebrow={readback.copy.eyebrow}
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
      <section className="grid w-full gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-6">
          <Card className="p-5">
            <div className="grid gap-1.5">
              <h2 className="text-lg font-semibold text-foreground">Source-owned readback</h2>
              <div className="text-sm leading-6 text-muted-foreground">{readback.copy.readOnlyNotice}</div>
            </div>
            <div className="mt-4 grid gap-4">
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
              <p className="text-sm text-muted-foreground">{readback.freshness.reason}</p>
            </div>
          </Card>

          <Card id="facts" className="p-5">
            <div className="grid gap-1.5">
              <h2 className="text-lg font-semibold text-foreground">Current public catalog facts</h2>
              <div className="text-sm leading-6 text-muted-foreground">Rendered from the public catalog DTO, not private owner evidence.</div>
            </div>
            <div className="mt-4 grid gap-4">
              {readback.publicFacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No source-owned public catalog facts are published.</p>
              ) : (
                <div className="overflow-auto rounded-md border border-border" style={{ maxHeight: 'min(60vh, 40rem)' }}>
                  <ul className="grid gap-3 p-3">
                    {readback.publicFacts.map((fact) => (
                      <li key={fact.slug} className="grid gap-2 rounded-md border border-border p-3">
                        <p className="font-heading text-base">{fact.name}</p>
                        <div className="grid gap-2">
                          <p>{fact.category} in {fact.suburb}, {fact.stateTerritory}</p>
                          <dl className="grid gap-2 text-xs sm:grid-cols-2">
                            <div>
                              <dt className="font-medium text-muted-foreground">Disposition</dt>
                              <dd>{fact.disposition}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-muted-foreground">Offerings</dt>
                              <dd data-numeric>{fact.offeringCount}</dd>
                            </div>
                          </dl>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>

          <Card id="schema" className="p-5">
            <div className="grid gap-1.5">
              <h2 className="text-lg font-semibold text-foreground">Schema, examples, and fixture labels</h2>
              <div className="text-sm leading-6 text-muted-foreground">Each artifact is withheld or marked degraded from the same freshness readback.</div>
            </div>
            <div className="mt-4 grid gap-4">
              {readback.artifacts.map((artifact) => (
                <section key={artifact.kind} id={artifact.kind} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-heading text-base font-semibold">{artifact.label}</h3>
                    <Badge variant={developerDiscoveryStateVariant(artifact.state)}>{`${artifact.state.charAt(0).toUpperCase()}${artifact.state.slice(1)}`}</Badge>
                  </div>
                  <CodeBlock
                    code={JSON.stringify({ route: artifact.route, fields: artifact.schemaFields.slice(0, 8) }, null, 2)}
                    language="json"
                    className="mt-3 min-w-0 [&_code]:break-all [&_pre]:whitespace-pre-wrap"
                  />
                </section>
              ))}
            </div>
          </Card>
        </div>

        <aside className="grid content-start gap-6">
          <Card className="p-5">
            <div className="grid gap-1.5">
              <h2 className="text-lg font-semibold text-foreground">Read path status</h2>
              <div className="text-sm leading-6 text-muted-foreground">Public read paths only.</div>
            </div>
            <div className="mt-4">
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
            </div>
          </Card>

          <Card id="support-matrix" className="p-5">
            <div className="grid gap-1.5">
              <h2 className="text-lg font-semibold text-foreground">Discovery support matrix</h2>
              <div className="text-sm leading-6 text-muted-foreground">Shipped rows are limited to route-tested public readbacks.</div>
            </div>
            <div className="mt-4">
              <AeOperatorStatusList
                rows={readback.supportMatrix.map((row) => ({
                  id: row.surface,
                  label: row.label,
                  state: row.state,
                  description: `Route readback: ${row.routeReadbackStatus}. ${row.nextAction}`,
                }))}
              />
            </div>
          </Card>

          <Card className="p-5">
            <div className="grid gap-1.5">
              <h2 className="text-lg font-semibold text-foreground">Unsupported here</h2>
              <div className="text-sm leading-6 text-muted-foreground">Unavailable capabilities are explicit so builders do not infer authority.</div>
            </div>
            <div className="mt-4">
              <AeOperatorStatusList
                rows={readback.unsupportedCapabilities.map((capability) => ({
                  id: capability.label,
                  label: capability.label,
                  state: capability.state,
                  description: capability.reason,
                }))}
              />
            </div>
          </Card>

          <Card className="p-5">
            <div className="grid gap-1.5">
              <h2 className="text-lg font-semibold text-foreground">Gated exclusions</h2>
              <div className="text-sm leading-6 text-muted-foreground">Deferred surfaces are not part of the shipped read-only product.</div>
            </div>
            <div className="mt-4">
              <AeOperatorStatusList
                rows={readback.gatedExclusions.map((exclusion) => ({
                  id: exclusion.surface,
                  label: exclusion.label,
                  state: exclusion.state,
                  description: exclusion.reason,
                }))}
              />
            </div>
          </Card>
        </aside>
      </section>
    </AeOperatorShell>
  )
}

function developerDiscoveryStateVariant(state: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (state === 'available') return 'default'
  if (state === 'degraded') return 'secondary'
  if (state === 'unavailable') return 'destructive'
  return 'outline'
}
