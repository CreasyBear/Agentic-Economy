import { Link } from '@tanstack/react-router'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeToolInspector } from '@/components/ae/market/tool-detail'
import { buttonVariants } from '@/components/ui/button-variants'
import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import { toolDisplayTitle } from '@/modules/market/tool-view-model'

import { MarketBackButton } from './MarketBackButton'
import { TOOL_UNAVAILABLE_COPY } from './public-tool-detail.contracts'
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
  if (result.kind === 'unavailable' && !('schemaVersion' in result)) {
    const copy = TOOL_UNAVAILABLE_COPY[result.reason]
    return {
      tone: copy.action.to === '/status' ? 'warning' : 'neutral',
      title: copy.title,
      description: `${copy.cause} ${copy.nextStep}`,
      action: copy.action,
    }
  }
  if (result.kind === 'source_unavailable') {
    const copy = TOOL_UNAVAILABLE_COPY.source_unavailable
    return {
      tone: 'warning',
      title: copy.title,
      description: `${copy.cause} ${copy.nextStep}`,
      action: copy.action,
    }
  }
  if (result.kind === 'invalid_ref') {
    return {
      tone: 'neutral',
      title: 'This Tool reference is invalid',
      description: 'The reference is malformed, so AE did not query the catalog or show commercial facts and Call steps.',
      action: { label: 'Browse Market', to: '/market' },
    }
  }
  if (result.kind === 'not_found') {
    return {
      tone: 'neutral',
      title: 'This exact Tool is unknown or no longer current',
      description: 'Agentic Economy has no current record for this Tool, so no historical terms, price, or Call steps are shown.',
      action: { label: 'Browse Market', to: '/market' },
    }
  }
  return {
    tone: 'warning',
    title: 'This Tool is not currently available',
    description: `${REASON_COPY[result.reason] ?? REASON_COPY_FALLBACK} No commercial facts or Call steps are shown.`,
    action: { label: 'Browse Market', to: '/market' },
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
      <div className="grid gap-section pb-page">
        <AePageHeader
          eyebrow="Tool"
          title={toolDisplayTitle(tool)}
          description={`${tool.business.name} · ${tool.contract.capabilityId}`}
          actions={<MarketBackButton label="Browse Market" className="min-h-touch" variant="ghost" />}
        />
        <div className="ae-rail">
          <AeToolInspector
            tool={tool}
            {...(evidence === undefined ? {} : { evidence })}
            variant="full"
          />
        </div>
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
