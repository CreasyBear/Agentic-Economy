import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePageSkeleton, AePageState } from '@/components/ae/layout/AePageState'
import { AeToolInspector } from '@/components/ae/market/tool-detail'
import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import {
  FALLBACK_MARKET_RETURN_CONTEXT,
  readMarketReturnContext,
  toMarketReturnNavigation,
  type MarketReturnContext,
} from '@/components/ae/market/market-return-context'
import { Button } from '@/components/ui/button'
import {
  isPublicToolRef,
  type PublicToolDescriptor,
} from '@/modules/capability-supply/public'
import type { MarketListingEvidenceProjection } from '@/modules/market/listing-evidence'
import { readToolListingEvidence } from '@/modules/market/server'
import { readX402PendingResource, type X402DirectoryResolution } from '@/modules/market/x402-directory'
import { prepareX402DirectoryResourceServer } from '@/modules/market/x402-directory.functions'
import {
  readPublicToolDetailRouteServer,
  type PublicToolDetailRouteResult,
} from '@/modules/registry/tool-detail-route.functions'

export type ToolDetailPresentationResult =
  | PublicToolDetailRouteResult
  | Readonly<{ kind: 'invalid_ref'; toolRef: string }>

export function validateToolDetailSearch(
  search: Record<string, unknown>,
): Readonly<{ from?: MarketReturnContext }> {
  const from = readMarketReturnContext(search.from)
  return from === undefined ? {} : { from }
}

export const Route = createFileRoute('/tools/$toolRef')({
  validateSearch: validateToolDetailSearch,
  loader: async ({ params }) => {
    const pendingResource = readX402PendingResource(params.toolRef)
    let toolRef: string
    if (pendingResource !== undefined) {
      // A catalogue entry that has not yet been admitted as a Tool. Resolve
      // it the same way the retired Tool detail dialog did, then continue
      // exactly like a direct toolRef visit.
      const resolution = await prepareX402DirectoryResourceServer({ data: { resource: pendingResource } })
        .catch((): X402DirectoryResolution => ({ kind: 'unavailable', reason: 'source_unavailable' }))
      if (resolution.kind !== 'ready') {
        return {
          result: { kind: 'source_unavailable' as const, toolRef: params.toolRef },
          evidence: undefined,
        }
      }
      toolRef = resolution.toolRef
    } else if (isPublicToolRef(params.toolRef)) {
      toolRef = params.toolRef
    } else {
      return {
        result: { kind: 'invalid_ref' as const, toolRef: params.toolRef },
        evidence: undefined,
      }
    }
    const result = await readPublicToolDetailRouteServer({ data: { toolRef } })
      .catch((): PublicToolDetailRouteResult => ({ kind: 'source_unavailable', toolRef }))
    const evidence = result.kind === 'found'
      ? await readToolListingEvidence(result.tool)
      : undefined
    return {
      result,
      evidence,
    }
  },
  head: ({ loaderData }) => {
    if (loaderData?.result.kind !== 'found') {
      return { meta: [
        { title: 'Tool unavailable | Agentic Economy' },
        { name: 'robots', content: 'noindex' },
      ] }
    }
    return { meta: [
      { title: `${loaderData.result.tool.offering.label} | Agentic Economy` },
      { name: 'description', content: loaderData.result.tool.summary },
    ] }
  },
  pendingComponent: ToolDetailPending,
  errorComponent: ToolDetailError,
  component: ToolDetailRoute,
})

function ToolDetailRoute() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  return (
    <PublicToolDetail
      result={data.result}
      {...(data.evidence === undefined ? {} : { evidence: data.evidence })}
      {...(search.from === undefined ? {} : { returnTo: search.from })}
    />
  )
}

export function PublicToolDetail({
  result,
  evidence,
  returnTo = FALLBACK_MARKET_RETURN_CONTEXT,
}: Readonly<{
  result: ToolDetailPresentationResult
  evidence?: MarketListingEvidenceProjection
  returnTo?: MarketReturnContext
}>) {
  if (result.kind !== 'found') return <ToolUnavailable result={result} returnTo={returnTo} />
  return (
    <CurrentToolDetail
      tool={result.tool}
      {...(evidence === undefined ? {} : { evidence })}
      returnTo={returnTo}
    />
  )
}

function CurrentToolDetail({
  tool,
  evidence,
  returnTo,
}: Readonly<{
  tool: PublicToolDescriptor
  evidence?: MarketListingEvidenceProjection
  returnTo: MarketReturnContext
}>) {
  const returnNavigation = toMarketReturnNavigation(returnTo)
  return (
    <AePublicPage
      kind="workspace"
      title={tool.offering.label}
      description={`${tool.business.name} · ${tool.contract.capabilityId}`}
      actions={
        <Button asChild variant="ghost" className="min-h-touch">
          <Link
            to="/market"
            search={returnNavigation.search}
            {...(returnNavigation.hash === undefined ? {} : { hash: returnNavigation.hash })}
          >
            <ArrowLeftIcon aria-hidden="true" />
            {marketReturnLabel(returnTo, 'Catalog')}
          </Link>
        </Button>
      }
    >
      <AeToolInspector
        tool={tool}
        {...(evidence === undefined ? {} : { evidence })}
        variant="full"
      />
    </AePublicPage>
  )
}

function ToolUnavailable({
  result,
  returnTo = FALLBACK_MARKET_RETURN_CONTEXT,
}: Readonly<{
  result: Exclude<ToolDetailPresentationResult, { kind: 'found' }>
  returnTo?: MarketReturnContext
}>) {
  const returnNavigation = toMarketReturnNavigation(returnTo)
  const presentation = result.kind === 'invalid_ref'
    ? {
        tone: 'neutral' as const,
        title: 'This Tool reference is invalid',
        description: 'The reference is malformed, so AE did not query the catalog or show commercial facts and invocation steps.',
      }
    : result.kind === 'not_found'
    ? {
        tone: 'neutral' as const,
        title: 'This exact Tool is unknown or no longer current',
        description: 'AE has no current descriptor for this reference, so no historical terms, price, or invocation steps are shown.',
      }
    : result.kind === 'source_unavailable'
      ? {
          tone: 'warning' as const,
          title: 'Tool details are unavailable',
          description: 'AE cannot verify the current descriptor right now, so no commercial facts or invocation steps are shown.',
        }
      : {
          tone: 'warning' as const,
          title: 'This Tool is not currently available',
          description: `${REASON_COPY[result.reason] ?? REASON_COPY_FALLBACK} No commercial facts or Call steps are shown.`,
        }
  return (
    <AePageState
      tone={presentation.tone}
      title={presentation.title}
      description={presentation.description}
      action={
        <Button asChild className="min-h-touch">
          <Link
            to="/market"
            search={returnNavigation.search}
            {...(returnNavigation.hash === undefined ? {} : { hash: returnNavigation.hash })}
          >
            {marketReturnLabel(returnTo, 'Browse current Tools')}
          </Link>
        </Button>
      }
    />
  )
}

function ToolDetailPending() {
  return <AePageSkeleton title="Checking the current capability…" description="Checking the current capability…" shape="detail" />
}

function ToolDetailError() {
  const search = Route.useSearch()
  return (
    <ToolUnavailable
      result={{ kind: 'source_unavailable', toolRef: 'Requested reference' }}
      {...(search.from === undefined ? {} : { returnTo: search.from })}
    />
  )
}

function marketReturnLabel(
  returnTo: MarketReturnContext,
  fallback: string,
): string {
  const url = new URL(returnTo, 'https://agentic-economy.invalid')
  if (url.searchParams.has('compare')) return 'Back to comparison'
  return returnTo === FALLBACK_MARKET_RETURN_CONTEXT ? fallback : 'Back to results'
}
