import { createContext, useContext } from 'react'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeToolPrice } from '@/components/ae/market/AeToolPrice'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/arc/button/button'
import buttonStyles from '@/components/arc/button/button.module.css'
import { DecisionPanel } from '@/components/arc/chat/DecisionPanel'
import { ProductListing } from '@/components/arc/market/ProductListing'
import { ComparisonTable as ArcComparisonTable } from '@/components/arc/market/ComparisonTable'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import {
  chatBelowMatch,
  chatBrowseMarket,
  chatChoiceLinkName,
  chatShowingTools,
  chatToolStatus,
} from '@/lib/public/chat-ia'
import {
  toolCardState,
  toolChoiceReadinessLabel,
  type ChatNeedActions,
  type ToolCardProjection,
  type ToolChoiceRow,
} from '@/modules/chat/tool-card'
import { NeedSaveAction } from './need-save-action/NeedSaveAction'
import { PaidCallReportControl } from '@/components/ae/call-receipt/PaidCallReportControl'
import { CallFeedbackControl } from '@/components/ae/call-receipt/CallFeedbackControl'
import { RecoveryNotice } from './recovery/RecoveryNotice'
import type { SearchNextProps, ToolCardProps as ToolCardBaseProps } from './presentation'
import type { RunIntent } from '@/modules/chat/run-request'
import { readChatRecoveryReason } from './recovery/recovery.view-model'
import type { ChatRecoveryReason } from './recovery/recovery.contracts'
import './ToolResultComposition.css'

const secondaryLink = `${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm}`

type ToolCardProps = ToolCardBaseProps & Readonly<{
  onAddCredit?: ((shortfall?: { units: string; exponent: number }, run?: RunIntent) => void) | undefined
}>

export const ChatNeedActionsContext = createContext<ChatNeedActions | null>(null)
export const PaidCallReportOwnerContext = createContext<Readonly<{ onPosted: () => void }> | null>(null)

function inspectHref(toolRef: string): string {
  return `/tools/${encodeURIComponent(toolRef)}`
}
function safeRecoveryReason(reason: string | undefined, fallback: ChatRecoveryReason): ChatRecoveryReason {
  const known = readChatRecoveryReason(reason)
  return known === 'unknown' ? fallback : known
}


function choiceInitial(title: string): string {
  return title.trim().charAt(0).toUpperCase() || 'T'
}


function ChoiceRow({ choice }: { choice: ToolChoiceRow }) {
  const readinessLabel = choice.readiness === undefined ? undefined : toolChoiceReadinessLabel(choice.readiness)
  return (
    <a className="arc-listing-card arc-tool-choice"
      href={choice.detailHref ?? inspectHref(choice.toolRef)}
      aria-label={chatChoiceLinkName(choice.title, choice.readiness === 'ready' ? 'Ready now' : undefined)}>
      <div className="arc-listing-media arc-tool-choice-surface">
        <span className="arc-tool-choice-initial" aria-hidden="true">{choiceInitial(choice.title)}</span>
        {choice.provider === undefined ? null : <span className="arc-tool-choice-provider">{choice.provider}</span>}
        {readinessLabel === undefined ? null : <span className="arc-tool-choice-readiness" data-ready={choice.readiness === 'ready'}>
          <span aria-hidden="true" />{readinessLabel}
        </span>}
      </div>
      <div className="arc-listing-info arc-tool-choice-info">
        <h4 className="arc-tool-choice-title">{choice.title}</h4>
        {choice.access === undefined ? null : <p className="arc-tool-choice-access">{choice.access === 'external_listing' ? 'External listing · not callable through AE' : choice.access}</p>}
        {choice.price === undefined ? null : <AeToolPrice price={choice.price}
          {...(choice.priceValidUntil === undefined ? {} : { validUntil: choice.priceValidUntil })}
          size="sm" className="arc-tool-choice-price" />}
      </div>
    </a>
  )
}

function CompareTable({ choices }: { choices: readonly ToolChoiceRow[] }) {
  const valuesFor = (valueFor: (choice: ToolChoiceRow) => string) => Object.fromEntries(
    choices.map((choice) => [choice.toolRef, valueFor(choice)] as const),
  )
  const columns = choices.map((choice) => ({
    id: choice.toolRef,
    name: choice.title,
    caption: choice.provider ?? '',
    action: <a href={choice.detailHref ?? inspectHref(choice.toolRef)} className={secondaryLink}>{choice.title}</a>,
  }))
  const rows = [
    { id: 'provider', feature: 'Provider', values: valuesFor((choice) => choice.provider ?? 'Not published') },
    { id: 'price', feature: 'Price', values: valuesFor((choice) => choice.price ?? 'Not published'), retainWhenSame: true },
    {
      id: 'readiness',
      feature: 'Readiness',
      values: valuesFor((choice) => choice.readiness === undefined ? 'Not published' : toolChoiceReadinessLabel(choice.readiness)),
      retainWhenSame: true,
    },
    {
      id: 'access',
      feature: 'Access',
      values: valuesFor((choice) => choice.access === undefined
        ? 'Not published'
        : choice.access === 'external_listing' ? 'External listing · not callable through AE' : choice.access),
      retainWhenSame: true,
    },
    ...(choices.some((choice) => choice.belowMatch === true)
      ? [{
        id: 'match',
        feature: 'Match',
        values: valuesFor((choice) => choice.belowMatch === true ? chatBelowMatch : 'Not supplied'),
        retainWhenSame: true,
      }]
      : []),
    ...(choices.some((choice) => choice.sourcePrice !== undefined)
      ? [{ id: 'sourcePrice', feature: 'Source price', values: valuesFor((choice) => choice.sourcePrice ?? 'Not published'), retainWhenSame: true }]
      : []),
    ...(choices.some((choice) => choice.priceValidUntil !== undefined)
      ? [{ id: 'priceValidUntil', feature: 'Price valid until', values: valuesFor((choice) => choice.priceValidUntil === undefined
        ? 'Not published' : `${formatUtcTimestamp(choice.priceValidUntil)} UTC`), retainWhenSame: true }]
      : []),
    ...(choices.some((choice) => choice.networkLabel !== undefined)
      ? [{ id: 'networkLabel', feature: 'Network', values: valuesFor((choice) => choice.networkLabel ?? 'Not published') }]
      : []),
    ...(choices.some((choice) => choice.resourcePath !== undefined)
      ? [{ id: 'resourcePath', feature: 'Resource path', values: valuesFor((choice) => choice.resourcePath ?? 'Not published') }]
      : []),
    ...(choices.some((choice) => choice.host !== undefined)
      ? [{ id: 'host', feature: 'Host', values: valuesFor((choice) => choice.host ?? 'Not published') }]
      : []),
    ...(choices.some((choice) => choice.callable !== undefined)
      ? [{
        id: 'callable',
        feature: 'Callable',
        values: valuesFor((choice) => choice.callable === undefined
          ? 'Not published' : choice.callable ? 'Callable through AE' : 'Not callable through AE'),
        retainWhenSame: true,
      }]
      : []),
  ]
  return <ArcComparisonTable
    title="Tool comparison"
    description="Compare the supplied Tool facts. Inspect a Tool for its full contract."
    columns={columns}
    sections={[{ id: 'published', title: 'Tool facts', rows }]}
  />
}

function ChoiceList({ choices }: { choices: readonly ToolChoiceRow[] }) {
  return (
    <section aria-label="Tools">
      <ProductListing className="arc-tool-choice-gallery">
      {choices.map((choice) => (
        <li key={choice.toolRef}><ChoiceRow choice={choice} /></li>
      ))}
      </ProductListing>
    </section>
  )
}

function ChoiceRemainder({ count, shown }: { count: number; shown: number }) {
  const remainder = count > shown && shown > 0
  return (
    <p className="arc-tool-result-count">
        {chatShowingTools(shown, count)}
        {remainder ? (
          <>
            {' '}
            <a href="/market">{chatBrowseMarket}</a>
          </>
        ) : null}
    </p>
  )
}

export function SearchNext({ next, onRepeatSearch }: SearchNextProps) {
  // Chat resolves a recommendation or a refinement; API cursors are not chat actions.
  if (next === undefined || next.action === 'next-page') return null
  if (next.action === 'broaden') return (
    <a href={`/market?query=${encodeURIComponent(next.args.query)}`}
      className={secondaryLink}>{chatBrowseMarket}</a>
  )
  if (next.action === 'retry') return onRepeatSearch === undefined
    ? <a href={`/market?query=${encodeURIComponent(next.args.query)}`}
      className={secondaryLink}>{chatBrowseMarket}</a>
    : <Button type="button" variant="secondary" size="sm"
      onClick={() => onRepeatSearch(next.args.query)}>Try again</Button>
  return null
}

function cardBody(projection: ToolCardProjection, onAddCredit?: ToolCardProps['onAddCredit'], reportOwner?: { onPosted: () => void } | null) {
  switch (projection.kind) {
    case 'working':
    case 'clarify':
      return null
    case 'status': {
      if (projection.state === 'attention') {
        return <Alert><AlertDescription>{projection.summary}</AlertDescription></Alert>
      }
      const funding = projection.funding
      const reason = safeRecoveryReason(projection.recoveryReason, 'tool_unavailable')
      return <RecoveryNotice reason={reason}
        {...(reason !== 'insufficient_balance' || onAddCredit === undefined
          ? {} : { onAddCredit: () => onAddCredit(funding) })} />
    }
    case 'choices':
      return (
        <div className="arc-tool-result-body">
          {projection.choices.length === 0 ? null : projection.toolId === 'registry.tools.compare' || projection.surface === 'compare'
            ? <CompareTable choices={projection.choices} />
            : <ChoiceList choices={projection.choices} />}
          {projection.contrasts === undefined || projection.contrasts.length === 0
            ? null
            : <AeFactList density="compact" facts={projection.contrasts} />}
        </div>
      )
    case 'inspect':
      return projection.facts.length === 0
        ? null
        : <AeFactList density="compact" facts={projection.facts} />
    case 'execute':
      return (
        <div className="arc-tool-result-body">
          {projection.state === 'refused' || projection.state === 'reconciliation_required' ? (
            <RecoveryNotice
              reason={safeRecoveryReason(projection.recoveryReason, projection.state === 'reconciliation_required' ? 'outcome_unknown' : 'tool_unavailable')}
              {...(projection.callRef === undefined ? {} : { callRefs: [projection.callRef] })}
              {...(projection.state !== 'refused' || projection.recoveryReason !== 'insufficient_balance' || onAddCredit === undefined
                ? {} : { onAddCredit: () => onAddCredit() })}
            />
          ) : (
            <Alert variant="default">
              <AlertTitle>{executeStateTitle(projection.state)}</AlertTitle>
              <AlertDescription>{projection.summary}</AlertDescription>
            </Alert>
          )}
          {projection.state === 'completed' && projection.paid !== undefined && projection.callRef !== undefined && reportOwner != null
            ? <PaidCallReportControl key={projection.callRef} callRef={projection.callRef} paidLabel={projection.paid} onPosted={reportOwner.onPosted} />
            : projection.paid === undefined ? null : <Badge variant="secondary">{projection.paid}</Badge>}
          {projection.state === 'completed' && projection.callRef !== undefined && reportOwner != null
            ? <CallFeedbackControl key={projection.callRef} callRef={projection.callRef} /> : null}
        </div>
      )
    default: {
      const exhaustive: never = projection
      return exhaustive
    }
  }
}

function executeStateTitle(state: Extract<ToolCardProjection, { kind: 'execute' }>['state']): string {
  if (state === 'completed') return 'Result ready'
  if (state === 'pending') return 'Call pending'
  if (state === 'needs_authority') return 'Approval required'
  if (state === 'reconciliation_required') return 'Reconciliation required'
  return 'Call refused'
}

function ExecuteNextAction({ projection }: Readonly<{
  projection: Extract<ToolCardProjection, { kind: 'execute' }>
}>) {
  const suggestedNextAction = projection.suggestedNextAction
  if (suggestedNextAction === undefined || projection.state === 'reconciliation_required' || projection.state === 'refused') return null
  if (suggestedNextAction.href !== undefined) {
    return (
      <a
        href={suggestedNextAction.href}
        className={secondaryLink}
      >
        {suggestedNextAction.label}
      </a>
    )
  }
  return suggestedNextAction.command === undefined
    ? null
    : <AeCopyCommand compact label={suggestedNextAction.label} code={suggestedNextAction.command} />
}

const STATUS_VARIANT = {
  complete: 'success',
  working: 'info',
  pending: 'info',
  attention: 'warning',
  refused: 'warning',
  error: 'destructive',
} as const

/** Requires: a current typed Tool projection; actions and reporting callbacks are caller-owned.
 * Ensures: main recovery, refusal, cursor, reporting, trust and next-action behavior survives Arc composition.
 * Invariant: no financial or execution fact is inferred beyond the projection.
 * On violation: existing refusal and recovery guards decide the message and available actions. */
export function ToolCard({ projection, onContinueSearch, onRepeatSearch, signedThread, onAddCredit }: ToolCardProps) {
  const needActions = useContext(ChatNeedActionsContext)
  const reportOwner = useContext(PaidCallReportOwnerContext)
  if (projection.kind === 'working') {
    return (
      <p className="arc-market arc-chat arc-tool-result-working" role="status">
        <Spinner aria-hidden="true" role="presentation" />
        <span>{projection.title}…</span>
      </p>
    )
  }
  if (projection.kind === 'clarify') return null
  const state = toolCardState(projection)
  return (
    <DecisionPanel data-tool-card={projection.toolId} className="arc-tool-result">
      <header className="arc-tool-result-header">
        <h3>{projection.title}</h3>
        <Badge variant={STATUS_VARIANT[state]}>{chatToolStatus[state]}</Badge>
      </header>
      <div className="arc-tool-result-body">
        {cardBody(projection, onAddCredit, reportOwner)}
      </div>
      {(projection.kind === 'choices' && (projection.count !== undefined || projection.next !== undefined))
        || (projection.kind === 'status' && (projection.next !== undefined || projection.saveNeed !== undefined)) ? (
        <footer className="arc-tool-result-actions">
          {projection.kind === 'choices' && projection.count !== undefined ? <ChoiceRemainder count={projection.count} shown={projection.choices.length} /> : null}
          {projection.next === undefined ? null : <SearchNext next={projection.next}
            {...(onContinueSearch === undefined ? {} : { onContinueSearch })}
            {...(onRepeatSearch === undefined ? {} : { onRepeatSearch })}
            {...(signedThread === undefined ? {} : { signedThread })} />}
          {projection.kind === 'status' && projection.saveNeed !== undefined ? <NeedSaveAction input={projection.saveNeed} actions={needActions} /> : null}
        </footer>
      ) : projection.kind === 'execute' ? (
        <footer className="arc-tool-result-actions">
          <ExecuteNextAction projection={projection} />
          <a href="/trust" target="_blank" rel="noreferrer" aria-label="Trust centre (opens in a new tab)"
            className="arc-decision-link">Trust centre</a>
        </footer>
      ) : null}
    </DecisionPanel>
  )
}
