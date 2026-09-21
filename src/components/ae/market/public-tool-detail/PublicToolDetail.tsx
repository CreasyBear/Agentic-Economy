import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeToolInspector } from '@/components/ae/market/tool-detail'
import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import { toolDisplayTitle } from '@/modules/market/tool-view-model'

import { MarketBackButton } from './MarketBackButton'
import type {
  CurrentToolDetailProps,
  PublicToolDetailProps,
  ToolUnavailablePresentation,
  ToolUnavailableProps,
} from './public-tool-detail.contracts'

export type { PublicToolDetailProps } from './public-tool-detail.contracts'

/** Copy for a Tool whose readiness could not be confirmed; shared by the whole-page and inline states. */
export function toolUnavailablePresentation(
  result: ToolUnavailableProps['result'],
): ToolUnavailablePresentation {
  return result.kind === 'invalid_ref'
    ? {
        tone: 'neutral' as const,
        title: 'This Tool reference is invalid',
        description: 'The reference is malformed, so AE did not query the catalog or show commercial facts and Call steps.',
      }
    : result.kind === 'not_found'
    ? {
        tone: 'neutral' as const,
        title: 'This exact Tool is unknown or no longer current',
        description: 'AE has no current descriptor for this reference, so no historical terms, price, or Call steps are shown.',
      }
    : result.kind === 'source_unavailable'
      ? {
          tone: 'warning' as const,
          title: 'Tool details are unavailable',
          description: 'AE cannot verify the current descriptor right now, so no commercial facts or Call steps are shown.',
        }
      : {
          tone: 'warning' as const,
          title: 'This Tool is not currently available',
          description: `${REASON_COPY[result.reason] ?? REASON_COPY_FALLBACK} No commercial facts or Call steps are shown.`,
        }
}

export function PublicToolDetail({
  result,
  evidence,
}: PublicToolDetailProps) {
  if (result.kind !== 'found') return <ToolUnavailable result={result} />
  return (
    <CurrentToolDetail
      tool={result.tool}
      {...(evidence === undefined ? {} : { evidence })}
    />
  )
}

function CurrentToolDetail({
  tool,
  evidence,
}: CurrentToolDetailProps) {
  return (
    <AePublicPage>
      <div className="ae-rail grid gap-section pb-page">
        <AePageHeader
          eyebrow="Tool"
          title={toolDisplayTitle(tool)}
          description={`${tool.business.name} · ${tool.contract.capabilityId}`}
          actions={<MarketBackButton label="Catalog" className="min-h-touch" variant="ghost" />}
        />
        <AeToolInspector
          tool={tool}
          {...(evidence === undefined ? {} : { evidence })}
          variant="full"
        />
      </div>
    </AePublicPage>
  )
}

function ToolUnavailable({
  result,
}: ToolUnavailableProps) {
  const presentation = toolUnavailablePresentation(result)
  return (
    <AePageState
      tone={presentation.tone}
      title={presentation.title}
      description={presentation.description}
      action={<MarketBackButton label="Browse current Tools" className="min-h-touch" />}
    />
  )
}
