import { createFileRoute } from '@tanstack/react-router'

import { Button } from '@astryxdesign/core/Button'
import { Item } from '@astryxdesign/core/Item'
import { List } from '@astryxdesign/core/List'
import { AeOperatorStatusList } from '@/components/ae/operator/AeOperatorStatusList'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Card } from '@astryxdesign/core/Card'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import type { DeveloperDiscoveryRouteReadback } from '@/modules/discovery/developer-discovery'

export const Route = createFileRoute('/developers/discovery')({
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
      operatorRole="developer"
      eyebrow={readback.copy.eyebrow}
      title={readback.copy.title}
      description={readback.copy.description}
      currentPath="/developers/discovery"
      mainContentId="main-content"
      actions={
        <div className="flex flex-wrap gap-2">
          {readback.artifacts.map((artifact) => (
            <Button key={artifact.kind} href={artifact.route} variant="secondary" size="sm" label={artifact.downloadLabel} />
          ))}
        </div>
      }
    >
      <section className="grid w-full gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-6">
          <Card padding={5}>
            <div className="grid gap-1.5">
              <div className="text-lg font-semibold text-primary">Source-owned readback</div>
              <div className="text-sm leading-6 text-secondary">{readback.copy.readOnlyNotice}</div>
            </div>
            <div className="mt-4 grid gap-4">
              <dl className="grid gap-3 text-sm md:grid-cols-3">
                <div>
                  <dt className="font-medium">Freshness</dt>
                  <dd className="text-secondary">{readback.freshness.label}</dd>
                </div>
                <div>
                  <dt className="font-medium">Published catalogs</dt>
                  <dd className="text-secondary">{readback.catalogCount}</dd>
                </div>
                <div>
                  <dt className="font-medium">Schema version</dt>
                  <dd className="text-secondary">{readback.schemaVersion}</dd>
                </div>
              </dl>
              <p className="text-sm text-secondary">{readback.freshness.reason}</p>
            </div>
          </Card>

          <Card id="facts" padding={5}>
            <div className="grid gap-1.5">
              <div className="text-lg font-semibold text-primary">Current public catalog facts</div>
              <div className="text-sm leading-6 text-secondary">Rendered from the public catalog DTO, not private owner evidence.</div>
            </div>
            <div className="mt-4 grid gap-4">
              {readback.publicFacts.length === 0 ? (
                <p className="text-sm text-secondary">No source-owned public catalog facts are published.</p>
              ) : (
                <div className="overflow-auto rounded-md border border-border" style={{ maxHeight: 'min(60vh, 40rem)' }}>
                  <List density="spacious" className="gap-3 p-3">
                    {readback.publicFacts.map((fact) => (
                      <Item
                        key={fact.slug}
                        as="li"
                        density="compact"
                        label={<span className="font-heading text-base">{fact.name}</span>}
                        description={
                          <div className="grid gap-2">
                            <p>
                              {fact.category} in {fact.suburb}, {fact.stateTerritory}
                            </p>
                            <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                              <div>
                                <dt className="font-medium text-secondary">Discovery</dt>
                                <dd>{fact.discoveryStatus}</dd>
                              </div>
                              <div>
                                <dt className="font-medium text-secondary">Services</dt>
                                <dd data-numeric>{fact.serviceCount}</dd>
                              </div>
                            </dl>
                          </div>
                        }
                      />
                    ))}
                  </List>
                </div>
              )}
            </div>
          </Card>

          <Card id="schema" padding={5}>
            <div className="grid gap-1.5">
              <div className="text-lg font-semibold text-primary">Schema, examples, and fixture labels</div>
              <div className="text-sm leading-6 text-secondary">Each artifact is withheld or marked degraded from the same freshness readback.</div>
            </div>
            <div className="mt-4 grid gap-4">
              {readback.artifacts.map((artifact) => (
                <section key={artifact.kind} id={artifact.kind} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-heading text-base font-semibold">{artifact.label}</h2>
                    <span className="rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide">
                      {artifact.state}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-secondary">{artifact.reason}</p>
                  <p className="mt-2 text-sm font-medium">{artifact.downloadLabel}</p>
                  <p className="mt-2 text-xs text-secondary">
                    Fields: {artifact.schemaFields.slice(0, 8).join(', ')}
                  </p>
                </section>
              ))}
            </div>
          </Card>
        </div>

        <aside className="grid content-start gap-6">
          <Card padding={5}>
            <div className="grid gap-1.5">
              <div className="text-lg font-semibold text-primary">Read path status</div>
              <div className="text-sm leading-6 text-secondary">Public read paths only.</div>
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
                    <p className="text-xs text-secondary">
                      HTTP {health.httpStatus ?? 'n/a'} · checked {health.checkedAt} · schema {health.schemaVersion ?? 'n/a'} · cache{' '}
                      {health.cacheControl ?? 'n/a'}
                      {health.errorCode === undefined ? '' : ` · code ${health.errorCode}`}
                    </p>
                  ),
                }))}
              />
            </div>
          </Card>

          <Card id="support-matrix" padding={5}>
            <div className="grid gap-1.5">
              <div className="text-lg font-semibold text-primary">Discovery support matrix</div>
              <div className="text-sm leading-6 text-secondary">Shipped rows are limited to route-tested public readbacks.</div>
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

          <Card padding={5}>
            <div className="grid gap-1.5">
              <div className="text-lg font-semibold text-primary">Unsupported here</div>
              <div className="text-sm leading-6 text-secondary">Unavailable capabilities are explicit so builders do not infer authority.</div>
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

          <Card padding={5}>
            <div className="grid gap-1.5">
              <div className="text-lg font-semibold text-primary">Gated exclusions</div>
              <div className="text-sm leading-6 text-secondary">Deferred surfaces are not part of the shipped read-only product.</div>
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
