import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePageSkeleton, AePageState } from '@/components/ae/layout/AePageState'
import { AeToolInspector } from '@/components/ae/market/tool-detail'
import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import { useMarketBackNavigation } from '@/components/ae/market/market-return-context'
import { Button } from '@/components/ui/button'
import {
  isPublicToolRef,
  type PublicToolDescriptor,
} from '@/modules/capability-supply/public'
import type { MarketListingEvidenceProjection } from '@/modules/market/listing-evidence'
import { readToolListingEvidence } from '@/modules/market/server'
import { toolDisplayTitle } from '@/modules/market/tool-view-model'
import type { X402DirectoryResolution } from '@/modules/market/x402-directory'
import { prepareX402DirectoryResourceServer } from '@/modules/market/x402-directory.functions'
import { readX402DirectoryCanonicalUrlForToolServer } from '@/modules/market/x402-directory-index.functions'
import {
  readPublicToolDetailRouteServer,
  type PublicToolDetailRouteResult,
} from '@/modules/registry/tool-detail-route.functions'

export type ToolDetailPresentationResult =
  | PublicToolDetailRouteResult
  | Readonly<{ kind: 'invalid_ref'; toolRef: string }>

export type ToolDetailPresentation = Readonly<{
  result: ToolDetailPresentationResult
  evidence?: MarketListingEvidenceProjection
}>

/**
 * Resolves a directory resource to its Tool detail, admitting it first when
 * `knownToolRef` (an already-attached join from convex/x402DirectoryIndex.ts)
 * is not present. Shared by the canonical `/tools/$providerHost/$slug` route
 * (which may already know the toolRef from that join) so both routes render
 * the identical Tool detail once resolved.
 */
export async function resolveDirectoryToolDetail(
  resource: string,
  knownToolRef?: string,
): Promise<ToolDetailPresentation> {
  let toolRef: string
  if (knownToolRef !== undefined) {
    toolRef = knownToolRef
  } else {
    const resolution = await prepareX402DirectoryResourceServer({ data: { resource } })
      .catch((): X402DirectoryResolution => ({ kind: 'unavailable', reason: 'source_unavailable' }))
    if (resolution.kind !== 'ready') {
      return { result: { kind: 'source_unavailable', toolRef: resource } }
    }
    toolRef = resolution.toolRef
  }
  const result = await readPublicToolDetailRouteServer({ data: { toolRef } })
    .catch((): PublicToolDetailRouteResult => ({ kind: 'source_unavailable', toolRef }))
  const evidence = result.kind === 'found' ? await readToolListingEvidence(result.tool) : undefined
  return { result, ...(evidence === undefined ? {} : { evidence }) }
}

export const Route = createFileRoute('/tools/$toolRef')({
  loader: async ({ params }) => {
    if (!isPublicToolRef(params.toolRef)) {
      return { result: { kind: 'invalid_ref' as const, toolRef: params.toolRef }, evidence: undefined }
    }
    const result = await readPublicToolDetailRouteServer({ data: { toolRef: params.toolRef } })
      .catch((): PublicToolDetailRouteResult => ({ kind: 'source_unavailable', toolRef: params.toolRef }))
    if (result.kind === 'found') {
      // Agents use `operation:v1:` refs; a human landing here from a shared
      // link gets the canonical, legible URL when this Tool has one.
      const canonical = await readX402DirectoryCanonicalUrlForToolServer({ data: { toolRef: params.toolRef } }).catch(() => null)
      if (canonical !== null) {
        throw redirect({ to: '/tools/$providerHost/$slug', params: canonical, replace: true })
      }
    }
    const evidence = result.kind === 'found' ? await readToolListingEvidence(result.tool) : undefined
    return { result, evidence }
  },
  head: ({ loaderData }) => {
    if (loaderData?.result.kind !== 'found') {
      return { meta: [
        { title: 'Tool unavailable | Agentic Economy' },
        { name: 'robots', content: 'noindex' },
      ] }
    }
    return { meta: [
      { title: `${toolDisplayTitle(loaderData.result.tool)} | Agentic Economy` },
      { name: 'description', content: loaderData.result.tool.summary },
    ] }
  },
  pendingComponent: ToolDetailPending,
  errorComponent: ToolDetailError,
  component: ToolDetailRoute,
})

function ToolDetailRoute() {
  const data = Route.useLoaderData()
  return (
    <PublicToolDetail
      result={data.result}
      {...(data.evidence === undefined ? {} : { evidence: data.evidence })}
    />
  )
}

export function PublicToolDetail({
  result,
  evidence,
}: ToolDetailPresentation) {
  if (result.kind !== 'found') return <ToolUnavailable result={result} />
  return (
    <CurrentToolDetail
      tool={result.tool}
      {...(evidence === undefined ? {} : { evidence })}
    />
  )
}

export function MarketBackButton({ label, ...buttonProps }: Readonly<{ label: string; variant?: 'ghost'; className: string }>) {
  const router = useRouter()
  const back = useMarketBackNavigation()
  if (back === 'history') {
    return (
      <Button type="button" onClick={() => router.history.back()} {...buttonProps}>
        <ArrowLeftIcon aria-hidden="true" />
        {label}
      </Button>
    )
  }
  return (
    <Button asChild {...buttonProps}>
      <Link to="/market">
        <ArrowLeftIcon aria-hidden="true" />
        {label}
      </Link>
    </Button>
  )
}

function CurrentToolDetail({
  tool,
  evidence,
}: Readonly<{
  tool: PublicToolDescriptor
  evidence?: MarketListingEvidenceProjection
}>) {
  return (
    <AePublicPage
      kind="workspace"
      title={toolDisplayTitle(tool)}
      description={`${tool.business.name} · ${tool.contract.capabilityId}`}
      actions={<MarketBackButton label="Catalog" className="min-h-touch" variant="ghost" />}
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
}: Readonly<{
  result: Exclude<ToolDetailPresentationResult, { kind: 'found' }>
}>) {
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
      action={<MarketBackButton label="Browse current Tools" className="min-h-touch" />}
    />
  )
}

function ToolDetailPending() {
  return <AePageSkeleton title="Checking the current capability…" description="Checking the current capability…" shape="detail" />
}

function ToolDetailError() {
  return <ToolUnavailable result={{ kind: 'source_unavailable', toolRef: 'Requested reference' }} />
}
