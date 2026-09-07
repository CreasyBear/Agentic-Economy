import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { AlertTriangleIcon, CheckCircle2Icon, CircleIcon, Clock3Icon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatUtcTimestamp, timestampIso } from '@/lib/ui/format-time'
import {
  cancelOwnerCallServer,
  readOwnerCallStatusServer,
  reconcileOwnerCallServer,
} from '@/modules/capability-execution/call-recovery.functions'
import type {
  CallReceipt,
  CallResult,
  CallUsageSummary,
} from '@/modules/capability-execution/call-contracts'
import {
  projectCallReceipt,
  outcomeRecordLabel,
  purchaseStatusLabel,
  type CallIssueView,
  type CallReceiptStageView,
  type CallReceiptView,
} from '@/modules/capability-execution/call-receipt-view'
import type {
  CallRecoveryResult,
  CallStatusResult,
} from '@/modules/capability-execution/call-recovery-contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { nextActionForCallStatus } from '@/modules/market/suggested-next-action'
import { formatCurrencyAmount } from '@/modules/money/public'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

export type CallStatusPageResult = CallStatusResult | Readonly<{
  kind: 'source_unavailable'
  callRef: string
}>

export type CallReconciliationForm = Readonly<{
  resolution: 'not_released' | 'released'
  source: string
  evidenceRef: string
}>

export type CallStatusPageActions = Readonly<{
  onRefresh?: () => void | Promise<void>
  refreshPending?: boolean
  onCancel?: () => void | Promise<void>
  cancelPending?: boolean
  onReconcile?: (input: CallReconciliationForm) => void
  reconcilePending?: boolean
  feedback?: Readonly<{ kind: 'success' | 'error'; message: string }>
}>

type FoundCallStatus = Extract<CallStatusResult, { kind: 'found' }>

export const Route = createFileRoute('/calls/$callRef')({
  loader: ({ params }) => readOwnerCallStatusServer({ data: { callRef: params.callRef } })
    .catch((): CallStatusPageResult => ({
      kind: 'source_unavailable',
      callRef: params.callRef,
    })),
  head: () => ({ meta: [
    { title: 'Call receipt | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  pendingComponent: CallStatusPending,
  errorComponent: CallStatusError,
  component: CallStatusRoute,
})

function CallStatusRoute() {
  const loadedResult = Route.useLoaderData()
  const [result, setResult] = useState<CallStatusPageResult>(loadedResult)
  const [refreshPending, setRefreshPending] = useState(false)
  const [cancelPending, setCancelPending] = useState(false)
  const [reconcilePending, setReconcilePending] = useState(false)
  const [feedback, setFeedback] = useState<CallStatusPageActions['feedback']>()
  const readStatus = useServerFn(readOwnerCallStatusServer)
  const cancel = useServerFn(cancelOwnerCallServer)
  const reconcile = useServerFn(reconcileOwnerCallServer)
  const router = useRouter()
  const cancelIdempotencyKeyRef = useRef<string | undefined>(undefined)
  const reconciliationAttemptRef = useRef<Readonly<{
    identity: string
    idempotencyKey: string
    observedAt: string
  }> | undefined>(undefined)
  useEffect(() => {
    setResult(loadedResult)
  }, [loadedResult])

  async function refreshCurrentStatus() {
    if (refreshPending || cancelPending || reconcilePending || !canRefreshStatus(result)) return
    setRefreshPending(true)
    setFeedback(undefined)
    try {
      const refreshed = await readStatus({ data: { callRef: result.callRef } })
      setResult(refreshed)
      setFeedback(refreshFeedback(refreshed))
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setFeedback({ kind: 'error', message: 'The current status source is unavailable. The displayed state has not changed.' })
    } finally {
      setRefreshPending(false)
    }
  }

  async function cancelCurrentCall() {
    if (refreshPending || cancelPending || reconcilePending || result.kind !== 'found' || !(result.state === 'authorized' || result.state === 'retryable' || result.state === 'leased')) return
    setCancelPending(true)
    setFeedback(undefined)
    cancelIdempotencyKeyRef.current ??= crypto.randomUUID()
    try {
      const recovery = await cancel({
        data: {
          callRef: result.callRef,
          idempotencyKey: cancelIdempotencyKeyRef.current,
        },
      })
      cancelIdempotencyKeyRef.current = undefined
      setResult(statusFromRecovery(recovery))
      setFeedback(cancelFeedback(recovery))
      try {
        await router.invalidate()
      } catch (cause) {
        captureClientExceptionOnClient(cause)
        setFeedback({ kind: 'error', message: 'The cancellation result was received, but current status could not be reloaded. The displayed result is retained.' })
      }
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setFeedback({ kind: 'error', message: 'The cancellation source is unavailable. No new Call state is claimed.' })
    } finally {
      setCancelPending(false)
    }
  }

  async function reconcileCurrentCall(input: CallReconciliationForm) {
    if (
      refreshPending
      || cancelPending
      || reconcilePending
      || result.kind !== 'found'
      || result.state !== 'reconciliation_required'
      || result.attemptRef === undefined
      || result.effectGeneration === undefined
    ) return
    const source = input.source.trim()
    const evidenceRef = input.evidenceRef.trim()
    if (source.length === 0 || evidenceRef.length === 0) {
      setFeedback({ kind: 'error', message: 'Enter the evidence source and evidence reference before reconciling.' })
      return
    }
    setReconcilePending(true)
    setFeedback(undefined)
    try {
      const attemptIdentity = canonicalDigest({
        invocationRef: result.callRef,
        attemptRef: result.attemptRef,
        effectGeneration: result.effectGeneration,
        operationRef: result.toolRef,
        resolution: input.resolution,
        source,
        evidenceRef,
      })
      if (reconciliationAttemptRef.current?.identity !== attemptIdentity) {
        reconciliationAttemptRef.current = {
          identity: attemptIdentity,
          idempotencyKey: crypto.randomUUID(),
          observedAt: new Date().toISOString(),
        }
      }
      const attempt = reconciliationAttemptRef.current
      const material = {
        kind: 'action_invocation_reconciliation' as const,
        version: 1 as const,
        evidenceRef,
        source,
        invocationRef: result.callRef,
        attemptRef: result.attemptRef,
        effectGeneration: result.effectGeneration,
        operationRef: result.toolRef,
        resolution: input.resolution,
        observedAt: attempt.observedAt,
      }
      const recovery = await reconcile({
        data: {
          callRef: result.callRef,
          idempotencyKey: attempt.idempotencyKey,
          evidence: { ...material, digest: canonicalDigest(material) },
        },
      })
      reconciliationAttemptRef.current = undefined
      setResult(statusFromRecovery(recovery))
      setFeedback(reconcileFeedback(recovery))
      try {
        await router.invalidate()
      } catch (cause) {
        captureClientExceptionOnClient(cause)
        setFeedback({ kind: 'error', message: 'The reconciliation result was received, but current status could not be reloaded. The displayed result is retained.' })
      }
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setFeedback({ kind: 'error', message: 'The reconciliation source is unavailable. No new Call state is claimed.' })
    } finally {
      setReconcilePending(false)
    }
  }

  return (
    <CallStatusPage
      result={result}
      actions={{
        onRefresh: refreshCurrentStatus,
        refreshPending,
        onCancel: cancelCurrentCall,
        cancelPending,
        onReconcile: (input) => { void reconcileCurrentCall(input) },
        reconcilePending,
        ...(feedback === undefined ? {} : { feedback }),
      }}
    />
  )
}

export function CallStatusPage({
  result,
  actions,
}: Readonly<{ result: CallStatusPageResult; actions?: CallStatusPageActions }>) {
  if (result.kind === 'source_unavailable') return <StatusUnavailable result={result} {...(actions === undefined ? {} : { actions })} />
  if (result.kind === 'refused') return <StatusRefused result={result} {...(actions === undefined ? {} : { actions })} />
  if (result.kind === 'unchanged') return <StatusUnchanged result={result} {...(actions === undefined ? {} : { actions })} />
  return <StatusFound result={result} {...(actions === undefined ? {} : { actions })} />
}

function StatusUnchanged({
  result,
  actions,
}: Readonly<{
  result: Extract<CallStatusResult, { kind: 'unchanged' }>
  actions?: CallStatusPageActions
}>) {
  return (
    <AePublicPage>
      <article className="ae-rail grid gap-section pb-page">
        <AePageState
          state="pending"
          title="No status change"
          description={`Call ${result.callRef} remains at version ${result.version}.`}
          action={actions?.onRefresh === undefined ? undefined : (
            <Button
              type="button"
              className="min-h-touch"
              disabled={actions.refreshPending === true}
              onClick={() => { void actions.onRefresh?.() }}
            >
              {actions.refreshPending === true ? 'Checking…' : 'Check status'}
            </Button>
          )}
        />
      </article>
    </AePublicPage>
  )
}

function StatusFound({
  result,
  actions,
}: Readonly<{ result: FoundCallStatus; actions?: CallStatusPageActions }>) {
  const receiptView = projectCallReceipt(result)
  return (
    <AePublicPage>
      <article id="receipt" className="ae-rail grid scroll-mt-6 gap-section pb-page">
        <header className="grid gap-related">
          <div className="flex flex-wrap gap-intra">
            <Badge variant="outline">Receipt</Badge>
            <Badge variant={receiptView.complete ? 'success' : receiptView.issue === undefined ? 'secondary' : 'warning'}>{receiptView.statusLabel}</Badge>
          </div>
          <div className="grid gap-intra">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Call receipt</h1>
            <p className="max-w-3xl text-muted-foreground">{receiptView.statusDetail}</p>
          </div>
          <AeFactList
            facts={[
              { label: "Call reference", value: <Ref value={result.callRef} />, mono: true },
              {
                label: "Current Tool",
                value: (
                  <Link
                    to="/tools/$toolRef"
                    params={{ toolRef: result.toolRef }}
                    className="break-all font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {result.toolRef}
                  </Link>
                ),
              },
              { label: "Purchase status", value: purchaseStatusLabel(result) },
              { label: "Outcome record", value: outcomeRecordLabel(result) },
              { label: "Call state", value: machineLabel(result.state) },
              ...(result.attemptRef === undefined ? [] : [{ label: "Attempt reference", value: <Ref value={result.attemptRef} />, mono: true }]),
              ...(result.effectGeneration === undefined ? [] : [{ label: "Effect generation", value: String(result.effectGeneration) }]),
              ...(result.evidenceHash === undefined ? [] : [{ label: "Evidence hash", value: <Ref value={result.evidenceHash} />, mono: true }]),
            ]}
          />
        </header>
        <ReceiptTimeline stages={receiptView.stages} />
        {receiptView.issue === undefined ? null : <CallIssue issue={receiptView.issue} />}
        <CallRecoveryActions result={result} {...(actions === undefined ? {} : { actions })} />
        <CallSuggestedNextAction result={result} />

        <ReceiptMoneyFacts view={receiptView} />
        {result.result === undefined ? (
          <section className="grid gap-intra border-t border-border pt-section" aria-labelledby="current-result-title">
            <h2 id="current-result-title" className="text-xl font-semibold tracking-tight text-foreground">Current result</h2>
            <p className="text-muted-foreground">No canonical result is recorded yet. The state above remains authoritative.</p>
          </section>
        ) : <ResultDetails result={result.result} />}
        {receiptView.complete ? (
          <CallReuseActions
            key={receiptView.toolRef ?? receiptView.callRef}
            view={receiptView}
          />
        ) : null}
        <MachineReadableReceipt view={receiptView} />
      </article>
    </AePublicPage>
  )
}

function CallSuggestedNextAction({ result }: Readonly<{ result: FoundCallStatus }>) {
  if (result.state === 'terminal' || result.state === 'cancelled' || result.state === 'invalidated') return null
  const suggestedNextAction = nextActionForCallStatus({
    callRef: result.callRef,
    state: result.state,
  })
  return (
    <AeSection
      title="What can I do next?"
      description={suggestedNextAction.warning ?? 'Check this exact Call before taking another consequential action.'}
    >
      <AeCopyCommand compact label={suggestedNextAction.label} code={suggestedNextAction.command} />
    </AeSection>
  )
}

function ReceiptTimeline({ stages }: Readonly<{ stages: readonly CallReceiptStageView[] }>) {
  return (
    <section className="grid gap-related border-t border-border pt-section" aria-labelledby="receipt-progress-title">
      <div className="grid gap-intra">
        <h2 id="receipt-progress-title" className="text-xl font-semibold tracking-tight text-foreground">What happened</h2>
        <p className="text-sm text-muted-foreground">Recorded progress for this exact call. A pending stage is not claimed as complete.</p>
      </div>
      <ol className="grid overflow-hidden rounded-card border bg-card sm:grid-cols-2 lg:grid-cols-6">
        {stages.map((stageView, index) => (
          <li
            key={stageView.id}
            aria-current={stageView.state === 'current' ? 'step' : undefined}
            className="grid min-w-0 content-start gap-intra border-b p-gutter last:border-b-0 sm:border-e sm:[&:nth-child(even)]:border-e-0 lg:border-b-0 lg:[&:nth-child(even)]:border-e lg:last:border-e-0"
          >
            <div className="flex items-center gap-intra">
              <StageIcon state={stageView.state} />
              <span className="text-sm font-semibold text-foreground">{index + 1}. {stageView.label}</span>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{stageView.detail}</p>
            <span className="sr-only">Stage state: {machineLabel(stageView.state)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function StageIcon({ state }: Readonly<{ state: CallReceiptStageView['state'] }>) {
  if (state === 'complete') return <CheckCircle2Icon aria-hidden="true" className="size-4 shrink-0 text-success" />
  if (state === 'attention') return <AlertTriangleIcon aria-hidden="true" className="size-4 shrink-0 text-warning" />
  if (state === 'current') return <Clock3Icon aria-hidden="true" className="size-4 shrink-0 text-brand" />
  return <CircleIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
}

function CallIssue({ issue }: Readonly<{ issue: CallIssueView }>) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertTriangleIcon aria-hidden="true" />
      <AlertTitle>{issue.title}</AlertTitle>
      <AlertDescription>
        <AeFactList
          facts={[
            { label: "What happened", value: issue.whatHappened },
            { label: "Did money move?", value: issue.moneyMovement },
            { label: "What happens automatically", value: issue.automaticNext },
            { label: "What you can do", value: issue.userNext },
            { label: "Reference kept", value: <Ref value={issue.retainedReference} />, mono: true },
          ]}
        />
      </AlertDescription>
    </Alert>
  )
}

function ReceiptMoneyFacts({ view }: Readonly<{ view: CallReceiptView }>) {
  return (
    <AeSection
      title="Money before and after the call"
      description="Authorization is the pre-call ceiling. Usage is the post-call recorded amount. Missing facts stay missing."
    >
      <div className="grid gap-section">
        <div className="grid gap-related">
          <h3 className="text-sm font-medium text-foreground">Before</h3>
          <p className="text-sm text-muted-foreground">Quoted components and buyer authorization.</p>
          {view.receipt === undefined ? (
            <p className="text-sm text-muted-foreground">No public pre-call money receipt is attached to this record.</p>
          ) : <ReceiptAuthorizationFacts receipt={view.receipt} />}
        </div>
        <div className="grid gap-related">
          <h3 className="text-sm font-medium text-foreground">After</h3>
          <p className="text-sm text-muted-foreground">Recorded settlement, refund, or uncertainty.</p>
          {view.usage === undefined && view.receipt === undefined ? (
            <p className="text-sm text-muted-foreground">No post-call money fact is recorded yet.</p>
          ) : <ReceiptSettlementFacts usage={view.usage} receipt={view.receipt} />}
        </div>
      </div>
    </AeSection>
  )
}

function ReceiptAuthorizationFacts({ receipt }: Readonly<{ receipt: CallReceipt }>) {
  const commercialFacts = receipt.commercialModel === 'account_aud'
    ? [
        { label: "Buyer charge", value: formatCurrencyAmount(receipt.buyerCharge) },
        { label: "Service fee", value: formatCurrencyAmount(receipt.serviceFee) },
        { label: "Total buyer charge", value: formatCurrencyAmount(receipt.totalBuyerCharge) },
        { label: "Provider obligation", value: formatCurrencyAmount(receipt.providerObligation.amount) },
      ]
    : [
        { label: "Provider quote", value: formatCurrencyAmount(receipt.providerQuotedAmount) },
        { label: "Agentic Economy fee", value: formatCurrencyAmount(receipt.agenticEconomyFee) },
        { label: "Buyer authorized up to", value: formatCurrencyAmount(receipt.totalBuyerAuthorization) },
      ]
  return (
    <AeFactList
      facts={[
        ...commercialFacts,
        { label: "Price digest", value: <Ref value={receipt.priceDigest} />, mono: true },
      ]}
    />
  )
}

function ReceiptSettlementFacts({
  usage,
  receipt,
}: Readonly<{ usage: CallUsageSummary | undefined; receipt: CallReceipt | undefined }>) {
  const settlementTransactionHash = receipt?.commercialModel === 'account_aud'
    ? receipt.providerSettlement.transactionHash
    : receipt?.settlementTransactionHash
  return (
    <AeFactList
      facts={[
        ...(usage === undefined ? [] : [
          { label: "Recorded outcome", value: machineLabel(usage.chargeState) },
          { label: "Exact amount", value: formatCurrencyAmount(usage.amount) },
          { label: "Observed", value: <time dateTime={timestampIso(usage.observedAt)}>{formatUtcTimestamp(usage.observedAt)} UTC</time> },
          { label: "Usage reference", value: <Ref value={usage.usageRef} />, mono: true },
          ...(usage.transactionRef === undefined ? [] : [{ label: "Transaction reference", value: <Ref value={usage.transactionRef} />, mono: true }]),
          ...(usage.durationMs === undefined ? [] : [{ label: "Duration", value: `${usage.durationMs} ms` }]),
        ]),
        ...(receipt === undefined ? [] : [
          { label: "Receipt state", value: machineLabel(receipt.state) },
          { label: "Receipt reference", value: <Ref value={receipt.receiptRef} />, mono: true },
          { label: "Refund state", value: machineLabel(receipt.refundState ?? 'not recorded') },
          { label: "Loss state", value: machineLabel(receipt.lossState ?? 'not recorded') },
          ...(settlementTransactionHash === undefined ? [] : [{ label: "Settlement transaction", value: <Ref value={settlementTransactionHash} />, mono: true }]),
        ]),
      ]}
    />
  )
}

function CallReuseActions({ view }: Readonly<{ view: CallReceiptView }>) {
  const toolRef = view.toolRef
  if (toolRef === undefined) return null
  const priorInputJson = view.previousInput === undefined ? undefined : JSON.stringify(view.previousInput)
  const cliInput = priorInputJson === undefined
    ? '"$AE_INPUT_JSON"'
    : `'${priorInputJson.replaceAll("'", "'\\''")}'`
  const apiInput = priorInputJson ?? '$AE_INPUT_JSON'
  const cli = `ae call '${toolRef}' --input ${cliInput} --wait`
  const api = `curl -sS '$ORIGIN/api/v1/tools/call' \\
  -H "Authorization: Bearer $AE_API_KEY" \\
  -H 'content-type: application/json' \\
  --data "{\\"toolRef\\":\\"${toolRef}\\",\\"input\\":${apiInput.replaceAll('"', '\\"')},\\"idempotencyKey\\":\\"$AE_IDEMPOTENCY_KEY\\"}"`
  const inputInstruction = priorInputJson === undefined ? 'fresh input' : `this prior input as a starting point: ${priorInputJson}`
  const mcp = `Connect to $ORIGIN/mcp, initialize the session, list tools, then call ae_tool_call with toolRef=${toolRef}, ${inputInstruction}, and a new idempotencyKey.`
  const prompt = `Use Agentic Economy to inspect ${toolRef}. Reconfirm current terms and ${inputInstruction}. Ask me for any required approval. Create a new idempotency key, invoke the Tool once, follow its Call reference to a terminal result, and return the output with its receipt. Do not replay ${view.callRef} as a new Call.`
  return (
    <AeSection
      title="Use this capability again"
      description="A new run needs fresh input and a new idempotency key. The completed receipt above never becomes the identity for another call."
    >
      <div className="flex flex-wrap gap-intra">
        <Button asChild className="min-h-touch">
          <Link to="/tools/$toolRef" params={{ toolRef }}>Run again</Link>
        </Button>
        <Button asChild variant="outline" className="min-h-touch"><a href="#receipt">View receipt</a></Button>
      </div>
      {priorInputJson === undefined ? null : (
        <div className="grid gap-intra">
          <h3 className="text-sm font-medium text-foreground">Previous input</h3>
          <p className="text-sm text-muted-foreground">Owner-visible input from this Call. Reconfirm current terms before running it again.</p>
          <pre className="overflow-auto whitespace-pre-wrap break-words text-xs"><code>{JSON.stringify(view.previousInput, null, 2)}</code></pre>
        </div>
      )}
      <div className="grid gap-section">
        <ReuseCopy title="Copy as CLI" description="Run with the installed Agentic Economy CLI." label="CLI command" code={cli} />
        <ReuseCopy title="Copy as API request" description="Call the canonical authenticated HTTP boundary." label="API request" code={api} />
        <ReuseCopy title="Add to MCP" description="Give an MCP-capable agent the exact endpoint and Tool." label="MCP setup instruction" code={mcp} />
        <ReuseCopy title="Copy agent prompt" description="Hand the task to an agent without reusing this receipt identity." label="agent prompt" code={prompt} />
      </div>
    </AeSection>
  )
}

function ReuseCopy({ title, description, label, code }: Readonly<{ title: string; description: string; label: string; code: string }>) {
  return (
    <div className="grid gap-intra">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      <AeCopyCommand compact label={label} code={code} />
    </div>
  )
}

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

function CallRecoveryActions({
  result,
  actions,
}: Readonly<{ result: FoundCallStatus; actions?: CallStatusPageActions }>) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [resolution, setResolution] = useState<CallReconciliationForm['resolution']>('not_released')
  const [source, setSource] = useState('')
  const [evidenceRef, setEvidenceRef] = useState('')
  function submitReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    actions?.onReconcile?.({ resolution, source, evidenceRef })
  }
  const canCancelNow = result.state === 'authorized' || result.state === 'retryable' || result.state === 'leased'
  const canReconcileNow = result.state === 'reconciliation_required'
    && result.attemptRef !== undefined
    && result.effectGeneration !== undefined
    && actions?.onReconcile !== undefined
  const hasReconciliationBlocker = result.state === 'reconciliation_required'
    && (result.attemptRef === undefined || result.effectGeneration === undefined)
  const canRefreshNow = canRefreshStatus(result) && actions?.onRefresh !== undefined
  const recoveryPending = actions?.refreshPending === true
    || actions?.cancelPending === true
    || actions?.reconcilePending === true
  if (!canRefreshNow && !canCancelNow && !canReconcileNow && !hasReconciliationBlocker && actions?.feedback === undefined) return null

  return (
    <section className="grid gap-related border-t border-border pt-section" aria-labelledby="recovery-actions-title">
      <div className="grid gap-intra">
        <h2 id="recovery-actions-title" className="text-xl font-semibold tracking-tight text-foreground">Resolve this Call</h2>
        <p className="text-sm text-muted-foreground">Use only the action supported by the recorded state. Each action refreshes this exact Call.</p>
      </div>
      <StatusFeedback feedback={actions?.feedback} callRef={result.callRef} />
      {hasReconciliationBlocker ? (
        <Alert>
          <AlertTitle>Reconciliation cannot be submitted</AlertTitle>
          <AlertDescription>
            This record does not expose the attempt reference and effect generation required by the reconciliation contract. No evidence is fabricated or submitted from this browser.
          </AlertDescription>
        </Alert>
      ) : null}
      {canReconcileNow ? (
        <form onSubmit={submitReconciliation}>
          <FieldGroup className="max-w-xl">
            <Field data-disabled={actions?.reconcilePending || undefined}>
              <FieldLabel htmlFor="reconciliation-resolution">Observed provider outcome</FieldLabel>
              <Select
                value={resolution}
                onValueChange={(value) => setResolution(value as CallReconciliationForm['resolution'])}
                disabled={recoveryPending}
                required
              >
                <SelectTrigger id="reconciliation-resolution" className="min-h-touch w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="not_released">Effect not released</SelectItem>
                    <SelectItem value="released">Effect released</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field data-disabled={actions?.reconcilePending || undefined}>
              <FieldLabel htmlFor="reconciliation-source">Evidence source</FieldLabel>
              <Input
                id="reconciliation-source"
                maxLength={300}
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="Provider control plane"
                disabled={recoveryPending}
                required
                className="min-h-touch"
              />
            </Field>
            <Field data-disabled={actions?.reconcilePending || undefined}>
              <FieldLabel htmlFor="reconciliation-reference">Evidence reference</FieldLabel>
              <Input
                id="reconciliation-reference"
                maxLength={300}
                value={evidenceRef}
                onChange={(event) => setEvidenceRef(event.target.value)}
                placeholder="Provider event or incident reference"
                disabled={recoveryPending}
                required
                className="min-h-touch"
              />
            </Field>
            <Field orientation="horizontal">
              <Button type="submit" className="min-h-touch" disabled={recoveryPending}>
                {actions?.reconcilePending === true ? 'Reconciling Call…' : 'Submit reconciliation'}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      ) : null}
      {canRefreshNow || (canCancelNow && actions?.onCancel !== undefined) ? (
        <div className="flex flex-wrap gap-intra">
          {canRefreshNow ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-touch"
              disabled={actions?.refreshPending === true || actions?.cancelPending === true || actions?.reconcilePending === true}
              onClick={() => { void actions?.onRefresh?.() }}
            >
              {actions?.refreshPending === true ? 'Refreshing current status…' : 'Refresh current status'}
            </Button>
          ) : null}
          {canCancelNow && actions?.onCancel !== undefined ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-touch"
              disabled={actions?.cancelPending === true || actions?.refreshPending === true || actions?.reconcilePending === true}
              onClick={() => setCancelDialogOpen(true)}
            >
              Cancel Call
            </Button>
          ) : null}
        </div>
      ) : null}
      <AeConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title="Cancel this Call?"
        description="Cancellation is explicit and may be refused if the external effect has already started."
        confirmLabel="Confirm cancellation"
        cancelLabel="Keep Call"
        confirmVariant="destructive"
        pending={actions?.cancelPending === true}
        onConfirm={async () => {
          await actions?.onCancel?.()
          setCancelDialogOpen(false)
        }}
      />
    </section>
  )
}


function statusFromRecovery(result: CallRecoveryResult): CallStatusPageResult {
  if (result.kind !== 'reconciliation_required') return result
  return {
    kind: 'found',
    callRef: result.callRef,
    version: Date.parse(result.evidence.requiredAt),
    toolRef: result.toolRef,
    state: 'reconciliation_required',
    attemptRef: result.evidence.attemptRef,
    effectGeneration: result.evidence.effectGeneration,
  }
}

function refreshFeedback(result: CallStatusResult): CallStatusPageActions['feedback'] {
  if (result.kind === 'found') {
    return { kind: 'success', message: `Current status refreshed. The current state is ${machineLabel(result.state)}.` }
  }
  if (result.kind === 'unchanged') {
    return { kind: 'success', message: `No status change. The Call remains at version ${result.version}.` }
  }
  return {
    kind: 'error',
    message: `The status source refused the refresh (${machineLabel(result.code)}). No current state is claimed.`,
  }
}

function cancelFeedback(result: CallRecoveryResult): CallStatusPageActions['feedback'] {
  if (result.kind === 'reconciliation_required') {
    return {
      kind: 'error',
      message: 'Cancellation could not complete because the external effect may have started. Reconciliation evidence is required before retrying.',
    }
  }
  if (result.kind === 'refused') {
    return { kind: 'error', message: recoveryRefusalMessage(result.code) }
  }
  if (result.kind === 'unchanged') {
    return { kind: 'success', message: `No status change. The Call remains at version ${result.version}.` }
  }
  if (result.state === 'cancelled') {
    return { kind: 'success', message: 'Cancellation was recorded. The current status was refreshed.' }
  }
  return { kind: 'error', message: `Cancellation was not accepted. Current state remains ${machineLabel(result.state)}.` }
}
function reconcileFeedback(result: CallRecoveryResult): CallStatusPageActions['feedback'] {
  if (result.kind === 'refused') return { kind: 'error', message: `Reconciliation was refused (${machineLabel(result.code)}). No state change is claimed.` }
  if (result.kind === 'reconciliation_required') return { kind: 'error', message: 'Reconciliation remains required. The submitted evidence was not accepted.' }
  if (result.kind === 'unchanged') return { kind: 'success', message: `No status change. The Call remains at version ${result.version}.` }
  if (result.state === 'terminal' || result.state === 'retryable') {
    return { kind: 'success', message: `Reconciliation recorded. Current state is ${machineLabel(result.state)} and the status was refreshed.` }
  }
  return { kind: 'error', message: `Reconciliation did not complete. Current state remains ${machineLabel(result.state)}.` }
}


function recoveryRefusalMessage(code: string): string {
  if (code === 'invocation_not_found') return 'This Call is no longer available to the signed-in owner.'
  if (code === 'invocation_runtime_unavailable') return 'The Call source is unavailable. No new state is claimed.'
  if (code === 'grant_generation_stale' || code === 'grant_revoked' || code === 'grant_expired') {
    return 'The issuing access grant changed, but owner recovery remains bound to this Call. Refresh the current record.'
  }
  return `The cancellation was refused (${machineLabel(code)}). No state change is claimed.`
}


function ResultDetails({ result }: Readonly<{ result: CallResult }>) {
  return (
    <AeSection
      title="Current result"
      description="Canonical result facts as recorded, without changing the current state above."
    >
      <dl className="grid gap-related sm:grid-cols-2">
        <Fact label="Result kind" value={machineLabel(result.kind)} />
        {'callRef' in result ? <Fact label="Result Call reference"><Ref value={result.callRef} /></Fact> : null}
        {result.toolRef === undefined ? null : <Fact label="Result Tool reference"><Ref value={result.toolRef} /></Fact>}
        {result.kind === 'completed' ? (
          <>
            <Fact label="Evidence hash"><Ref value={result.evidenceHash} /></Fact>
            <Fact label="Result charge state" value={machineLabel(result.usage.chargeState)} />
            <Fact label="Result exact amount" value={formatCurrencyAmount(result.usage.amount)} />
            <Fact label="Result usage reference"><Ref value={result.usage.usageRef} /></Fact>
            <Fact label="Result usage observed"><time dateTime={timestampIso(result.usage.observedAt)}>{formatUtcTimestamp(result.usage.observedAt)} UTC</time></Fact>
            <Fact label="Result price digest"><Ref value={result.usage.priceDigest} /></Fact>
            {result.usage.transactionRef === undefined ? null : <Fact label="Result transaction reference"><Ref value={result.usage.transactionRef} /></Fact>}
            {result.usage.durationMs === undefined ? null : <Fact label="Result duration" value={`${result.usage.durationMs} ms`} />}
          </>
        ) : result.kind === 'pending' ? (
          <Fact label="Retry after" value={`${result.retryAfterMs} ms`} />
        ) : result.kind === 'needs_authority' ? (
          <>
            <Fact label="Authority kind" value={machineLabel(result.authorityRequest.kind)} />
            <Fact label="Consequence" value={machineLabel(result.authorityRequest.consequence)} />
            <Fact label="Retry class" value={machineLabel(result.authorityRequest.retryClass)} />
            {result.authorityRequest.maximumSpend === undefined ? null : <Fact label="Maximum spend" value={formatCurrencyAmount(result.authorityRequest.maximumSpend)} />}
            <Fact label="Data fields" value={result.authorityRequest.dataFields.length === 0 ? 'None' : result.authorityRequest.dataFields.join(', ')} />
            {result.authorityRequest.expiresAt === undefined ? null : <Fact label="Authority expires" value={result.authorityRequest.expiresAt} />}
          </>
        ) : result.kind === 'reconciliation_required' ? (
          <>
            <Fact label="Attempt reference"><Ref value={result.evidence.attemptRef} /></Fact>
            <Fact label="Effect generation" value={String(result.evidence.effectGeneration)} />
            <Fact label="Required at" value={result.evidence.requiredAt} />
            <Fact label="Retry policy" value={machineLabel(result.evidence.retry)} />
            <Fact label="Evidence source" value={result.evidence.evidenceSource} />
          </>
        ) : (
          <>
            <Fact label="Code" value={machineLabel(result.code)} />
            <Fact label="Retryable" value={result.retryable ? 'Yes' : 'No'} />
            {result.nextAction === undefined ? null : <Fact label="Next action" value={result.nextAction} />}
          </>
        )}
      </dl>
      {result.kind === 'completed' ? (
        <div className="grid min-w-0 gap-intra">
          <h3 className="text-base font-semibold text-foreground">Output</h3>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-card bg-muted p-gutter text-xs text-foreground"><code>{JSON.stringify(result.output, null, 2)}</code></pre>
        </div>
      ) : null}
    </AeSection>
  )
}

function StatusRefused({
  result,
  actions,
}: Readonly<{
  result: Extract<CallStatusResult, { kind: 'refused' }>
  actions?: CallStatusPageActions
}>) {
  const canRetry = result.retryable && actions?.onRefresh !== undefined
  const receiptView = projectCallReceipt(result)
  return (
    <AePublicPage>
      <section id="receipt" className="ae-rail grid scroll-mt-6 gap-section pb-page">
        <div className="grid gap-related">
          <Badge variant="warning" className="w-fit">{receiptView.statusLabel}</Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Call receipt</h1>
          <p className="text-muted-foreground">{receiptView.statusDetail}</p>
          <Ref value={result.callRef} />
          {result.code === 'invocation_not_found' ? (
            <StatusSignInAction callRef={result.callRef} />
          ) : canRetry && actions !== undefined ? (
            <RefreshStatusButton actions={actions} />
          ) : null}
          <StatusFeedback feedback={actions?.feedback} callRef={result.callRef} />
        </div>
        <ReceiptTimeline stages={receiptView.stages} />
        {receiptView.issue === undefined ? null : <CallIssue issue={receiptView.issue} />}
        <ReceiptMoneyFacts view={receiptView} />
        <AeSection title="Refusal" description="The server response is shown without inventing Call state.">
          <AeFactList
            facts={[
              { label: "Code", value: machineLabel(result.code) },
              { label: "Retryable", value: result.retryable ? 'Yes' : 'No' },
              ...(result.nextAction === undefined ? [] : [{ label: "Next action", value: result.nextAction }]),
            ]}
          />
        </AeSection>
        <MachineReadableReceipt view={receiptView} />
      </section>
    </AePublicPage>
  )
}

function StatusUnavailable({
  result,
  actions,
}: Readonly<{
  result: Extract<CallStatusPageResult, { kind: 'source_unavailable' }>
  actions?: CallStatusPageActions
}>) {
  const receiptView = projectCallReceipt(result)
  return (
    <AePublicPage>
      <section id="receipt" className="ae-rail grid scroll-mt-6 gap-section pb-page">
        <div className="grid gap-related">
          <Badge variant="warning" className="w-fit">Receipt unavailable</Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Call receipt</h1>
          <p className="text-muted-foreground">{receiptView.statusDetail}</p>
          <Ref value={result.callRef} />
          {actions?.onRefresh === undefined ? null : <RefreshStatusButton actions={actions} />}
          <StatusFeedback feedback={actions?.feedback} callRef={result.callRef} />
        </div>
        <ReceiptTimeline stages={receiptView.stages} />
        {receiptView.issue === undefined ? null : <CallIssue issue={receiptView.issue} />}
        <ReceiptMoneyFacts view={receiptView} />
        <MachineReadableReceipt view={receiptView} />
      </section>
    </AePublicPage>
  )
}

function RefreshStatusButton({ actions }: Readonly<{ actions: CallStatusPageActions }>) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-touch w-fit"
      disabled={actions.refreshPending === true}
      onClick={() => { void actions.onRefresh?.() }}
    >
      {actions.refreshPending === true ? 'Refreshing current status…' : 'Refresh current status'}
    </Button>
  )
}

function StatusFeedback({
  feedback,
  callRef,
}: Readonly<{ feedback?: CallStatusPageActions['feedback']; callRef: string }>) {
  if (feedback === undefined) return null
  if (feedback.kind === 'error') {
    return (
      <CallIssue issue={{
        title: 'The requested receipt action did not complete',
        whatHappened: feedback.message,
        moneyMovement: 'This failed action does not prove that money moved. The recorded before-and-after facts on this receipt remain authoritative.',
        automaticNext: 'No replacement Call was created automatically.',
        userNext: 'Follow only the recovery action supported by the current receipt state, or reload this same receipt.',
        retainedReference: callRef,
      }} />
    )
  }
  return (
    <Alert role="status">
      <AlertTitle>Status refreshed</AlertTitle>
      <AlertDescription>{feedback.message}</AlertDescription>
    </Alert>
  )
}

function StatusSignInAction({ callRef }: Readonly<{ callRef: string }>) {
  const redirect = `/calls/${encodeURIComponent(callRef)}`
  return (
    <Button asChild className="min-h-touch w-fit">
      <Link to="/sign-in/$" params={{ _splat: '' }} search={{ redirect }}>
        Sign in to view current status
      </Link>
    </Button>
  )
}

function CallStatusPending() {
  return (
    <AePublicPage>
      <section className="ae-rail py-page" aria-busy="true" aria-live="polite">
        <h1 className="sr-only">Call receipt</h1>
        <p className="text-muted-foreground">Checking the exact current owner-scoped Call receipt…</p>
      </section>
    </AePublicPage>
  )
}

function CallStatusError() {
  const { callRef } = Route.useParams()
  return <StatusUnavailable result={{ kind: 'source_unavailable', callRef }} />
}

function Fact({ label, value, children }: Readonly<{ label: string; value?: string; children?: ReactNode }>) {
  return <div className="grid min-w-0 gap-intra"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="break-words text-sm text-foreground">{children ?? value}</dd></div>
}

function Ref({ value }: Readonly<{ value: string }>) {
  return <AeCopyReference label="reference" value={value} />
}

function canRefreshStatus(result: CallStatusPageResult): boolean {
  if (result.kind === 'source_unavailable') return true
  if (result.kind === 'refused') return result.retryable
  if (result.kind === 'unchanged') return true
  return result.state !== 'terminal' && result.state !== 'cancelled' && result.state !== 'invalidated'
}

function machineLabel(value: string): string {
  const label = value.replaceAll('_', ' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}
