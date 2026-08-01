'use client'

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  Clock3Icon,
  InfoIcon,
  RefreshCwIcon,
  SearchIcon,
  XCircleIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import type {
  PaidOperationContinuation,
  PaidOperationPresentationBlock,
  PaidOperationSemantics,
} from '@/modules/action-invocation/paid-operation-semantics'

export type AePaidOperationCardProps = Readonly<{
  semantics: PaidOperationSemantics
  onContinue?: (continuation: PaidOperationContinuation) => void
}>

type Presentation = Readonly<{
  label: string
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline'
  icon: typeof InfoIcon
  truth: string
  nextAction: string
}>

/**
 * Customer-facing projection of one paid operation.
 * Payment and result facts remain separate so uncertainty cannot look retryable.
 */
export function AePaidOperationCard({
  semantics,
  onContinue,
}: AePaidOperationCardProps) {
  const presentation = present(semantics)
  const Icon = presentation.icon
  const continuation = preferredContinuation(semantics.continuations)

  return (
    <Card
      className="grid w-full max-w-2xl gap-5 border border-border bg-card p-5"
      aria-labelledby={`paid-operation-${semantics.identity.invocationRef}`}
      data-paid-operation-state={presentation.label.toLowerCase().replaceAll(' ', '_')}
    >
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline">{semantics.environment.name}</Badge>
          <Badge variant={presentation.badgeVariant}>
            <Icon aria-hidden="true" />
            {presentation.label}
          </Badge>
        </div>
        <div className="grid gap-1">
          <h2
            id={`paid-operation-${semantics.identity.invocationRef}`}
            className="text-lg font-semibold text-foreground"
          >
            {semantics.presentation.title}
          </h2>
          <p className="text-muted-foreground">{semantics.presentation.summary}</p>
        </div>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Fact label="Maximum charge" value={money(semantics.maximumAuthorizedCharge)} />
        <Fact label="Data sharing" value={queryReleaseLabel(semantics)} />
        <Fact label="Provider" value={semantics.operation.providerName} />
      </dl>

      <BlockList label="Operation details" blocks={semantics.presentation.blocks} />

      <section
        className="grid gap-2 rounded-md border border-border bg-card p-4"
        aria-labelledby={`current-truth-${semantics.identity.invocationRef}`}
      >
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="grid min-w-0 gap-1">
            <h3
              id={`current-truth-${semantics.identity.invocationRef}`}
              className="font-semibold text-foreground"
            >
              Current truth
            </h3>
            <p className="text-sm text-foreground">{presentation.truth}</p>
          </div>
        </div>
      </section>

      {semantics.resultDelivery.state === 'valid'
        ? <BlockList label="Result" blocks={semantics.resultDelivery.blocks} />
        : null}

      <section className="grid gap-3 border-t border-border pt-4" aria-label="Safe next action">
        <div className="grid gap-1">
          <p className="font-semibold text-foreground">Safe next action</p>
          <p className="text-muted-foreground">{presentation.nextAction}</p>
        </div>
        {continuation !== null && onContinue !== undefined ? (
          <Button
            type="button"
            variant={continuation.kind === 'reconcile' ? 'default' : 'secondary'}
            className="min-h-11 w-full sm:w-fit"
            onClick={() => onContinue(continuation)}
          >
            {continuationIcon(continuation)}
            <span>{continuationLabel(continuation)}</span>
          </Button>
        ) : null}
      </section>

      <details className="rounded-md border border-border bg-card">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2">
          Technical details
        </summary>
        <dl className="grid gap-3 border-t border-border p-4 text-sm sm:grid-cols-2">
          <Fact label="Environment" value={semantics.environment.name} />
          <Fact label="Evidence" value={semantics.environment.evidenceClass} />
          <Fact label="Claim limit" value={semantics.environment.claimCeiling} />
          <Fact label="Operation version" value={semantics.operation.operationRevision} />
          <Fact label="Request reference" value={semantics.identity.invocationRef} />
          <Fact label="Request sharing" value={queryReleaseLabel(semantics)} />
          <Fact label="Payment request" value={paymentSubmissionLabel(semantics)} />
          <Fact label="Payment evidence" value={settlementLabel(semantics)} />
          <Fact label="Result evidence" value={resultDeliveryLabel(semantics)} />
        </dl>
      </details>
    </Card>
  )
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm text-foreground">{value}</dd>
    </div>
  )
}

function BlockList({
  label,
  blocks,
}: Readonly<{
  label: string
  blocks: readonly PaidOperationPresentationBlock[]
}>) {
  return (
    <section className="grid gap-2" aria-label={label}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {blocks.map((block) => (
          <Fact
            key={`${block.kind}:${block.label}`}
            label={block.label}
            value={presentationBlockValue(block)}
          />
        ))}
      </dl>
    </section>
  )
}

function presentationBlockValue(block: PaidOperationPresentationBlock): string {
  switch (block.kind) {
    case 'text':
    case 'reference':
      return block.value
    case 'measurement':
      return `${formatNumber(block.value)} ${block.unit}`
    case 'money':
      return money(block)
    case 'timestamp':
      return formatTime(block.value)
    case 'source':
      return `${block.providerName} · ${block.operationRevision}`
    case 'status':
      return block.value
  }
}

function present(semantics: PaidOperationSemantics): Presentation {
  const uncertain = semantics.paymentSubmission.state === 'possibly_submitted'
    || semantics.settlement.state === 'unknown'

  if (uncertain) {
    return {
      label: 'Needs checking',
      badgeVariant: 'secondary',
      icon: AlertTriangleIcon,
      truth: 'The provider may have received the payment request. AE will not try again until the exact payment is checked.',
      nextAction: 'Check the existing payment and request. Do not start this purchase again.',
    }
  }

  if (semantics.settlement.state === 'not_settled') {
    return {
      label: 'Checked — not paid',
      badgeVariant: 'secondary',
      icon: SearchIcon,
      truth: 'The earlier payment was checked and was not settled.',
      nextAction: semantics.continuations.some(({ kind }) => kind === 'retry')
        ? 'Try the operation again with fresh permission.'
        : 'Review the recorded details. A new result requires a new, explicitly authorized operation.',
    }
  }

  if (semantics.resultDelivery.state === 'valid') {
    const paymentTruth = semantics.settlement.state === 'settled'
      ? `Payment of ${money(semantics.settlement.amount)} is supported by the recorded evidence.`
      : 'No independent payment settlement is recorded.'
    return {
      label: 'Result received',
      badgeVariant: 'default',
      icon: CheckCircle2Icon,
      truth: `The result was received and validated. ${paymentTruth}`,
      nextAction: 'Review the result and its recorded source.',
    }
  }

  if (
    semantics.settlement.state === 'settled'
    && semantics.resultDelivery.state === 'invalid'
  ) {
    return {
      label: 'Paid — result unusable',
      badgeVariant: 'secondary',
      icon: AlertTriangleIcon,
      truth: `Payment of ${money(semantics.settlement.amount)} is supported by the recorded evidence, but the returned result could not be validated.`,
      nextAction: semantics.continuations.some(({ kind }) => kind === 'reconcile')
        ? 'Check the recorded payment and unusable result before deciding what to do next.'
        : 'Review the payment and result evidence. Do not assume another result is free.',
    }
  }

  if (
    semantics.error !== null
    && semantics.queryRelease.state === 'not_released'
    && semantics.paymentSubmission.state === 'not_submitted'
  ) {
    return {
      label: 'Not sent',
      badgeVariant: 'destructive',
      icon: XCircleIcon,
      truth: `The request stopped before anything was sent to the provider and before any payment request was submitted. Reason: ${semantics.error.code.replaceAll('_', ' ')}.`,
      nextAction: semantics.continuations.some(({ kind }) => kind === 'retry')
        ? 'Try again when you are ready.'
        : 'Review why the request stopped.',
    }
  }

  if (
    semantics.paymentAuthorization.state === 'created'
    && semantics.paymentSubmission.state === 'not_submitted'
  ) {
    return {
      label: 'Prepared',
      badgeVariant: 'secondary',
      icon: Clock3Icon,
      truth: 'Payment permission is prepared, but no payment request has been submitted.',
      nextAction: 'Wait for the prepared request to continue, or inspect its details.',
    }
  }

  if (semantics.paymentSubmission.state === 'observed') {
    return {
      label: 'Waiting for result',
      badgeVariant: 'secondary',
      icon: Clock3Icon,
      truth: 'The provider received the payment request. AE is waiting for attributable payment and result evidence.',
      nextAction: 'Wait for the recorded request to resolve. Do not send another.',
    }
  }

  return {
    label: 'Ready to inspect',
    badgeVariant: 'outline',
    icon: InfoIcon,
    truth: 'Nothing has been sent to the provider and no payment request has been submitted.',
    nextAction: 'Review the provider, shared data and maximum charge.',
  }
}

function preferredContinuation(
  continuations: readonly PaidOperationContinuation[],
): PaidOperationContinuation | null {
  return continuations.find(({ kind }) => kind === 'reconcile')
    ?? continuations.find(({ kind }) => kind === 'authorize')
    ?? continuations.find(({ kind }) => kind === 'execute')
    ?? continuations.find(({ kind }) => kind === 'retry')
    ?? continuations.find(({ kind }) => kind === 'inspect')
    ?? null
}

function continuationLabel(continuation: PaidOperationContinuation): string {
  switch (continuation.kind) {
    case 'authorize':
      return 'Authorize payment'
    case 'execute':
      return 'Continue operation'
    case 'reconcile':
      return 'Check existing payment'
    case 'retry':
      return 'Try again'
    case 'inspect':
      return 'Review details'
  }
}

function continuationIcon(continuation: PaidOperationContinuation) {
  switch (continuation.kind) {
    case 'authorize':
      return <CheckCircle2Icon aria-hidden="true" />
    case 'execute':
      return <RefreshCwIcon aria-hidden="true" />
    case 'reconcile':
      return <SearchIcon aria-hidden="true" />
    case 'retry':
      return <RefreshCwIcon aria-hidden="true" />
    case 'inspect':
      return <InfoIcon aria-hidden="true" />
  }
}

function money(value: Readonly<{ currency: string; amountMinor: number }>): string {
  let formatter = moneyFormatters.get(value.currency)
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: value.currency,
    })
    moneyFormatters.set(value.currency, formatter)
  }
  const minorUnitExponent = formatter.resolvedOptions().maximumFractionDigits ?? 2
  return formatter.format(value.amountMinor / (10 ** minorUnitExponent))
}

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

function formatTime(value: string): string {
  return timeFormatter.format(new Date(value))
}

const moneyFormatters = new Map<string, Intl.NumberFormat>()
const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 })
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

function queryReleaseLabel(semantics: PaidOperationSemantics): string {
  switch (semantics.queryRelease.state) {
    case 'not_released':
      return 'Not shared'
    case 'released':
      return `Shared with ${semantics.queryRelease.recipient}`
    case 'unknown':
      return 'Sharing status unknown'
  }
}

function paymentSubmissionLabel(semantics: PaidOperationSemantics): string {
  switch (semantics.paymentSubmission.state) {
    case 'not_submitted':
      return 'Not submitted'
    case 'possibly_submitted':
      return 'Possibly submitted'
    case 'observed':
      return 'Received by provider'
  }
}

function settlementLabel(semantics: PaidOperationSemantics): string {
  switch (semantics.settlement.state) {
    case 'no_evidence':
      return 'No settlement evidence'
    case 'not_settled':
      return 'Checked — not settled'
    case 'settled':
      return `${money(semantics.settlement.amount)} settled`
    case 'unknown':
      return 'Settlement unknown'
  }
}

function resultDeliveryLabel(semantics: PaidOperationSemantics): string {
  switch (semantics.resultDelivery.state) {
    case 'not_delivered':
      return 'No result received'
    case 'invalid':
      return 'Result could not be validated'
    case 'valid':
      return 'Result validated'
  }
}
