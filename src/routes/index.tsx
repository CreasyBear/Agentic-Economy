import { createServerFn } from '@tanstack/react-start'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { AGENT_DOOR, BUSINESS_DOOR, HOME } from '@/content/brand-copy'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeServiceList } from '@/components/ae/services/AeServiceList'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { ServicesError, ServicesLoading } from '@/components/ae/home/HomeRouteStates'
import { RootWorkTreeLoop } from '@/components/ae/home/RootWorkTreeLoop'
import { projectConsumerPlan, type ConsumerPlanResult } from '@/modules/customer-request/application/public'
import { customerRequestPlanPreviewAction } from '@/modules/customer-request/plan-preview.actions'
import type { PublicServicesSearchPage, ServiceDto } from '@/modules/registry/public'
import { toConsumerSupplyOption } from '@/modules/registry/public'
import { registryServicesSearchAction } from '@/modules/registry/registry.actions'
import type { WebDiscoveryClaim } from '@/modules/storefront/public'
import { webDiscoverAction } from '@/modules/storefront/storefront.actions'
import {
  readRootWorkTreeServer,
  type RootWorkTreeReadback,
} from '@/modules/work-tree/human-root.functions'

const rootSearchSchema = z.object({
  q: z.string().max(120).optional().catch(undefined),
  project: z.string().max(200).optional().catch(undefined),
})


export type RootSearchParams = {
  q?: string | undefined
  project?: string | undefined
}

export type ServicesRouteReadback = Readonly<{
  services: readonly ServiceDto[]
  plan: ConsumerPlanResult
  canonicalBaseUrl?: string
  importedClaims?: readonly WebDiscoveryClaim[]
}>

/**
 * The two shapes `/` can render once an ask exists. The WorkTree branch carries
 * nothing but a source readback: the durable project reference in the URL is
 * the only state that survives a reload, and a browser thread is never identity.
 */
export type RootRouteReadback =
  | Readonly<{ kind: 'work-tree'; readback: RootWorkTreeReadback }>
  | Readonly<{ kind: 'services'; page: ServicesRouteReadback }>

export type RootRouteDeps = Readonly<{
  readWorkTree: (projectId: string) => Promise<RootWorkTreeReadback>
  loadServices: (search: RootSearchParams) => Promise<ServicesRouteReadback | undefined>
}>

export const defaultRootRouteDeps: RootRouteDeps = {
  readWorkTree: (projectId) => readRootWorkTreeServer({ data: { projectId } }),
  loadServices: (search) => readServicesPageServer({ data: search }),
}

export const readServicesPageServer = createServerFn()
  .validator((data) => z.object({ q: z.string().max(120).optional().catch(undefined) }).parse(data))
  .handler(async ({ data }) => {
    const readback = await loadOneViewReadback(data)
    if (readback === undefined) return undefined
    const canonicalBaseUrl = await readCanonicalBaseUrlServer()
    return { ...readback, canonicalBaseUrl }
  })

/** Root route readback: explicit project references read the source-backed tree. */
export async function loadRootRoute(
  search: RootSearchParams,
  deps: RootRouteDeps = defaultRootRouteDeps,
): Promise<RootRouteReadback | undefined> {
  const projectId = search.project?.trim() ?? ''
  if (projectId.length > 0) {
    return { kind: 'work-tree', readback: await deps.readWorkTree(projectId) }
  }

  const query = search.q?.trim().slice(0, 120) ?? ''
  if (query.length === 0) return undefined


  const page = await deps.loadServices({ q: query })
  return page === undefined ? undefined : { kind: 'services', page }
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): RootSearchParams => {
    const parsed = rootSearchSchema.parse(search)
    const query = parsed.q?.trim().slice(0, 120) ?? ''
    const project = parsed.project?.trim() ?? ''
    return {
      ...(query.length === 0 ? {} : { q: query }),
      ...(project.length === 0 ? {} : { project }),
    }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => loadRootRoute(deps),
  pendingComponent: ServicesLoading,
  errorComponent: ServicesError,
  head: () => ({
    meta: [
      { title: HOME.metaTitle },
      { name: 'description', content: HOME.metaDescription },
    ],
  }),
  component: ServicesRoute,
})

export async function loadServicesRouteReadback(search: RootSearchParams): Promise<PublicServicesSearchPage | undefined> {
  const query = search.q?.trim().slice(0, 120) ?? ''
  if (query.length === 0) return undefined

  return registryServicesSearchAction.run({
    data: registryServicesSearchAction.schema.parse({ query, limit: 10 }),
    context: { caller: 'ui' },
  })
}

export async function loadOneViewReadback(search: RootSearchParams): Promise<ServicesRouteReadback | undefined> {
  const query = search.q?.trim().slice(0, 120) ?? ''
  if (query.length === 0) return undefined
  const servicePagePromise = loadServicesRouteReadback(search)
  const previewPromise = customerRequestPlanPreviewAction.run({
    data: customerRequestPlanPreviewAction.schema.parse({ customerJob: query, network: 'ae:public' }),
    context: { caller: 'ui' },
  }).catch(() => ({
    kind: 'unavailable' as const,
    reason: 'preview_unavailable' as const,
    destination: { label: query, request: query },
  }))
  const [servicePage, preview] = await Promise.all([servicePagePromise, previewPromise])
  if (servicePage === undefined) return undefined
  const importedClaimsResult = servicePage.services.length === 0
    ? await webDiscoverAction.run({
        data: webDiscoverAction.schema.parse({ query }),
        context: { caller: 'ui' },
      }).catch(() => undefined)
    : undefined
  const importedClaims = importedClaimsResult?.kind === 'found' ? importedClaimsResult.claims : undefined
  return {
    services: servicePage.services,
    plan: projectConsumerPlan(preview, servicePage.services.map(toConsumerSupplyOption)),
    ...(importedClaims === undefined ? {} : { importedClaims }),
  }
}

function ServicesRoute() {
  const { q, project } = Route.useSearch()
  const data = Route.useLoaderData()
  const hasAnswer = q !== undefined || project !== undefined
  const page = data?.kind === 'services' ? data.page : undefined
  const canonicalBaseUrl = page?.canonicalBaseUrl ?? (typeof window === 'undefined' ? undefined : window.location.origin)

  return (
    <AePublicShell>
      <div className="grid w-full gap-12 px-4 py-16 sm:px-6 md:py-24">
        <section className="mx-auto grid w-full max-w-3xl justify-items-center gap-8 text-center">
          <h1
            className={hasAnswer
              ? 'max-w-3xl text-4xl leading-tight tracking-tight md:text-5xl'
              : 'max-w-4xl text-5xl leading-tight tracking-tight md:text-7xl'}
          >
            {HOME.heroHeading}
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            {HOME.heroSubhead}
          </p>

          <Card className="w-full border-0 bg-card p-6 shadow-med">
            <form key={q ?? ''} action="/" method="get" role="search" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Field className="gap-2 text-left">
                <FieldLabel htmlFor="service-search" className="text-sm font-semibold text-foreground">
                  What do you need done?
                </FieldLabel>
                <Input
                  id="service-search"
                  name="q"
                  type="search"
                  defaultValue={q ?? ''}
                  placeholder="Get this contract reviewed by Friday"
                  autoComplete="off"
                  className="h-14 border-border bg-card px-4 py-3 text-base text-foreground max-sm:h-14 md:text-base"
                />
              </Field>
              <Button type="submit" variant="secondary" size="lg" className="min-h-14 w-full sm:w-auto">Find my options</Button>
            </form>
          </Card>

          {hasAnswer ? null : (
            <nav aria-label="Example asks" className="flex flex-wrap justify-center gap-2">
              {HOME.exampleAsks.map((ask) => (
                <Link
                  key={ask}
                  to="/"
                  search={{ q: ask }}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                >
                  {ask}
                </Link>
              ))}
            </nav>
          )}

          {hasAnswer ? null : (
            <div className="grid w-full gap-3 text-left sm:grid-cols-2">
              {[AGENT_DOOR, BUSINESS_DOOR].map((door) => (
                <Card key={door.href} className="grid gap-1 border border-border bg-card p-5">
                  <p className="block font-semibold text-foreground">{door.heading}</p>
                  <p className="block text-sm text-muted-foreground">
                    {door.body}
                  </p>
                  <Link to={door.href} className="text-sm font-medium text-foreground underline underline-offset-4 justify-self-start">
                    {door.cta}
                  </Link>
                </Card>
              ))}
            </div>
          )}

          {data?.kind === 'work-tree' ? (
            <RootWorkTreeLoop readback={data.readback} />
          ) : q === undefined ? null : (
            <div className="grid gap-6">
              <AeServiceList
                services={page?.services ?? []}
                query={q.trim()}
                {...(page?.plan === undefined ? {} : { plan: page.plan })}
                {...(page?.importedClaims === undefined ? {} : { importedClaims: page.importedClaims })}
                {...(canonicalBaseUrl === undefined ? {} : { canonicalBaseUrl })}
              />
              {page?.plan?.kind === 'plan' || (page?.services?.length ?? 0) === 0 || canonicalBaseUrl === undefined ? null : (
                <AeAssistantInstallFunnel canonicalBaseUrl={canonicalBaseUrl} />
              )}
            </div>
          )}
        </section>
      </div>
    </AePublicShell>
  )
}

