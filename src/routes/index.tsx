import { createServerFn } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { AGENT_DOOR, BUSINESS_DOOR, HOME } from '@/content/brand-copy'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeServiceList } from '@/components/ae/services/AeServiceList'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeInlineAnswerTurn } from '@/components/ae/chat/AeInlineAnswerTurn'
import {
  isDeterministicExactSearch,
  planAnswerTurn,
} from '@/modules/answer-thread/public'
import { projectConsumerPlan, type ConsumerPlanResult } from '@/modules/customer-request/application/public'
import { customerRequestPlanPreviewAction } from '@/modules/customer-request/plan-preview.actions'
import type { PublicServicesApiPage, ServiceDto } from '@/modules/registry/public'
import { toConsumerSupplyOption } from '@/modules/registry/public'
import { registryServicesSearchAction } from '@/modules/registry/registry.actions'
import type { WebDiscoveryClaim } from '@/modules/storefront/public'
import { webDiscoverAction } from '@/modules/storefront/storefront.actions'

const serviceSearchSchema = z.object({
  q: z.string().max(120).optional().catch(undefined),
})

type ServiceSearchParams = {
  q?: string | undefined
}
export type ServicesRouteReadback = Readonly<{
  services: readonly ServiceDto[]
  plan: ConsumerPlanResult
  canonicalBaseUrl?: string
  importedClaims?: readonly WebDiscoveryClaim[]
  engineDialogEnabled: boolean
  engineDialogQuery: boolean
}>

export const readServicesPageServer = createServerFn()
  .validator((data) => serviceSearchSchema.parse(data))
  .handler(async ({ data }) => {
    const readback = await loadOneViewReadback(data)
    if (readback === undefined) return undefined
    const canonicalBaseUrl = await readCanonicalBaseUrlServer()
    return { ...readback, canonicalBaseUrl }
  })

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): ServiceSearchParams => {
    const query = typeof search.q === 'string' ? search.q.trim().slice(0, 120) : ''
    return query.length === 0 ? {} : { q: query }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readServicesPageServer({ data: deps }),
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

export async function loadServicesRouteReadback(search: ServiceSearchParams): Promise<PublicServicesApiPage | undefined> {
  const query = search.q?.trim().slice(0, 120) ?? ''
  if (query.length === 0) return undefined

  return registryServicesSearchAction.run({
    data: registryServicesSearchAction.schema.parse({ query, limit: 10 }),
    context: { caller: 'ui' },
  })
}

export function shouldRenderEngineDialog(input: {
  query: string
  engineDialogEnabled: boolean
}): boolean {
  if (!input.engineDialogEnabled) return false
  const responsePlan = planAnswerTurn({
    query: input.query,
    priorTurnsCount: 0,
    searchContext: undefined,
  })
  return !isDeterministicExactSearch({
    query: input.query,
    priorTurnsCount: 0,
    searchContext: undefined,
  }, responsePlan)
}

export async function loadOneViewReadback(search: ServiceSearchParams): Promise<ServicesRouteReadback | undefined> {
  const query = search.q?.trim().slice(0, 120) ?? ''
  if (query.length === 0) return undefined
  const engineDialogEnabled = process.env.AE_ENGINE_PROPOSALS === 'true'
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
  const importedClaimsResult = !engineDialogEnabled && servicePage.services.length === 0
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
    engineDialogEnabled,
    engineDialogQuery: shouldRenderEngineDialog({ query, engineDialogEnabled }),
  }
}

function ServicesRoute() {
  const { q } = Route.useSearch()
  const page = Route.useLoaderData()
  const hasAnswer = q !== undefined
  const engineDialogActive = page?.engineDialogEnabled === true && page.engineDialogQuery
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
              <label htmlFor="service-search" className="grid gap-2 text-left">
                <span className="text-sm font-semibold text-foreground">What do you need done?</span>
                <input
                  id="service-search"
                  name="q"
                  type="search"
                  defaultValue={q ?? ''}
                  placeholder="Get this contract reviewed by Friday"
                  autoComplete="off"
                  className="min-h-14 w-full rounded-md border border-border bg-card px-4 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus-visible:outline-2 focus-visible:outline-offset-2"
                />
              </label>
              <Button type="submit" variant="secondary" size="lg" className="min-h-14 w-full sm:w-auto">Find my options</Button>
            </form>
          </Card>

          {hasAnswer ? null : (
            <nav aria-label="Example asks" className="flex flex-wrap justify-center gap-2">
              {HOME.exampleAsks.map((ask) => (
                <a
                  key={ask}
                  href={`/?q=${encodeURIComponent(ask)}`}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                >
                  {ask}
                </a>
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
                  <a href={door.href} className="text-sm font-medium text-foreground underline underline-offset-4 justify-self-start">
                    {door.cta}
                  </a>
                </Card>
              ))}
            </div>
          )}

          {q === undefined ? null : engineDialogActive ? (
            <AeInlineAnswerTurn
              query={q.trim()}
            />
          ) : (
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

function ServicesLoading() {
  return (
    <AePublicShell>
      <div className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-12 sm:px-6 lg:py-16" aria-busy="true">
        <Card className="border border-border bg-card p-5">
          <p role="status" className="text-muted-foreground">Finding businesses and comparing options…</p>
        </Card>
      </div>
    </AePublicShell>
  )
}

function ServicesError() {
  return (
    <AePublicShell>
      <div className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-12 sm:px-6 lg:py-16">
        <Card className="grid gap-3 border border-destructive/50 bg-card p-5" role="alert">
          <div className="grid gap-1">
            <p className="block font-semibold text-foreground">We couldn’t load your options</p>
            <p className="block text-muted-foreground">Try your ask again. The market is temporarily unavailable.</p>
          </div>
          <Button asChild variant="default" className="min-h-11 justify-self-start"><a href="/">Try another ask</a></Button>
        </Card>
      </div>
    </AePublicShell>
  )
}
