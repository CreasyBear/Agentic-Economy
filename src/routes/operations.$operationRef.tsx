import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePageSkeleton, AePageState } from '@/components/ae/layout/AePageState'
import { AeOperationInspector } from '@/components/ae/market/operation-detail'
import { operationLabel } from '@/components/ae/market/operation-detail/operation-inspector-model'
import {
  FALLBACK_MARKET_RETURN_CONTEXT,
  readMarketReturnContext,
  toMarketReturnNavigation,
  type MarketReturnContext,
} from '@/components/ae/market/market-return-context'
import { Button } from '@/components/ui/button'
import {
  isPublicOperationRef,
  type PublicOperationDescriptor,
} from '@/modules/capability-supply/public'
import type { MarketListingEvidenceProjection } from '@/modules/market/listing-evidence'
import { readOperationListingEvidence } from '@/modules/market/server'
import {
  readPublicOperationDetailRouteServer,
  type PublicOperationDetailRouteResult,
} from '@/modules/registry/operation-detail-route.functions'

export type OperationDetailPresentationResult =
  | PublicOperationDetailRouteResult
  | Readonly<{ kind: 'invalid_ref'; operationRef: string }>

export function validateOperationDetailSearch(
  search: Record<string, unknown>,
): Readonly<{ from?: MarketReturnContext }> {
  const from = readMarketReturnContext(search.from)
  return from === undefined ? {} : { from }
}

export const Route = createFileRoute('/operations/$operationRef')({
  validateSearch: validateOperationDetailSearch,
  loader: async ({ params }) => {
    if (!isPublicOperationRef(params.operationRef)) {
      return {
        result: { kind: 'invalid_ref' as const, operationRef: params.operationRef },
        evidence: undefined,
      }
    }
    const result = await readPublicOperationDetailRouteServer({ data: { operationRef: params.operationRef } })
      .catch((): PublicOperationDetailRouteResult => ({ kind: 'source_unavailable', operationRef: params.operationRef }))
    const evidence = result.kind === 'found'
      ? await readOperationListingEvidence(result.operation)
      : undefined
    return {
      result,
      evidence,
    }
  },
  head: ({ loaderData }) => {
    if (loaderData?.result.kind !== 'found') {
      return { meta: [
        { title: 'Operation unavailable | Agentic Economy' },
        { name: 'robots', content: 'noindex' },
      ] }
    }
    return { meta: [
      { title: `${loaderData.result.operation.offering.label} | Agentic Economy` },
      { name: 'description', content: loaderData.result.operation.summary },
    ] }
  },
  pendingComponent: OperationDetailPending,
  errorComponent: OperationDetailError,
  component: OperationDetailRoute,
})

function OperationDetailRoute() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  return (
    <PublicOperationDetail
      result={data.result}
      {...(data.evidence === undefined ? {} : { evidence: data.evidence })}
      {...(search.from === undefined ? {} : { returnTo: search.from })}
    />
  )
}

export function PublicOperationDetail({
  result,
  evidence,
  returnTo = FALLBACK_MARKET_RETURN_CONTEXT,
}: Readonly<{
  result: OperationDetailPresentationResult
  evidence?: MarketListingEvidenceProjection
  returnTo?: MarketReturnContext
}>) {
  if (result.kind !== 'found') return <OperationUnavailable result={result} returnTo={returnTo} />
  return (
    <CurrentOperationDetail
      operation={result.operation}
      {...(evidence === undefined ? {} : { evidence })}
      returnTo={returnTo}
    />
  )
}

function CurrentOperationDetail({
  operation,
  evidence,
  returnTo,
}: Readonly<{
  operation: PublicOperationDescriptor
  evidence?: MarketListingEvidenceProjection
  returnTo: MarketReturnContext
}>) {
  const returnNavigation = toMarketReturnNavigation(returnTo)
  return (
    <AePublicPage
      kind="workspace"
      title={operation.offering.label}
      description={`${operation.business.name} · ${operation.contract.capabilityId}`}
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
      <AeOperationInspector
        operation={operation}
        {...(evidence === undefined ? {} : { evidence })}
        variant="full"
      />
    </AePublicPage>
  )
}

function OperationUnavailable({
  result,
  returnTo = FALLBACK_MARKET_RETURN_CONTEXT,
}: Readonly<{
  result: Exclude<OperationDetailPresentationResult, { kind: 'found' }>
  returnTo?: MarketReturnContext
}>) {
  const returnNavigation = toMarketReturnNavigation(returnTo)
  const presentation = result.kind === 'invalid_ref'
    ? {
        tone: 'neutral' as const,
        title: 'This Operation reference is invalid',
        description: 'The reference is malformed, so AE did not query the catalog or show commercial facts and invocation steps.',
      }
    : result.kind === 'not_found'
    ? {
        tone: 'neutral' as const,
        title: 'This exact Operation is unknown or no longer current',
        description: 'AE has no current descriptor for this reference, so no historical terms, price, or invocation steps are shown.',
      }
    : result.kind === 'source_unavailable'
      ? {
          tone: 'warning' as const,
          title: 'Operation details are unavailable',
          description: 'AE cannot verify the current descriptor right now, so no commercial facts or invocation steps are shown.',
        }
      : {
          tone: 'warning' as const,
          title: 'This Operation is not currently available',
          description: `AE reports ${operationLabel(result.reason)} for this exact reference. No commercial facts or invocation steps are shown.`,
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
            {marketReturnLabel(returnTo, 'Browse current Operations')}
          </Link>
        </Button>
      }
    />
  )
}

function OperationDetailPending() {
  return <AePageSkeleton title="Checking the current capability…" description="Checking the current capability…" shape="detail" />
}

function OperationDetailError() {
  const search = Route.useSearch()
  return (
    <OperationUnavailable
      result={{ kind: 'source_unavailable', operationRef: 'Requested reference' }}
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
