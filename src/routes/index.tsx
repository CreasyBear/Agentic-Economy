import { useCallback, useState } from 'react'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { AGENT_DOOR, BUSINESS_DOOR, HOME } from '@/content/brand-copy'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeServiceList } from '@/components/ae/services/AeServiceList'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeDecisionInbox, type AeDecisionInboxStatus } from '@/components/ae/work-tree/AeDecisionInbox'
import { AeWorkTreePanel } from '@/components/ae/work-tree/AeWorkTreePanel'
import { projectConsumerPlan, type ConsumerPlanResult } from '@/modules/customer-request/application/public'
import { customerRequestPlanPreviewAction } from '@/modules/customer-request/plan-preview.actions'
import type { PublicServicesSearchPage, ServiceDto } from '@/modules/registry/public'
import { toConsumerSupplyOption } from '@/modules/registry/public'
import { registryServicesSearchAction } from '@/modules/registry/registry.actions'
import type { WebDiscoveryClaim } from '@/modules/storefront/public'
import { webDiscoverAction } from '@/modules/storefront/storefront.actions'
import type { DecisionInboxExit, DecisionInboxExitKind, DecisionInboxItem } from '@/modules/work-tree/public'
import {
  claimRootWorkTreeServer,
  decideRootWorkTreeServer,
  isBasDevelopmentAsk,
  readRootWorkTreeServer,
  startRootWorkTreeServer,
  type RootWorkTreeReadback,
  type RootWorkTreeStart,
  type RootWorkTreeView,
  type WorkTreeDecisionReceipt,
} from '@/modules/work-tree/human-root.functions'

const rootSearchSchema = z.object({
  q: z.string().max(120).optional().catch(undefined),
  project: z.string().max(200).optional().catch(undefined),
  requestRef: z.string().max(300).optional().catch(undefined),
  revision: z.coerce.number().int().positive().optional().catch(undefined),
  routeGenerationRef: z.string().max(300).optional().catch(undefined),
  routeRef: z.string().max(300).optional().catch(undefined),
})

type CustomerRequestWorkTreeLineage = Readonly<{
  kind: 'customer_request'
  requestRef: string
  revision: number
  routeGenerationRef: string
  routeRef: string
}>

export type RootSearchParams = {
  q?: string | undefined
  project?: string | undefined
  requestRef?: string | undefined
  revision?: number | undefined
  routeGenerationRef?: string | undefined
  routeRef?: string | undefined
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
  startWorkTree: (outcome: string, lineage?: CustomerRequestWorkTreeLineage) => Promise<RootWorkTreeStart>
  readWorkTree: (projectId: string) => Promise<RootWorkTreeReadback>
  loadServices: (search: RootSearchParams) => Promise<ServicesRouteReadback | undefined>
  isWorkTreeAsk: (query: string) => boolean
}>

export const defaultRootRouteDeps: RootRouteDeps = {
  startWorkTree: (outcome, lineage) => startRootWorkTreeServer({
    data: { outcome, ...(lineage === undefined ? {} : { lineage }) },
  }),
  readWorkTree: (projectId) => readRootWorkTreeServer({ data: { projectId } }),
  loadServices: (search) => readServicesPageServer({ data: search }),
  isWorkTreeAsk: isBasDevelopmentAsk,
}

export const readServicesPageServer = createServerFn()
  .validator((data) => z.object({ q: z.string().max(120).optional().catch(undefined) }).parse(data))
  .handler(async ({ data }) => {
    const readback = await loadOneViewReadback(data)
    if (readback === undefined) return undefined
    const canonicalBaseUrl = await readCanonicalBaseUrlServer()
    return { ...readback, canonicalBaseUrl }
  })

/**
 * Submit path. A durable project exists before any elaboration runs, and the
 * person is moved onto the project reference immediately — so a refresh, a
 * closed tab, or a shared link all resume the same WorkTree rather than
 * re-running the ask.
 */
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

  if (deps.isWorkTreeAsk(query)) {
    const started = await deps.startWorkTree(query, customerRequestLineage(search))
    if (started.kind === 'refused') {
      return { kind: 'work-tree', readback: started }
    }
    throw redirect({ to: '/', search: { project: started.projectId } })
  }

  const page = await deps.loadServices({ q: query })
  return page === undefined ? undefined : { kind: 'services', page }
}

function customerRequestLineage(search: RootSearchParams): CustomerRequestWorkTreeLineage | undefined {
  const values = [search.requestRef, search.revision, search.routeGenerationRef, search.routeRef]
  if (values.every((value) => value === undefined)) return undefined
  const revision = search.revision
  if (
    typeof search.requestRef !== 'string'
    || typeof revision !== 'number'
    || !Number.isSafeInteger(revision)
    || typeof search.routeGenerationRef !== 'string'
    || typeof search.routeRef !== 'string'
    || search.requestRef.trim().length === 0
    || search.routeGenerationRef.trim().length === 0
    || search.routeRef.trim().length === 0
  ) {
    throw new Error('customer_request_work_tree_lineage_incomplete')
  }
  return {
    kind: 'customer_request',
    requestRef: search.requestRef,
    revision,
    routeGenerationRef: search.routeGenerationRef,
    routeRef: search.routeRef,
  }
}
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): RootSearchParams => {
    const parsed = rootSearchSchema.parse(search)
    const query = parsed.q?.trim().slice(0, 120) ?? ''
    const project = parsed.project?.trim() ?? ''
    return {
      ...(query.length === 0 ? {} : { q: query }),
      ...(project.length === 0 ? {} : { project }),
      ...(parsed.requestRef === undefined ? {} : { requestRef: parsed.requestRef }),
      ...(parsed.revision === undefined ? {} : { revision: parsed.revision }),
      ...(parsed.routeGenerationRef === undefined ? {} : { routeGenerationRef: parsed.routeGenerationRef }),
      ...(parsed.routeRef === undefined ? {} : { routeRef: parsed.routeRef }),
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

/**
 * The person-facing WorkTree loop. Component state holds only transient action
 * status (decision or claim) and never the tree, inbox or a receipt. Every
 * rendered fact is the loader's source readback, so a hard reload lands on the
 * same revision, the same inbox and the same receipt.
 */
function RootWorkTreeLoop({ readback }: Readonly<{ readback: RootWorkTreeReadback }>) {
  const router = useRouter()
  const [pendingExit, setPendingExit] = useState<DecisionInboxExitKind | undefined>(undefined)
  const [decided, setDecided] = useState<WorkTreeDecisionReceipt | undefined>(undefined)
  const view = readback.kind === 'ready' ? readback : undefined
  const claimWorkTree = useServerFn(claimRootWorkTreeServer)
  const [claimPending, setClaimPending] = useState(false)
  const [claimMessage, setClaimMessage] = useState<string | undefined>(undefined)

  const claim = useCallback(async () => {
    if (view === undefined) return
    setClaimPending(true)
    setClaimMessage(undefined)
    try {
      const result = await claimWorkTree({
        data: {
          projectId: view.projectId,
          idempotencyKey: `work-tree:claim:${view.projectId}`,
        },
      })
      if (result.kind === 'accepted' || result.kind === 'replayed') {
        await router.invalidate()
        return
      }
      setClaimMessage(result.code === 'authentication_required'
        ? 'Sign in first, then claim this plan.'
        : 'This plan could not be claimed. Nothing changed.')
    } catch {
      setClaimMessage('This plan could not be claimed. Nothing changed.')
    } finally {
      setClaimPending(false)
    }
  }, [claimWorkTree, router, view])

  const decide = useCallback(async (kind: DecisionInboxExitKind, item: DecisionInboxItem, exit: DecisionInboxExit) => {
    if (view === undefined) return
    setPendingExit(kind)
    try {
      const result = await decideRootWorkTreeServer({
        data: {
          projectId: view.projectId,
          nodeId: exit.nodeId,
          kind,
          // Fences come from the readback the person is looking at. A decision
          // taken against an older revision is refused by the source, not here.
          expectedGeneration: view.generation,
          expectedRevision: view.revision,
        },
      })
      setDecided(result.receipt)
      await router.invalidate()
    } catch {
      setDecided(unknownReceipt(view, exit.nodeId, kind, item))
    } finally {
      setPendingExit(undefined)
    }
  }, [router, view])

  if (view === undefined) {
    return (
      <Card className="grid w-full gap-2 border border-destructive/50 bg-card p-5 text-left" role="alert">
        <p className="font-semibold text-foreground">We can’t open that plan</p>
        <p className="text-muted-foreground">
          {readback.kind === 'refused' && readback.reason === 'forbidden'
            ? 'This plan belongs to someone else. Nothing has changed.'
            : 'That plan reference isn’t available. Nothing has changed.'}
        </p>
        <Button asChild variant="default" className="min-h-11 justify-self-start"><Link to="/">Start a new ask</Link></Button>
      </Card>
    )
  }

  const receipt = decided ?? view.receipts[view.receipts.length - 1]
  const canClaim = !view.events.some((event) => event.kind === 'claimed')
    && view.events.some((event) => event.kind === 'created' && event.actor?.source === 'browser_guest')

  return (
    <div className="grid w-full gap-8 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Revision {view.revision}</Badge>
        <Badge variant="outline">Generation {view.generation}</Badge>
        {view.mockLabel === undefined ? null : <Badge variant="outline">{view.mockLabel}</Badge>}
      </div>
      {canClaim ? (
        <Card className="grid gap-3 border border-border bg-card p-5">
          <div className="grid gap-1">
            <p className="font-semibold text-foreground">Keep this plan with your account</p>
            <p className="text-sm text-muted-foreground">
              Claim it after signing in so your owner session can reopen it and your assistant can work within the same project.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" disabled={claimPending} onClick={() => { void claim() }}>
              {claimPending ? 'Claiming…' : 'Claim this plan'}
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <a href={`/sign-in?redirect=${encodeURIComponent(`/?project=${view.projectId}`)}`}>Sign in first</a>
            </Button>
          </div>
          {claimMessage === undefined ? null : <p className="text-sm text-destructive" role="alert">{claimMessage}</p>}
        </Card>
      ) : null}

      <AeDecisionInbox
        projection={view.inbox}
        {...(pendingExit === undefined ? {} : { pendingExit })}
        {...(receipt === undefined ? {} : { status: receiptStatus(receipt) })}
        onLock={(item, exit) => { void decide('lock', item, exit) }}
        onAdjust={(item, exit) => { void decide('adjust', item, exit) }}
        onPark={(item, exit) => { void decide('park', item, exit) }}
      />

      <AeWorkTreePanel tree={view.tree} />
    </div>
  )
}

const DECISION_NOUN: Readonly<Record<DecisionInboxExitKind, string>> = {
  lock: 'Locked in',
  adjust: 'Adjusted',
  park: 'Parked',
}

const REFUSAL_COPY: Readonly<Record<string, string>> = {
  authentication_required: 'Sign in before deciding this WorkTree item.',
  stale_fence: 'This plan moved on while you were deciding. Nothing changed — read the current plan and choose again.',
  forbidden: 'You don’t have authority for that decision here. Nothing changed.',
  not_found: 'That decision isn’t ready to be taken yet. Nothing changed.',
  digest_mismatch: 'That decision didn’t match the one on record. Nothing changed.',
}

function receiptStatus(receipt: WorkTreeDecisionReceipt): AeDecisionInboxStatus {
  if (receipt.kind === 'refused') {
    if (!('decision' in receipt)) {
      return {
        tone: 'refusal',
        message: 'Authentication required.',
        detail: REFUSAL_COPY[receipt.code] ?? 'Sign in before deciding this WorkTree item.',
      }
    }
    return {
      tone: 'refusal',
      message: `${DECISION_NOUN[receipt.decision]} was refused.`,
      detail: REFUSAL_COPY[receipt.refusalCode ?? ''] ?? 'Nothing changed.',
    }
  }
  if (receipt.kind === 'unknown') {
    return {
      tone: 'unknown',
      message: `We can’t confirm ${DECISION_NOUN[receipt.decision].toLowerCase()} yet.`,
      detail: 'The plan below is the current record. Re-read it before deciding again.',
    }
  }
  return {
    tone: 'receipt',
    message: `${DECISION_NOUN[receipt.decision]} — ${receipt.disposition}.`,
    detail: `Receipt ${receipt.receiptId} at revision ${receipt.readback.revision}.`,
  }
}

function unknownReceipt(
  view: RootWorkTreeView,
  nodeId: string,
  kind: DecisionInboxExitKind,
  item: DecisionInboxItem,
): WorkTreeDecisionReceipt {
  return {
    kind: 'unknown',
    decision: kind,
    projectId: view.projectId,
    nodeId,
    receiptId: `unconfirmed:${item.treeId}:${nodeId}`,
    generation: view.generation,
    revision: view.revision,
    disposition: 'unchanged',
    occurredAt: Date.now(),
    readback: { projectId: view.projectId, revision: view.revision },
  }
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
          <Button asChild variant="default" className="min-h-11 justify-self-start"><Link to="/">Try another ask</Link></Button>
        </Card>
      </div>
    </AePublicShell>
  )
}
