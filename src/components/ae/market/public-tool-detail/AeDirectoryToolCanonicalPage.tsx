import { Await } from '@tanstack/react-router'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { directoryPrice, directoryPriceContext, directoryTitle } from '@/modules/market/directory-card.view-model'
import type { ToolDetailPresentation } from '@/modules/market/tool-detail-presentation'

import { MarketBackButton } from './MarketBackButton'
import { PublicToolDetail } from './PublicToolDetail'
import type {
  AeDirectoryToolCanonicalPageProps,
  DirectoryEntrySummaryPageProps,
  DirectoryEntryUnavailableProps,
} from './public-tool-detail.contracts'

export function AeDirectoryToolCanonicalPage({ data }: AeDirectoryToolCanonicalPageProps) {
  if (data.metadata.kind !== 'found') {
    return <DirectoryEntryUnavailable metadata={data.metadata} />
  }
  const { admission, metadata } = data
  // The loader only omits `admission` alongside a non-'found' metadata, so
  // this is unreachable in practice; kept for type soundness.
  if (admission === undefined) {
    return <DirectoryEntryUnavailable metadata={{ kind: 'unavailable', reason: 'source_unavailable' }} />
  }
  return (
    <Await promise={admission} fallback={<DirectoryEntrySummaryPage entry={metadata.item.entry} />}>
      {(resolved: ToolDetailPresentation) => (
        <PublicToolDetail
          result={resolved.result}
          {...(resolved.evidence === undefined ? {} : { evidence: resolved.evidence })}
        />
      )}
    </Await>
  )
}

/** Renders at once from the indexed lookup, before the admission promise resolves - title, Provider, price and description, per the design's "no blank first content" requirement. */
function DirectoryEntrySummaryPage({ entry }: DirectoryEntrySummaryPageProps) {
  return (
    <AePublicPage>
      <div className="ae-rail grid gap-section pb-page">
        <AePageHeader
          eyebrow="Tool"
          title={directoryTitle(entry)}
          description={entry.provider}
          actions={<MarketBackButton label="Catalog" className="min-h-touch" variant="ghost" />}
        />
        <div className="grid max-w-2xl gap-related">
          <p className="text-sm leading-relaxed text-muted-foreground">{entry.description}</p>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Provider-listed price</p>
            <p className="text-lg font-semibold tabular-nums">{directoryPrice(entry)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{directoryPriceContext(entry)}</p>
          </div>
          <p role="status" className="text-sm text-muted-foreground">Checking whether this Tool is ready to call…</p>
        </div>
      </div>
    </AePublicPage>
  )
}

function DirectoryEntryUnavailable({ metadata }: DirectoryEntryUnavailableProps) {
  const presentation = metadata.kind === 'not_found'
    ? { tone: 'neutral' as const, title: 'This Tool is unknown or no longer listed', description: 'AE has no current directory entry for this reference.' }
    : { tone: 'warning' as const, title: 'Tool details are unavailable', description: metadata.reason === 'query_invalid' ? 'The Tool reference is malformed.' : 'AE cannot verify the current directory entry right now.' }
  return (
    <AePageState
      tone={presentation.tone}
      title={presentation.title}
      description={presentation.description}
      action={<MarketBackButton label="Browse current Tools" className="min-h-touch" />}
    />
  )
}
