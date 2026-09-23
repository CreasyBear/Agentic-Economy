import { Await, Link } from '@tanstack/react-router'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { buttonVariants } from '@/components/ui/button-variants'
import { directoryPrice, directoryPriceContext, directoryTitle } from '@/modules/market/directory-card.view-model'
import type { ToolDetailPresentation } from '@/modules/market/tool-detail-presentation'

import { MarketBackButton } from './MarketBackButton'
import { PublicToolDetail, toolUnavailablePresentation } from './PublicToolDetail'
import { TOOL_UNAVAILABLE_COPY } from './public-tool-detail.contracts'
import type {
  AeDirectoryToolCanonicalPageProps,
  DirectoryEntrySummaryPageProps,
  DirectoryEntryUnavailableProps,
} from './public-tool-detail.contracts'

export function AeDirectoryToolCanonicalPage({ data }: AeDirectoryToolCanonicalPageProps) {
  if (data.metadata.kind !== 'found' && data.metadata.kind !== 'found_upstream') {
    return <DirectoryEntryUnavailable metadata={data.metadata} />
  }
  const { admission, metadata } = data
  // The loader only omits `admission` alongside a non-'found' metadata, so
  // this is unreachable in practice; kept for type soundness.
  if (admission === undefined) {
    return <DirectoryEntryUnavailable metadata={{ kind: 'unavailable', reason: 'source_unavailable' }} />
  }
  return (
    <Await promise={admission} fallback={<DirectoryEntrySummaryPage entry={metadata.item.entry} upstream={metadata.kind === 'found_upstream'} />}>
      {(resolved: ToolDetailPresentation) => resolved.result.kind === 'found'
        ? <PublicToolDetail result={resolved.result} {...(resolved.evidence === undefined ? {} : { evidence: resolved.evidence })} />
        : <DirectoryEntrySummaryPage entry={metadata.item.entry} upstream={metadata.kind === 'found_upstream'} readiness={toolUnavailablePresentation(resolved.result)} />}
    </Await>
  )
}

/** Renders at once from the directory lookup, before and after the admission promise resolves - title, Provider, price, description and inline readiness state, per the design's "no blank first content" requirement. */
function DirectoryEntrySummaryPage({ entry, upstream, readiness }: DirectoryEntrySummaryPageProps) {
  return (
    <AePublicPage>
      <div className="grid gap-section pb-page">
        <AePageHeader
          eyebrow="Tool"
          title={directoryTitle(entry)}
          description={entry.provider}
          actions={<MarketBackButton label="Browse Market" className="min-h-touch" variant="ghost" />}
        />
        <div className="ae-rail grid max-w-2xl gap-related">
          {upstream ? <p className="text-sm text-muted-foreground">Listed by the Provider directory; not yet verified in Agentic Economy&apos;s index.</p> : null}
          <div>
            <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Provider-listed price</p>
            <p className="text-lg font-semibold tabular-nums">{directoryPrice(entry)}</p>
            <p className="mt-0.5 text-caption text-muted-foreground">{directoryPriceContext(entry)}</p>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{entry.description}</p>
          <div role="status" className="grid gap-1 text-sm text-muted-foreground">
            {readiness === undefined ? (
              <p>Checking whether this Tool is ready to call…</p>
            ) : (
              <>
                <p className="font-medium text-foreground">{readiness.title}</p>
                <p>{readiness.description}</p>
                <Link to={readiness.action.to} className="text-sm underline underline-offset-4">
                  {readiness.action.label}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </AePublicPage>
  )
}

function DirectoryEntryUnavailable({ metadata }: DirectoryEntryUnavailableProps) {
  const reason = metadata.kind === 'not_found'
    ? 'resource_not_found'
    : metadata.reason === 'query_invalid'
      ? 'query_invalid'
      : 'source_unavailable'
  const presentation = TOOL_UNAVAILABLE_COPY[reason]
  return (
    <AePageState
      tone={presentation.action.to === '/status' ? 'warning' : 'neutral'}
      title={presentation.title}
      description={`${presentation.cause} ${presentation.nextStep}`}
      action={(
        <Link
          to={presentation.action.to}
          className={buttonVariants({ className: 'min-h-touch' })}
        >
          {presentation.action.label}
        </Link>
      )}
    />
  )
}
