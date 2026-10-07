import { useState } from 'react'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { degrade } from '@/lib/observability/degrade'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AePriceUpdateModal } from './price-update-modal/AePriceUpdateModal'
import { Button as ArcButton } from '@/components/arc/button/button'
import { DecisionPanel } from '@/components/ae/shared/arc-pro/chat/DecisionPanel'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { Badge } from '@/components/arc/badge/badge'
import { formatTimestamp } from '@/lib/ui/format-time'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import {
  providerToolReasonPresentation,
  type ProviderToolStatus,
} from '@/modules/capability-supply/provider-tool-status'
import type {
  ProviderToolAction,
  ProviderToolActionOutcome,
} from '@/modules/capability-supply/provider-tool-actions.contracts'
import './ProviderToolComposition.css'

export type AeProviderToolDetailProps = Readonly<{
  name: string
  status: ProviderToolStatus
  resumeHref?: string
  currentPrice?: string
  onRefresh?: ProviderToolAction
  onRecheck?: ProviderToolAction
  onWithdraw?: ProviderToolAction
  onRepublish?: ProviderToolAction
  onUpdatePrice?: (newPriceAud: string) => Promise<ProviderToolActionOutcome>
  showTestPlayground?: boolean
}>

export function AeProviderToolDetail({
  name,
  status,
  resumeHref,
  currentPrice,
  onRefresh,
  onRecheck,
  onWithdraw,
  onRepublish,
  onUpdatePrice,
  showTestPlayground = false,
}: AeProviderToolDetailProps) {
  const [pending, setPending] = useState(false)
  const [confirmation, setConfirmation] = useState<'withdraw' | 'republish' | 'price'>()
  const [feedback, setFeedback] = useState<ProviderToolActionOutcome>()
  const firstReason = status.reasonCodes[0] === undefined
    ? undefined
    : providerToolReasonPresentation(status.reasonCodes[0])

  const unavailableContinuations = status.reasonCodes.slice(1)
    .filter(code => code === 'maintenance_identity_unavailable' || code === 'source_preview_unavailable')
    .map(code => ({ code, ...providerToolReasonPresentation(code) }))

  async function run(action: ProviderToolAction | undefined) {
    if (action === undefined || pending) return
    setPending(true)
    setFeedback(undefined)
    try {
      const result = await action()
      setFeedback(result)
      if (result.kind === 'applied') setConfirmation(undefined)
    } catch (cause) {
      setFeedback(degrade(cause, {
        kind: 'refused',
        message: 'Agentic Economy could not confirm the result. Reload this Tool before trying another action.',
      }, { site: 'runProviderToolAction', reason: 'source_unavailable' }))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="arc-market arc-provider-tool-detail">
      <DecisionPanel aria-labelledby="provider-tool-state" className="arc-provider-tool-state">
        <div className="arc-provider-tool-state-heading">
          <h2 id="provider-tool-state" className="arc-provider-tool-state-title">{status.state}</h2>
          <Badge className="arc-provider-tool-availability" tone={status.routeability.available ? 'info' : 'neutral'}>
            {status.routeability.available ? 'Available to buyers' : 'Not available to buyers'}
          </Badge>
        </div>
        <p className="arc-provider-tool-description">{status.state === 'Draft' && resumeHref === undefined
          ? 'This saved Tool has no resumable source. Start another Tool or contact Help with its Tool reference.'
          : stateDescription(status)}</p>
        {firstReason === undefined ? null : (
          <AeAlert tone="danger" title={firstReason.title}>{firstReason.description}</AeAlert>
        )}
        {unavailableContinuations.map(reason => (
          <AeAlert key={reason.code} tone="danger" title={reason.title}>{reason.description}</AeAlert>
        ))}
        {feedback === undefined ? null : (
          <AeAlert role="alert" tone={feedback.kind === 'refused' ? 'danger' : 'info'} title={feedback.kind === 'applied' ? 'Tool updated' : 'Tool unchanged'} aria-live="polite">{feedback.message}</AeAlert>
        )}
        <PrimaryAction
          status={status}
          pending={pending}
          {...(resumeHref === undefined ? {} : { resumeHref })}
          {...(onRefresh === undefined ? {} : { onRefresh: () => run(onRefresh) })}
          {...(onRecheck === undefined ? {} : { onRecheck: () => run(onRecheck) })}
          {...(onWithdraw === undefined ? {} : { onWithdraw: () => setConfirmation('withdraw') })}
          {...(onRepublish === undefined ? {} : { onRepublish: () => setConfirmation('republish') })}
          {...(onUpdatePrice === undefined ? {} : { onUpdatePrice: () => setConfirmation('price') })}
        />
      </DecisionPanel>

      <AeSection title="Tool status" description="Current publication facts from Agentic Economy’s canonical admission and routeability checks.">
        <AeFactList facts={[
          { label: 'Tool', value: name },
          { label: 'Source', value: sourceLabel(status.source.kind) },
          { label: 'Connection', value: sentenceCase(status.health.connection) },
          { label: 'Validation', value: sentenceCase(status.health.validation) },
          { label: 'Publication', value: sentenceCase(status.health.publication) },
          { label: 'Freshness', value: sentenceCase(status.health.freshness) },
          { label: 'Last checked', value: formatTimestamp(status.observedAt) },
          ...(status.validUntil === undefined ? [] : [{ label: 'Valid until', value: formatTimestamp(status.validUntil) }]),
        ]} />
      </AeSection>

      <AeSection title="Delivery and Qualified Use" description="Observed outcomes remain separate from source health and market availability.">
        <AeFactList facts={[
          { label: 'Delivery', value: deliverySummary(status.health.delivery) },
          { label: 'Qualified Use', value: usefulOutcomeSummary(status.health.usefulOutcome) },
        ]} />
      </AeSection>

      <details className="arc-provider-tool-technical">
        <summary className="arc-provider-tool-technical-summary">Technical details</summary>
        <AeFactList density="compact" className="arc-provider-tool-technical-facts" facts={[
          { label: 'Tool reference', value: status.toolRef, mono: true },
          { label: 'Provider reference', value: status.providerRef, mono: true },
          { label: 'Revision', value: status.revision ?? 'Not assigned' },
          { label: 'Source revision', value: status.source.revision ?? 'Not recorded', mono: true },
          { label: 'Source digest', value: status.source.digest ?? 'Not recorded', mono: true },
          { label: 'Reason codes', value: status.reasonCodes.length === 0 ? 'None' : status.reasonCodes.join(', '), mono: true },
          { label: 'Evidence', value: evidenceProvenance(status) },
        ]} />
      </details>

      {showTestPlayground && status.state === 'Published' && status.ownerHandoff === undefined && onRecheck !== undefined ? (
        <AeSection title="Source verification" description="Check the current source and admission requirements through Agentic Economy.">
          <ArcButton type="button" variant="secondary" size="md" className="arc-provider-tool-action" disabled={pending} onClick={() => void run(onRecheck)}>
            {pending ? 'Checking source…' : 'Recheck source'}
          </ArcButton>
        </AeSection>
      ) : null}

      <AeConfirmDialog
        open={confirmation === 'withdraw'}
        onOpenChange={(open) => { if (!open && !pending) setConfirmation(undefined) }}
        title="Withdraw this Tool?"
        description="The Tool will stop accepting new work. Existing Calls and evidence remain available, and this Tool can be republished after Agentic Economy revalidates it."
        confirmLabel="Withdraw Tool"
        confirmVariant="destructive"
        pending={pending}
        onConfirm={() => run(onWithdraw)}
      />
      <AeConfirmDialog
        open={confirmation === 'republish'}
        onOpenChange={(open) => { if (!open && !pending) setConfirmation(undefined) }}
        title="Republish this Tool?"
        description="Agentic Economy will revalidate the current source, authority and contract before making the Tool available to buyers again."
        confirmLabel="Republish Tool"
        pending={pending}
        onConfirm={() => run(onRepublish)}
      />

      <AePriceUpdateModal
        open={confirmation === 'price'}
        onOpenChange={(open) => { if (!open && !pending) setConfirmation(undefined) }}
        toolName={name}
        {...(currentPrice === undefined ? {} : { currentPrice })}
        onUpdatePrice={async (newPrice) => {
          if (!onUpdatePrice) return { kind: 'refused', message: 'Price update unavailable' }
          const res = await onUpdatePrice(newPrice)
          setFeedback(res)
          return res
        }}
      />
    </div>
  )
}

function PrimaryAction({
  status,
  pending,
  resumeHref,
  onRefresh,
  onRecheck,
  onWithdraw,
  onRepublish,
  onUpdatePrice,
}: Readonly<{
  status: ProviderToolStatus
  pending: boolean
  resumeHref?: string
  onRefresh?: () => void
  onRecheck?: () => void
  onWithdraw?: () => void
  onRepublish?: () => void
  onUpdatePrice?: () => void
}>) {
  if (status.ownerHandoff !== undefined) {
    return (
      <a
        href={status.ownerHandoff.destination}
        className={[actionLinkClassName('primary', 'md'), 'arc-provider-tool-action'].join(' ')}
      >
        {status.ownerHandoff.ctaLabel}
      </a>
    )
  }
  switch (status.continuation?.action) {
    case 'supply.source.preview':
      return (
        <a
          href={resumeHref ?? '/owner/operations/new'}
          className={[actionLinkClassName('primary', 'md'), 'arc-provider-tool-action'].join(' ')}
        >
          {resumeHref === undefined ? 'Add another Tool' : 'Continue setup'}
        </a>
      )
    case 'supply.status':
    case 'supply.offboarding.status':
      return onRefresh === undefined ? null : <ArcButton type="button" variant="primary" size="md" className="arc-provider-tool-action" disabled={pending} onClick={onRefresh}>{pending ? 'Refreshing…' : 'Refresh status'}</ArcButton>
    case 'supply.recheck':
      return onRecheck === undefined ? null : <ArcButton type="button" variant="primary" size="md" className="arc-provider-tool-action" disabled={pending} onClick={onRecheck}>{pending ? 'Rechecking…' : 'Recheck source'}</ArcButton>
    case 'supply.republish':
      return onRepublish === undefined ? null : <ArcButton type="button" variant="primary" size="md" className="arc-provider-tool-action" disabled={pending} onClick={onRepublish}>Republish</ArcButton>
    default:
      if (status.state === 'Published') {
        return (
          <div className="arc-provider-tool-actions">
            {onUpdatePrice !== undefined ? (
              <ArcButton type="button" variant="secondary" size="md" className="arc-provider-tool-action" disabled={pending} onClick={onUpdatePrice}>
                Update Price
              </ArcButton>
            ) : null}
            {onWithdraw !== undefined ? (
              <ArcButton type="button" variant="primary" size="md" className="arc-provider-tool-action" disabled={pending} onClick={onWithdraw}>
                Withdraw
              </ArcButton>
            ) : null}
          </div>
        )
      }
      return null
  }
}

function stateDescription(status: ProviderToolStatus): string {
  switch (status.state) {
    case 'Draft': return 'The source and Tool are saved. Continue setup when you are ready to submit.'
    case 'Needs setup': return 'Complete the source or connection requirement before submitting this Tool.'
    case 'Submitted': return 'Agentic Economy accepted this Tool and is preparing validation.'
    case 'Under review': return 'Agentic Economy is checking the exact source, authority, and contract.'
    case 'Published': return 'This Tool is current and available for buyer inspection.'
    case 'Paused': return 'This Tool is not accepting new work. Existing evidence remains available.'
    case 'Action required': return 'Agentic Economy stopped new work because one current requirement needs attention.'
    case 'Retired': return 'This Tool is retired and no longer accepts new work.'
  }
}

function sourceLabel(kind: ProviderToolStatus['source']['kind']): string {
  if (kind === 'openapi') return 'OpenAPI'
  if (kind === 'mcp') return 'MCP'
  if (kind === 'agent_plugin') return 'Agent Plugin'
  if (kind === 'x402') return 'x402'
  if (kind === 'legacy') return 'Legacy source'
  return getStatusPresentation('unavailable').label
}

function sentenceCase(value: string): string {
  const normalized = value.replaceAll('_', ' ')
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function deliverySummary(delivery: ProviderToolStatus['health']['delivery']): string {
  if (delivery.kind === 'unobserved') return 'No completed Calls in this window'
  if (delivery.kind === 'unavailable') return 'Window too large to summarize safely'
  return `${delivery.deliveredCount} delivered · ${delivery.notDeliveredCount} not delivered · ${delivery.unknownCount} unknown`
}

function usefulOutcomeSummary(outcome: ProviderToolStatus['health']['usefulOutcome']): string {
  if (outcome.kind === 'unobserved') return 'No Qualified Use recorded in this window'
  if (outcome.kind === 'unavailable') return 'Window too large to summarize safely'
  return `${outcome.qualifiedUseCount} ${outcome.qualifiedUseCount === 1 ? 'Qualified Use' : 'Qualified Uses'}`
}

function evidenceProvenance(status: ProviderToolStatus): string {
  return `${status.health.delivery.provenance}; ${status.health.usefulOutcome.provenance}`
}
