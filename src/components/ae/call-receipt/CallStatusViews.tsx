import type { ReactNode } from 'react'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { projectCallReceipt, type CallReceiptView } from '@/modules/capability-execution/call-receipt-view'

import type {
  CallStatusPageActions,
  CallStatusPageResult,
  FoundCallStatus,
  StatusRefusedResult,
  StatusUnchangedResult,
} from '@/lib/call-recovery/call-status-page-types'

import { CallMoneyFacts } from './CallMoneyFacts'
import { CallReceiptIssue, CallReceiptRefreshButton, CallReceiptRef, CallReceiptStatusFeedback, callReceiptTactilePressClassName } from './CallReceiptPrimitives'
import { CallReceiptTimeline } from './CallReceiptTimeline'
import { CallReceiptWorkspace } from './CallReceiptWorkspace'
import { CallRecoveryPanel } from './CallRecoveryPanel'
import { CallOutputSection, CallRequestSection, CallTechnicalRecord } from './CallTechnicalRecord'
import { CallReuseActions } from './CallReuseActions'
import { CallSummarySection } from './CallSummarySection'
import { PaidCallReportControl } from './PaidCallReportControl'
import { machineLabel } from './call-receipt-format'

function MachineReadableReceipt({ view }: Readonly<{ view: CallReceiptView }>) {
  return (
    <details>
      <summary className="flex min-h-touch cursor-pointer items-center text-sm font-medium text-foreground">
        Machine-readable receipt
      </summary>
      <pre className="mt-related max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-foreground"><code>{JSON.stringify(view, null, 2)}</code></pre>
    </details>
  )
}

function CallReceiptTechnicalShell({
  callRef,
  receiptView,
  children,
}: Readonly<{ callRef: string; receiptView: CallReceiptView; children?: ReactNode }>) {
  return (
    <details className="border-t border-border pt-related">
      <summary className="flex min-h-touch cursor-pointer items-center text-sm font-medium text-foreground">Technical record</summary>
      <div className="grid gap-section pt-related">
        <CallReceiptRef value={callRef} />
        <CallReceiptTimeline stages={receiptView.stages} />
        {children}
        <MachineReadableReceipt view={receiptView} />
      </div>
    </details>
  )
}

export function CallStatusUnchangedView({
  result,
  actions,
}: Readonly<{
  result: StatusUnchangedResult
  actions?: CallStatusPageActions
}>) {
  return (
    <CallReceiptWorkspace callRef={result.callRef} description="Checking whether this exact Call has changed.">
      <section
        className="grid min-h-[12rem] gap-related rounded-xl border border-border bg-card p-4"
        aria-labelledby="unchanged-receipt-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-intra">
          <Badge variant="secondary" className="w-fit">No status change</Badge>
          <CallReceiptRef value={result.callRef} />
        </div>
        <div className="grid gap-intra">
          <h2 id="unchanged-receipt-title" className="text-base font-medium leading-snug tracking-tight text-foreground">
            No status change
          </h2>
          <p className="text-sm text-muted-foreground">
            The authoritative Call record has not changed since version {result.version}.
          </p>
        </div>
        {actions?.onRefresh === undefined ? null : (
          <Button
            type="button"
            className={cn('min-h-touch w-fit', callReceiptTactilePressClassName)}
            variant="outline"
            disabled={actions.refreshPending === true}
            onClick={() => { void actions.onRefresh?.() }}
          >
            {actions.refreshPending === true ? 'Checking…' : 'Check status'}
          </Button>
        )}
      </section>
    </CallReceiptWorkspace>
  )
}

export function CallStatusFoundView({
  result,
  actions,
}: Readonly<{ result: FoundCallStatus; actions?: CallStatusPageActions }>) {
  const receiptView = projectCallReceipt(result)
  const recordedTool = result.ownerContext?.recordedTool.kind === 'available' ? result.ownerContext.recordedTool : undefined
  const receiptTitle = recordedTool?.name
  return (
    <CallReceiptWorkspace callRef={result.callRef} {...(receiptTitle === undefined ? {} : { title: receiptTitle })} description={receiptView.issue?.whatHappened ?? receiptView.statusDetail}>
      <CallSummarySection result={result} receiptView={receiptView} />
      {result.ownerContext != null && result.result?.kind === 'completed'
        && (receiptView.receipt?.state === 'settled' || receiptView.receipt?.state === 'refunded'
          || receiptView.usage?.chargeState === 'paid' || receiptView.usage?.chargeState === 'refunded')
        ? <PaidCallReportControl key={result.callRef} callRef={result.callRef}
            {...(actions?.onRefresh === undefined ? {} : { onPosted: actions.onRefresh })} /> : null}
      <CallRecoveryPanel result={result} {...(actions === undefined ? {} : { actions })} />
      <CallRequestSection input={result.previousInput} />
      {result.result === undefined ? null : <CallOutputSection result={result.result} />}
      {receiptView.complete ? (
        <CallReuseActions
          key={receiptView.callRef}
          view={receiptView}
        />
      ) : null}
      <CallTechnicalRecord result={result} view={receiptView} />
    </CallReceiptWorkspace>
  )
}

export function CallStatusRefusedView({
  result,
  actions,
}: Readonly<{
  result: StatusRefusedResult
  actions?: CallStatusPageActions
}>) {
  const canRetry = result.retryable && actions?.onRefresh !== undefined
  const receiptView = projectCallReceipt(result)
  return (
    <CallReceiptWorkspace callRef={result.callRef} description={receiptView.statusDetail}>
      <CallReceiptBarrierHeader
        badgeLabel={receiptView.statusLabel}
        callRef={result.callRef}
        {...(actions !== undefined ? { actions } : {})}
        showRefresh={canRetry}
        receiptView={receiptView}
      />
      <CallMoneyFacts view={receiptView} />
      <CallReceiptTechnicalShell callRef={result.callRef} receiptView={receiptView}>
        <AeSection title="Refusal evidence" description="The server response is shown without inventing Call state.">
          <AeFactList facts={[
            { label: "Code", value: machineLabel(result.code) },
            { label: "Retryable", value: result.retryable ? 'Yes' : 'No' },
            ...(result.nextAction === undefined ? [] : [{ label: "Next action", value: result.nextAction }]),
          ]} />
        </AeSection>
      </CallReceiptTechnicalShell>
    </CallReceiptWorkspace>
  )
}

export function CallStatusUnavailableView({
  result,
  actions,
}: Readonly<{
  result: Extract<CallStatusPageResult, { kind: 'source_unavailable' }>
  actions?: CallStatusPageActions
}>) {
  const receiptView = projectCallReceipt(result)
  return (
    <CallReceiptWorkspace callRef={result.callRef} description={receiptView.statusDetail}>
      <CallReceiptBarrierHeader
        badgeLabel="Receipt unavailable"
        callRef={result.callRef}
        {...(actions !== undefined ? { actions } : {})}
        showRefresh={actions?.onRefresh !== undefined}
        receiptView={receiptView}
      />
      <CallReceiptTechnicalShell callRef={result.callRef} receiptView={receiptView} />
    </CallReceiptWorkspace>
  )
}

function CallReceiptBarrierHeader({
  badgeLabel,
  callRef,
  actions,
  showRefresh,
  receiptView,
}: Readonly<{
  badgeLabel: string
  callRef: string
  actions?: CallStatusPageActions
  showRefresh: boolean
  receiptView: CallReceiptView
}>) {
  return (
    <>
      <div className="grid gap-related">
        <Badge variant="warning" className="w-fit">{badgeLabel}</Badge>
        <CallReceiptRef value={callRef} />
        {showRefresh && actions !== undefined ? (
          <CallReceiptRefreshButton actions={actions} labelMode="refresh_status" />
        ) : null}
        <CallReceiptStatusFeedback feedback={actions?.feedback} callRef={callRef} />
      </div>
      {receiptView.issue === undefined ? null : <CallReceiptIssue issue={receiptView.issue} />}
    </>
  )
}
