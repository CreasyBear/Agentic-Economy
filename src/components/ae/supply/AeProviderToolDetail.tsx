import { useState } from 'react'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { degrade } from '@/lib/observability/degrade'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatTimestamp } from '@/lib/ui/format-time'
import {
  providerToolReasonPresentation,
  type ProviderToolStatus,
} from '@/modules/capability-supply/provider-tool-status'

export type ProviderToolActionOutcome = Readonly<{
  kind: 'applied' | 'refused'
  message: string
}>

type ToolAction = () => Promise<ProviderToolActionOutcome>

export function AeProviderToolDetail({
  name,
  status,
  resumeHref,
  onRefresh,
  onRecheck,
  onWithdraw,
  onRepublish,
}: Readonly<{
  name: string
  status: ProviderToolStatus
  resumeHref?: string
  onRefresh?: ToolAction
  onRecheck?: ToolAction
  onWithdraw?: ToolAction
  onRepublish?: ToolAction
}>) {
  const [pending, setPending] = useState(false)
  const [confirmation, setConfirmation] = useState<'withdraw' | 'republish'>()
  const [feedback, setFeedback] = useState<ProviderToolActionOutcome>()
  const firstReason = status.reasonCodes[0] === undefined
    ? undefined
    : providerToolReasonPresentation(status.reasonCodes[0])

  async function run(action: ToolAction | undefined) {
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
        message: 'AE could not confirm the result. Reload this Tool before trying another action.',
      }, { site: 'runProviderToolAction', reason: 'source_unavailable' }))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-section">
      <section aria-labelledby="provider-tool-state" className="grid gap-related">
        <div className="flex flex-wrap items-center gap-intra">
          <h2 id="provider-tool-state" className="font-sans text-xl font-semibold tracking-tight">{status.state}</h2>
          <Badge variant={status.routeability.available ? 'default' : 'outline'}>
            {status.routeability.available ? 'Available to buyers' : 'Not available to buyers'}
          </Badge>
        </div>
        <p className="max-w-[65ch] text-sm text-muted-foreground">{stateDescription(status)}</p>
        {firstReason === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>{firstReason.title}</AlertTitle>
            <AlertDescription>{firstReason.description}</AlertDescription>
          </Alert>
        )}
        {feedback === undefined ? null : (
          <Alert variant={feedback.kind === 'refused' ? 'destructive' : 'default'} aria-live="polite">
            <AlertTitle>{feedback.kind === 'applied' ? 'Tool updated' : 'Tool unchanged'}</AlertTitle>
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        )}
        <PrimaryAction
          status={status}
          pending={pending}
          {...(resumeHref === undefined ? {} : { resumeHref })}
          {...(onRefresh === undefined ? {} : { onRefresh: () => run(onRefresh) })}
          {...(onRecheck === undefined ? {} : { onRecheck: () => run(onRecheck) })}
          {...(onWithdraw === undefined ? {} : { onWithdraw: () => setConfirmation('withdraw') })}
          {...(onRepublish === undefined ? {} : { onRepublish: () => setConfirmation('republish') })}
        />
      </section>

      <AeSection title="Tool status" description="Current publication facts from AE’s canonical admission and routeability checks.">
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

      <details className="rounded-md border border-border px-gutter py-intra">
        <summary className="min-h-touch cursor-pointer py-intra font-medium">Technical details</summary>
        <AeFactList density="compact" className="pb-intra" facts={[
          { label: 'Tool reference', value: status.toolRef, mono: true },
          { label: 'Provider reference', value: status.providerRef, mono: true },
          { label: 'Revision', value: status.revision ?? 'Not assigned' },
          { label: 'Source revision', value: status.source.revision ?? 'Not recorded', mono: true },
          { label: 'Source digest', value: status.source.digest ?? 'Not recorded', mono: true },
          { label: 'Reason codes', value: status.reasonCodes.length === 0 ? 'None' : status.reasonCodes.join(', '), mono: true },
          { label: 'Evidence', value: evidenceProvenance(status) },
        ]} />
      </details>

      <AeConfirmDialog
        open={confirmation === 'withdraw'}
        onOpenChange={(open) => { if (!open && !pending) setConfirmation(undefined) }}
        title="Withdraw this Tool?"
        description="The Tool will stop accepting new work. Existing Calls and evidence remain available, and this Tool can be republished after AE revalidates it."
        confirmLabel="Confirm withdrawal"
        confirmVariant="destructive"
        pending={pending}
        onConfirm={() => run(onWithdraw)}
      />
      <AeConfirmDialog
        open={confirmation === 'republish'}
        onOpenChange={(open) => { if (!open && !pending) setConfirmation(undefined) }}
        title="Republish this Tool?"
        description="AE will revalidate the current source, authority and contract before making the Tool available to buyers again."
        confirmLabel="Confirm republish"
        pending={pending}
        onConfirm={() => run(onRepublish)}
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
}: Readonly<{
  status: ProviderToolStatus
  pending: boolean
  resumeHref?: string
  onRefresh?: () => void
  onRecheck?: () => void
  onWithdraw?: () => void
  onRepublish?: () => void
}>) {
  if (status.ownerHandoff !== undefined) {
    return <Button asChild className="min-h-touch w-fit"><a href={status.ownerHandoff.cta}>{status.ownerHandoff.ctaLabel}</a></Button>
  }
  switch (status.continuation?.action) {
    case 'supply.source.preview':
      return <Button asChild className="min-h-touch w-fit"><a href={resumeHref ?? '/owner/offerings/new'}>Continue setup</a></Button>
    case 'supply.status':
    case 'supply.offboarding.status':
      return onRefresh === undefined ? null : <Button type="button" className="min-h-touch w-fit" disabled={pending} onClick={onRefresh}>{pending ? 'Refreshing…' : 'Refresh status'}</Button>
    case 'supply.recheck':
      return onRecheck === undefined ? null : <Button type="button" className="min-h-touch w-fit" disabled={pending} onClick={onRecheck}>{pending ? 'Rechecking…' : 'Recheck source'}</Button>
    case 'supply.republish':
      return onRepublish === undefined ? null : <Button type="button" className="min-h-touch w-fit" disabled={pending} onClick={onRepublish}>Republish</Button>
    default:
      return status.state === 'Published' && onWithdraw !== undefined
        ? <Button type="button" variant="secondary" className="min-h-touch w-fit" disabled={pending} onClick={onWithdraw}>Withdraw</Button>
        : null
  }
}

function stateDescription(status: ProviderToolStatus): string {
  switch (status.state) {
    case 'Draft': return 'The source and Tool are saved. Continue setup when you are ready to submit.'
    case 'Needs setup': return 'Complete the source or connection requirement before submitting this Tool.'
    case 'Submitted': return 'AE accepted this Tool and is preparing validation.'
    case 'Under review': return 'AE is validating the exact source, authority and contract. No separate promotion step is required.'
    case 'Published': return 'This Tool is current and available for buyer inspection.'
    case 'Paused': return 'This Tool is not accepting new work. Existing evidence remains available.'
    case 'Action required': return 'AE stopped new work because one current requirement needs attention.'
    case 'Retired': return 'This Tool is retired and no longer accepts new work.'
  }
}

function sourceLabel(kind: ProviderToolStatus['source']['kind']): string {
  if (kind === 'openapi') return 'OpenAPI'
  if (kind === 'mcp') return 'MCP'
  if (kind === 'agent_plugin') return 'Agent Plugin'
  if (kind === 'x402') return 'x402'
  if (kind === 'legacy') return 'Legacy source'
  return 'Unavailable'
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
