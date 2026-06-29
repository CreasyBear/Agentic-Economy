import { createFileRoute } from '@tanstack/react-router'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
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
    <AePublicShell>
      <AePageHeader
        eyebrow={readback.copy.eyebrow}
        title={readback.copy.title}
        description={readback.copy.description}
        actions={
          <div className="flex flex-wrap gap-2">
            {readback.artifacts.map((artifact) => (
              <Button key={artifact.kind} asChild variant="outline" size="sm">
                <a href={artifact.route}>{artifact.downloadLabel}</a>
              </Button>
            ))}
          </div>
        }
      />

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:grid-cols-[minmax(0,1fr)_320px] md:px-6">
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
                <div className="grid gap-4">
                  {readback.publicFacts.map((fact) => (
                    <article key={fact.slug} className="rounded-lg border bg-muted/20 p-4">
                      <h2 className="font-heading text-lg font-semibold">{fact.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {fact.category} in {fact.suburb}, {fact.stateTerritory}
                      </p>
                      <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                        <div>
                          <dt className="font-medium">Discovery</dt>
                          <dd className="text-muted-foreground">{fact.discoveryStatus}</dd>
                        </div>
                        <div>
                          <dt className="font-medium">Services</dt>
                          <dd className="text-muted-foreground">{fact.serviceCount}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
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
              <div className="grid gap-3">
                {readback.routeHealth.map((health) => (
                  <div key={health.route} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{health.label}</span>
                      <span className="text-muted-foreground">{health.status}</span>
                    </div>
                    <p className="mt-1 break-all text-xs text-muted-foreground">{health.route}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      HTTP {health.httpStatus ?? 'n/a'} · checked {health.checkedAt} · schema {health.schemaVersion ?? 'n/a'} · cache{' '}
                      {health.cacheControl ?? 'n/a'}
                    </p>
                    {health.errorCode === undefined ? null : (
                      <p className="mt-1 text-xs text-muted-foreground">Code: {health.errorCode}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card id="support-matrix">
            <CardHeader>
              <CardTitle>Discovery support matrix</CardTitle>
              <CardDescription>Shipped rows are limited to route-tested public readbacks.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {readback.supportMatrix.map((row) => (
                  <div key={row.surface} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{row.label}</span>
                      <span className="text-muted-foreground">{row.state}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Route readback: {row.routeReadbackStatus}</p>
                    <p className="mt-1 text-muted-foreground">{row.nextAction}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Unsupported here</CardTitle>
              <CardDescription>Unavailable capabilities are explicit so builders do not infer authority.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {readback.unsupportedCapabilities.map((capability) => (
                  <div key={capability.label} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{capability.label}</span>
                      <span className="text-muted-foreground">{capability.state}</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{capability.reason}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Phase 2 inquiry status</CardTitle>
              <CardDescription>{readback.p2InquiryAvailability.publicReason}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="font-medium">State</dt>
                  <dd className="text-muted-foreground">{readback.p2InquiryAvailability.state}</dd>
                </div>
                <div>
                  <dt className="font-medium">Source</dt>
                  <dd className="break-all text-muted-foreground">{readback.p2InquiryAvailability.source}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gated exclusions</CardTitle>
              <CardDescription>Deferred surfaces are not part of the shipped read-only product.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {readback.gatedExclusions.map((exclusion) => (
                  <div key={exclusion.surface} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{exclusion.label}</span>
                      <span className="text-muted-foreground">{exclusion.state}</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{exclusion.reason}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </aside>
      </section>
    </AePublicShell>
  )
}
