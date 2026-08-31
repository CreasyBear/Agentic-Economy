import { Link, createFileRoute } from '@tanstack/react-router'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePageSkeleton, AePageState } from '@/components/ae/layout/AePageState'
import { AeOperationInspector } from '@/components/ae/market/operation-detail'
import { operationLabel } from '@/components/ae/market/operation-detail/operation-inspector-model'
import { Button } from '@/components/ui/button'
import { listAgentAccessKeysServer } from '@/modules/agent-access/agent-access.functions'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'
import {
  readPublicOperationDetailRouteServer,
  type PublicOperationDetailRouteResult,
} from '@/modules/registry/operation-detail-route.functions'

export const Route = createFileRoute('/operations/$operationRef')({
  loader: async ({ params }) => {
    const [result, keys] = await Promise.all([
      readPublicOperationDetailRouteServer({ data: { operationRef: params.operationRef } })
        .catch((): PublicOperationDetailRouteResult => ({ kind: 'source_unavailable', operationRef: params.operationRef })),
      listAgentAccessKeysServer().catch(() => []),
    ])
    return {
      result,
      hasBuyerCredential: keys.some((key) => (
        !key.revoked
        && !key.expired
        && key.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)
      )),
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
  return (
    <PublicOperationDetail
      result={data.result}
      hasBuyerCredential={data.hasBuyerCredential}
    />
  )
}

export function PublicOperationDetail({
  result,
  hasBuyerCredential = false,
}: Readonly<{
  result: PublicOperationDetailRouteResult
  hasBuyerCredential?: boolean
}>) {
  if (result.kind !== 'found') return <OperationUnavailable result={result} />
  return (
    <CurrentOperationDetail
      operation={result.operation}
      hasBuyerCredential={hasBuyerCredential}
    />
  )
}

function CurrentOperationDetail({
  operation,
  hasBuyerCredential,
}: Readonly<{
  operation: PublicOperationDescriptor
  hasBuyerCredential: boolean
}>) {
  return (
    <AePublicPage
      kind="tool"
      eyebrow="Operation"
      title={operation.offering.label}
      description={operation.summary}
      actions={
        <Button asChild variant="ghost" className="min-h-touch">
          <Link to="/market" search={{ window: '30d' }} hash="operations">Catalog</Link>
        </Button>
      }
      meta={operationLabel(operation.availability.posture)}
    >
      <AeOperationInspector
        operation={operation}
        hasBuyerCredential={hasBuyerCredential}
        variant="full"
      />
    </AePublicPage>
  )
}

function OperationUnavailable({ result }: Readonly<{ result: Exclude<PublicOperationDetailRouteResult, { kind: 'found' }> }>) {
  const presentation = result.kind === 'not_found'
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
          <Link to="/market" search={{ window: '30d' }} hash="operations">
            Browse current Operations
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
  return <OperationUnavailable result={{ kind: 'source_unavailable', operationRef: 'Requested reference' }} />
}
