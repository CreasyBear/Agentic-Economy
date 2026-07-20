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

import { Badge } from '@astryxdesign/core/Badge'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'

import {
  formatHostedPaidOperationAccessibleMoney,
  formatHostedPaidOperationMaterialFields,
  formatHostedPaidOperationMoney,
  formatHostedPaidOperationPaymentSubmission,
  formatHostedPaidOperationQueryRelease,
  formatHostedPaidOperationResultDelivery,
  formatHostedPaidOperationSettlement,
  hostedPaidOperationCommandDescriptorIsSafe,
  hostedPaidOperationCommandLabel,
  projectHostedPaidOperationCardPresentation,
  type HostedPaidOperationCardInput,
  type HostedPaidOperationCardPresentation,
  type HostedPaidOperationCommandDescriptor,
} from '@/modules/action-invocation/paid-operation-card-contract'
import type {
  PaidOperationPresentationBlock,
  PaidOperationSemantics,
} from '@/modules/action-invocation/paid-operation-semantics'

export type AePaidOperationCardProps = Readonly<{
  semantics: PaidOperationSemantics
  card: HostedPaidOperationCardInput
  onCommand?: (descriptor: HostedPaidOperationCommandDescriptor) => void
  onReadOnlyInspect?: (relation: string) => void
}>

/**
 * Customer-facing projection of one paid operation.
 * Payment and result facts remain separate so uncertainty cannot look retryable.
 */
export function AePaidOperationCard({
  semantics,
  card,
  onCommand,
  onReadOnlyInspect,
}: AePaidOperationCardProps) {
  const presentation = projectHostedPaidOperationCardPresentation(semantics, card)
  const Icon = presentationIcon(presentation.icon)
  const pending = card.pendingCommand !== null
  const authorityControls = card.authorize !== null && card.refuse !== null
  const continuation = authorityControls ? null : card.safeContinuation
  const technical = card.technicalDetails

  return (
    <Card
      padding={5}
      className="grid w-full max-w-2xl gap-5"
      aria-labelledby={`paid-operation-${semantics.identity.invocationRef}`}
      aria-busy={pending || undefined}
      data-paid-operation-state={presentation.label.toLowerCase().replaceAll(' ', '_')}
      data-semantic-digest={technical.semanticDigest}
      data-invocation-version={technical.expectedInvocationVersion}
      data-evidence-class={card.runtimeEvidence.evidenceClass}
    >
      <header className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <Badge variant="neutral" label={card.runtimeEvidence.environment} />
            <Text type="supporting" color="secondary" display="block">
              {card.runtimeEvidence.provenance}
            </Text>
          </div>
          <Badge
            variant={presentation.badgeVariant}
            icon={<Icon aria-hidden="true" />}
            label={presentation.label}
          />
        </div>
        <div className="grid gap-1">
          <Text
            as="h2"
            id={`paid-operation-${semantics.identity.invocationRef}`}
            type="large"
            weight="semibold"
            color="primary"
            display="block"
          >
            {semantics.presentation.title}
          </Text>
          <Text color="secondary" display="block">
            {semantics.presentation.summary}
          </Text>
        </div>
      </header>

      <section
        className="grid gap-3 rounded-md border border-border bg-surface p-4"
        aria-labelledby={`consequence-${semantics.identity.invocationRef}`}
      >
        <SectionHeading id={`consequence-${semantics.identity.invocationRef}`}>
          Consequence
        </SectionHeading>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Fact label="Provider" value={card.disclosure.providerDisplayName} />
          <Fact
            label="Maximum charge"
            value={formatHostedPaidOperationMoney(card.disclosure.maximumCharge)}
            accessibleValue={formatHostedPaidOperationAccessibleMoney(
              card.disclosure.maximumCharge,
            )}
          />
          <Fact
            label="Data shared"
            value={formatHostedPaidOperationMaterialFields(card.disclosure.materialFields)}
          />
        </dl>
      </section>

      <section
        className="grid gap-2 rounded-md border border-border bg-surface p-4"
        aria-labelledby={`current-truth-${semantics.identity.invocationRef}`}
      >
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="grid min-w-0 gap-1">
            <SectionHeading id={`current-truth-${semantics.identity.invocationRef}`}>
              Current truth
            </SectionHeading>
            <p className="text-sm text-primary">
              {presentation.truth}
            </p>
            <dl className="mt-1">
              <Fact
                label="Data sharing"
                value={formatHostedPaidOperationQueryRelease(semantics.queryRelease)}
              />
            </dl>
          </div>
        </div>
      </section>

      <section
        className="grid gap-3"
        aria-labelledby={`payment-result-${semantics.identity.invocationRef}`}
      >
        <SectionHeading id={`payment-result-${semantics.identity.invocationRef}`}>
          Payment and result truth
        </SectionHeading>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Fact
            label="Payment request"
            value={formatHostedPaidOperationPaymentSubmission(card.paymentTruth)}
          />
          <Fact
            label="Payment outcome"
            value={formatHostedPaidOperationSettlement(card.settlementTruth)}
          />
          <Fact
            label="Result"
            value={formatHostedPaidOperationResultDelivery(card.resultTruth)}
          />
        </dl>
      </section>

      <section
        className="grid gap-3 border-t border-border pt-4"
        aria-labelledby={`safe-action-${semantics.identity.invocationRef}`}
      >
        <div className="grid gap-1">
          <SectionHeading id={`safe-action-${semantics.identity.invocationRef}`}>
            Safe next action
          </SectionHeading>
          <Text color="secondary" display="block">{presentation.nextAction}</Text>
        </div>
        {card.transportRescue === null
          ? (
              <CommandControls
                card={card}
                authorityControls={authorityControls}
                continuation={continuation}
                pending={pending}
                onCommand={onCommand}
              />
            )
          : (
              <div className="grid gap-3">
                <p className="flex items-start gap-2 text-sm text-primary">
                  <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  <span>
                    Update not confirmed. Reload this operation before doing anything else.
                  </span>
                </p>
                {onReadOnlyInspect === undefined
                  ? null
                  : (
                      <button
                        type="button"
                        className={[
                          'inline-flex min-h-11 min-w-11 items-center justify-center gap-2',
                          'rounded-md border border-border bg-surface px-4 py-2 text-sm',
                          'font-semibold text-primary focus-visible:outline-2',
                          'focus-visible:outline-offset-2 sm:w-fit',
                        ].join(' ')}
                        onClick={() =>
                          onReadOnlyInspect(card.transportRescue?.inspectRelation ?? '')}
                      >
                        <RefreshCwIcon className="size-5" aria-hidden="true" />
                        <span>Reload operation</span>
                      </button>
                    )}
              </div>
            )}
      </section>

      <BlockList
        headingId={`operation-details-${semantics.identity.invocationRef}`}
        label="Operation details"
        blocks={card.operationBlocks}
      />

      {card.resultTruth.state === 'valid'
        ? (
            <BlockList
              headingId={`result-${semantics.identity.invocationRef}`}
              label="Result"
              blocks={card.resultTruth.blocks}
            />
          )
        : null}

      <section
        className="grid gap-3 border-t border-border pt-4"
        aria-labelledby={`evidence-${semantics.identity.invocationRef}`}
      >
        <SectionHeading id={`evidence-${semantics.identity.invocationRef}`}>
          Evidence
        </SectionHeading>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label="Environment" value={card.runtimeEvidence.environment} />
          <Fact label="Provenance" value={card.runtimeEvidence.provenance} />
          <Fact label="Evidence class" value={card.runtimeEvidence.evidenceClass} />
          <Fact label="Claim ceiling" value={card.runtimeEvidence.claimCeiling} />
        </dl>
      </section>

      <details className="group rounded-md border border-border bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2">
          Technical details
        </summary>
        <dl className="grid gap-3 border-t border-border p-4 text-sm sm:grid-cols-2">
          <Fact label="Invocation reference" value={technical.invocationRef} />
          <Fact
            label="Expected invocation version"
            value={String(technical.expectedInvocationVersion)}
          />
          <Fact label="Operation revision" value={technical.operationRevision} />
          <Fact label="Provider ID" value={technical.providerId} />
          <Fact label="Semantic digest" value={technical.semanticDigest} />
          <Fact label="Digest use" value={technical.semanticDigestUse} />
          <Fact
            label="Request sharing"
            value={formatHostedPaidOperationQueryRelease(semantics.queryRelease)}
          />
          <Fact
            label="Evidence references"
            value={technical.evidenceReferences.length === 0
              ? 'No evidence references recorded'
              : technical.evidenceReferences.join(', ')}
          />
        </dl>
      </details>
    </Card>
  )
}

function SectionHeading({
  children,
  id,
}: Readonly<{ children: string; id: string }>) {
  return (
    <Text
      as="h3"
      id={id}
      type="large"
      weight="semibold"
      color="primary"
      display="block"
    >
      {children}
    </Text>
  )
}

function Fact({
  accessibleValue,
  label,
  value,
}: Readonly<{ accessibleValue?: string; label: string; value: string }>) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-xs font-medium text-secondary">{label}</dt>
      <dd
        className="break-words text-sm text-primary"
        {...(accessibleValue === undefined ? {} : { 'aria-label': accessibleValue })}
      >
        {value}
      </dd>
    </div>
  )
}

function BlockList({
  headingId,
  label,
  blocks,
}: Readonly<{
  headingId: string
  label: string
  blocks: readonly PaidOperationPresentationBlock[]
}>) {
  const safeBlocks = blocks.filter(isClosedPresentationBlock)
  return (
    <section className="grid gap-3" aria-labelledby={headingId}>
      <SectionHeading id={headingId}>{label}</SectionHeading>
      <dl className="grid gap-3 sm:grid-cols-2">
        {safeBlocks.map((block) => (
          <PresentationBlockFact
            key={`${block.kind}:${block.label}`}
            block={block}
          />
        ))}
      </dl>
    </section>
  )
}

function PresentationBlockFact({
  block,
}: Readonly<{ block: PaidOperationPresentationBlock }>) {
  switch (block.kind) {
    case 'text':
    case 'reference':
      return <Fact label={block.label} value={block.value} />
    case 'measurement':
      return <Fact label={block.label} value={`${formatNumber(block.value)} ${block.unit}`} />
    case 'money':
      return (
        <Fact
          label={block.label}
          value={formatHostedPaidOperationMoney(block)}
          accessibleValue={formatHostedPaidOperationAccessibleMoney(block)}
        />
      )
    case 'timestamp':
      return (
        <div className="grid min-w-0 gap-1">
          <dt className="text-xs font-medium text-secondary">{block.label}</dt>
          <dd className="break-words text-sm text-primary">
            <time dateTime={block.value}>
              {formatTime(block.value)}
              <span className="sr-only"> ({block.value})</span>
            </time>
          </dd>
        </div>
      )
    case 'source':
      return (
        <Fact
          label={block.label}
          value={`${block.providerName} · ${block.operationRevision}`}
        />
      )
    case 'status':
      return (
        <div className="grid min-w-0 gap-1">
          <dt className="text-xs font-medium text-secondary">{block.label}</dt>
          <dd className="flex items-start gap-2 break-words text-sm text-primary">
            {presentationBlockStatusIcon(block.tone)}
            <span>{block.value}</span>
          </dd>
        </div>
      )
  }
}

function CommandControls({
  authorityControls,
  card,
  continuation,
  onCommand,
  pending,
}: Readonly<{
  authorityControls: boolean
  card: HostedPaidOperationCardInput
  continuation: HostedPaidOperationCommandDescriptor | null
  onCommand: AePaidOperationCardProps['onCommand']
  pending: boolean
}>) {
  if (onCommand === undefined) {
    return card.noActionReason === null
      ? null
      : <Text color="secondary" display="block">{card.noActionReason}</Text>
  }

  if (authorityControls && card.authorize !== null && card.refuse !== null) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <CommandButton
          descriptor={card.authorize}
          pending={pending}
          onCommand={onCommand}
          variant="primary"
          maximumCharge={card.disclosure.maximumCharge}
        />
        <CommandButton
          descriptor={card.refuse}
          pending={pending}
          onCommand={onCommand}
          variant="secondary"
          maximumCharge={card.disclosure.maximumCharge}
        />
      </div>
    )
  }

  if (continuation !== null) {
    return (
      <CommandButton
        descriptor={continuation}
        pending={pending}
        onCommand={onCommand}
        variant={continuation.command === 'reconcile' ? 'primary' : 'secondary'}
        maximumCharge={card.disclosure.maximumCharge}
      />
    )
  }

  return card.noActionReason === null
    ? null
    : <Text color="secondary" display="block">{card.noActionReason}</Text>
}

function CommandButton({
  descriptor,
  maximumCharge,
  onCommand,
  pending,
  variant,
}: Readonly<{
  descriptor: HostedPaidOperationCommandDescriptor
  maximumCharge: Readonly<{ currency: string; amountMinor: number }>
  onCommand: NonNullable<AePaidOperationCardProps['onCommand']>
  pending: boolean
  variant: 'primary' | 'secondary'
}>) {
  if (!hostedPaidOperationCommandDescriptorIsSafe(descriptor)) return null
  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending || undefined}
      className={[
        'inline-flex min-h-11 min-w-11 items-center justify-center gap-2',
        'rounded-md border px-4 py-2 text-sm font-semibold',
        'focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit',
        variant === 'primary'
          ? 'border-accent bg-accent text-on-accent'
          : 'border-border bg-surface text-primary',
      ].join(' ')}
      data-command={descriptor.command}
      onClick={() => onCommand(descriptor)}
    >
      {pending
        ? <Clock3Icon className="size-5" aria-hidden="true" />
        : commandIcon(descriptor)}
      <span>{hostedPaidOperationCommandLabel(descriptor, maximumCharge)}</span>
    </button>
  )
}

function presentationIcon(icon: HostedPaidOperationCardPresentation['icon']) {
  switch (icon) {
    case 'info':
      return InfoIcon
    case 'clock':
      return Clock3Icon
    case 'search':
      return SearchIcon
    case 'success':
      return CheckCircle2Icon
    case 'warning':
      return AlertTriangleIcon
    case 'error':
      return XCircleIcon
  }
}

function commandIcon(descriptor: HostedPaidOperationCommandDescriptor) {
  switch (descriptor.command) {
    case 'authorize':
      return descriptor.accept === false
        ? <XCircleIcon aria-hidden="true" />
        : <CheckCircle2Icon aria-hidden="true" />
    case 'execute':
      return <RefreshCwIcon aria-hidden="true" />
    case 'reconcile':
      return <SearchIcon aria-hidden="true" />
    case 'inspect':
      return <InfoIcon aria-hidden="true" />
  }
}

function isClosedPresentationBlock(
  value: PaidOperationPresentationBlock,
): value is PaidOperationPresentationBlock {
  if (
    value === null
    || typeof value !== 'object'
    || typeof value.label !== 'string'
    || value.label.trim().length === 0
  ) return false
  return value.kind === 'text'
    || value.kind === 'measurement'
    || value.kind === 'money'
    || value.kind === 'timestamp'
    || value.kind === 'source'
    || value.kind === 'reference'
    || value.kind === 'status'
}

function presentationBlockStatusIcon(
  tone: Extract<PaidOperationPresentationBlock, { kind: 'status' }>['tone'],
) {
  switch (tone) {
    case 'positive':
      return <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    case 'caution':
      return <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    case 'critical':
      return <XCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    case 'neutral':
      return <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
  }
}

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

function formatTime(value: string): string {
  return timeFormatter.format(new Date(value))
}

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 })
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})
