import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { AlertTriangleIcon, CheckCircle2Icon, CircleIcon, Clock3Icon } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
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
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { formatUtcTimestamp, timestampIso } from '@/lib/ui/format-time'
import {
  cancelOwnerInvocationServer,
  readOwnerInvocationStatusServer,
  reconcileOwnerInvocationServer,
} from '@/modules/capability-execution/operation-recovery.functions'
import type {
  OperationInvokeReceipt,
  OperationInvokeResult,
  OperationInvokeUsageSummary,
} from '@/modules/capability-execution/operation-invoke-contracts'
import {
  projectInvocationReceipt,
  type InvocationIssueView,
  type InvocationReceiptStageView,
  type InvocationReceiptView,
} from '@/modules/capability-execution/invocation-receipt-view'
import type {
  OperationInvokeRecoveryResult,
  OperationInvokeStatusResult,
} from '@/modules/capability-execution/operation-recovery-contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { formatCurrencyAmount } from '@/modules/money/public'

export type InvocationStatusPageResult = OperationInvokeStatusResult | Readonly<{
  kind: 'source_unavailable'
  invocationRef: string
}>

export type InvocationReconciliationForm = Readonly<{
  resolution: 'not_released' | 'released'
  source: string
  evidenceRef: string
}>

export type InvocationStatusPageActions = Readonly<{
  onRefresh?: () => void | Promise<void>
  refreshPending?: boolean
  onCancel?: () => void | Promise<void>
  cancelPending?: boolean
  onReconcile?: (input: InvocationReconciliationForm) => void
  reconcilePending?: boolean
  feedback?: Readonly<{ kind: 'success' | 'error'; message: string }>
}>

type FoundInvocationStatus = Extract<OperationInvokeStatusResult, { kind: 'found' }>

export const Route = createFileRoute('/operations/invocations/$invocationRef')({
  loader: ({ params }) => readOwnerInvocationStatusServer({ data: { invocationRef: params.invocationRef } })
    .catch((): InvocationStatusPageResult => ({
      kind: 'source_unavailable',
      invocationRef: params.invocationRef,
    })),
  head: () => ({ meta: [
    { title: 'Invocation receipt | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  pendingComponent: InvocationStatusPending,
  errorComponent: InvocationStatusError,
  component: InvocationStatusRoute,
})

function InvocationStatusRoute() {
  const loadedResult = Route.useLoaderData()
  const [result, setResult] = useState<InvocationStatusPageResult>(loadedResult)
  const [refreshPending, setRefreshPending] = useState(false)
  const [cancelPending, setCancelPending] = useState(false)
  const [reconcilePending, setReconcilePending] = useState(false)
  const [feedback, setFeedback] = useState<InvocationStatusPageActions['feedback']>()
  const readStatus = useServerFn(readOwnerInvocationStatusServer)
  const cancel = useServerFn(cancelOwnerInvocationServer)
  const reconcile = useServerFn(reconcileOwnerInvocationServer)
  const router = useRouter()
  useEffect(() => {
    setResult(loadedResult)
  }, [loadedResult])

  async function refreshCurrentStatus() {
    if (refreshPending || cancelPending || reconcilePending || !canRefreshStatus(result)) return
    setRefreshPending(true)
    setFeedback(undefined)
    try {
      const refreshed = await readStatus({ data: { invocationRef: result.invocationRef } })
      setResult(refreshed)
      setFeedback(refreshFeedback(refreshed))
    } catch {
      setFeedback({ kind: 'error', message: 'The current status source is unavailable. The displayed state has not changed.' })
    } finally {
      setRefreshPending(false)
    }
  }

  async function cancelCurrentInvocation() {
    if (refreshPending || cancelPending || reconcilePending || result.kind !== 'found' || !(result.state === 'authorized' || result.state === 'retryable' || result.state === 'leased')) return
    setCancelPending(true)
    setFeedback(undefined)
    try {
      const recovery = await cancel({
        data: {
          invocationRef: result.invocationRef,
          idempotencyKey: crypto.randomUUID(),
        },
      })
      setResult(statusFromRecovery(recovery))
      setFeedback(cancelFeedback(recovery))
      await router.invalidate()
    } catch {
      setFeedback({ kind: 'error', message: 'The cancellation source is unavailable. No new invocation state is claimed.' })
    } finally {
      setCancelPending(false)
    }
  }

  async function reconcileCurrentInvocation(input: InvocationReconciliationForm) {
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
      const material = {
        kind: 'action_invocation_reconciliation' as const,
        version: 1 as const,
        evidenceRef,
        source,
        invocationRef: result.invocationRef,
        attemptRef: result.attemptRef,
        effectGeneration: result.effectGeneration,
        operationRef: result.operationRef,
        resolution: input.resolution,
        observedAt: new Date().toISOString(),
      }
      const recovery = await reconcile({
        data: {
          invocationRef: result.invocationRef,
          idempotencyKey: crypto.randomUUID(),
          evidence: { ...material, digest: canonicalDigest(material) },
        },
      })
      setResult(statusFromRecovery(recovery))
      setFeedback(reconcileFeedback(recovery))
      await router.invalidate()
    } catch {
      setFeedback({ kind: 'error', message: 'The reconciliation source is unavailable. No new invocation state is claimed.' })
    } finally {
      setReconcilePending(false)
    }
  }

  return (
    <InvocationStatusPage
      result={result}
      actions={{
        onRefresh: refreshCurrentStatus,
        refreshPending,
        onCancel: cancelCurrentInvocation,
        cancelPending,
        onReconcile: (input) => { void reconcileCurrentInvocation(input) },
        reconcilePending,
        ...(feedback === undefined ? {} : { feedback }),
      }}
    />
  )
}

export function InvocationStatusPage({
  result,
  actions,
}: Readonly<{ result: InvocationStatusPageResult; actions?: InvocationStatusPageActions }>) {
  if (result.kind === 'source_unavailable') return <StatusUnavailable result={result} {...(actions === undefined ? {} : { actions })} />
  if (result.kind === 'refused') return <StatusRefused result={result} {...(actions === undefined ? {} : { actions })} />
  return <StatusFound result={result} {...(actions === undefined ? {} : { actions })} />
}

function StatusFound({
  result,
  actions,
}: Readonly<{ result: FoundInvocationStatus; actions?: InvocationStatusPageActions }>) {
  const receiptView = projectInvocationReceipt(result)
  return (
    <AePublicShell>
      <article id="receipt" className="ae-rail grid scroll-mt-6 gap-8 pb-page">
        <header className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Receipt</Badge>
            <Badge variant={receiptView.complete ? 'success' : receiptView.issue === undefined ? 'secondary' : 'warning'}>{receiptView.statusLabel}</Badge>
          </div>
          <div className="grid gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Invocation receipt</h1>
            <p className="max-w-3xl text-muted-foreground">{receiptView.statusDetail}</p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Fact label="Invocation reference"><Ref value={result.invocationRef} /></Fact>
            <Fact label="Current Operation">
              <Link
                to="/operations/$operationRef"
                params={{ operationRef: result.operationRef }}
                className="break-all font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {result.operationRef}
              </Link>
            </Fact>
            <Fact label="State" value={machineLabel(result.state)} />
            {result.attemptRef === undefined ? null : <Fact label="Attempt reference"><Ref value={result.attemptRef} /></Fact>}
            {result.effectGeneration === undefined ? null : <Fact label="Effect generation" value={String(result.effectGeneration)} />}
            {result.evidenceHash === undefined ? null : <Fact label="Evidence hash"><Ref value={result.evidenceHash} /></Fact>}
          </dl>
        </header>
        <ReceiptTimeline stages={receiptView.stages} />
        {receiptView.issue === undefined ? null : <InvocationIssue issue={receiptView.issue} />}
        <InvocationRecoveryActions result={result} {...(actions === undefined ? {} : { actions })} />

        <ReceiptMoneyFacts view={receiptView} />
        {result.result === undefined ? (
          <section className="grid gap-2 border-t border-border pt-8" aria-labelledby="current-result-title">
            <h2 id="current-result-title" className="text-xl font-semibold tracking-tight text-foreground">Current result</h2>
            <p className="text-muted-foreground">No canonical result is recorded yet. The state above remains authoritative.</p>
          </section>
        ) : <ResultDetails result={result.result} />}
        {receiptView.complete ? (
          <InvocationReuseActions
            key={receiptView.operationRef ?? receiptView.invocationRef}
            view={receiptView}
          />
        ) : null}
        <MachineReadableReceipt view={receiptView} />
      </article>
    </AePublicShell>
  )
}

function ReceiptTimeline({ stages }: Readonly<{ stages: readonly InvocationReceiptStageView[] }>) {
  return (
    <section className="grid gap-3 border-t border-border pt-6" aria-labelledby="receipt-progress-title">
      <div className="grid gap-1">
        <h2 id="receipt-progress-title" className="text-xl font-semibold tracking-tight text-foreground">What happened</h2>
        <p className="text-sm text-muted-foreground">Recorded progress for this exact call. A pending stage is not claimed as complete.</p>
      </div>
      <ol className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2 lg:grid-cols-6">
        {stages.map((stageView, index) => (
          <li
            key={stageView.id}
            aria-current={stageView.state === 'current' ? 'step' : undefined}
            className="grid min-w-0 content-start gap-2 border-b p-3 last:border-b-0 sm:border-r sm:[&:nth-child(even)]:border-r-0 lg:border-b-0 lg:[&:nth-child(even)]:border-r lg:last:border-r-0"
          >
            <div className="flex items-center gap-2">
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

function StageIcon({ state }: Readonly<{ state: InvocationReceiptStageView['state'] }>) {
  if (state === 'complete') return <CheckCircle2Icon aria-hidden="true" className="size-4 shrink-0 text-success" />
  if (state === 'attention') return <AlertTriangleIcon aria-hidden="true" className="size-4 shrink-0 text-warning" />
  if (state === 'current') return <Clock3Icon aria-hidden="true" className="size-4 shrink-0 text-brand" />
  return <CircleIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
}

function InvocationIssue({ issue }: Readonly<{ issue: InvocationIssueView }>) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertTriangleIcon aria-hidden="true" />
      <AlertTitle>{issue.title}</AlertTitle>
      <AlertDescription>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Fact label="What happened" value={issue.whatHappened} />
          <Fact label="Did money move?" value={issue.moneyMovement} />
          <Fact label="What happens automatically" value={issue.automaticNext} />
          <Fact label="What you can do" value={issue.userNext} />
          <Fact label="Reference kept"><Ref value={issue.retainedReference} /></Fact>
        </dl>
      </AlertDescription>
    </Alert>
  )
}

function ReceiptMoneyFacts({ view }: Readonly<{ view: InvocationReceiptView }>) {
  return (
    <section className="grid gap-5 border-t border-border pt-6" aria-labelledby="receipt-money-title">
      <div className="grid gap-1">
        <h2 id="receipt-money-title" className="text-xl font-semibold tracking-tight text-foreground">Money before and after the call</h2>
        <p className="text-sm text-muted-foreground">Authorization is the pre-call ceiling. Usage is the post-call recorded amount. Missing facts stay missing.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <h3 className="font-semibold text-foreground">Before</h3>
            <CardDescription>Quoted components and buyer authorization.</CardDescription>
          </CardHeader>
          <CardContent>
            {view.receipt === undefined ? (
              <p className="text-sm text-muted-foreground">No public pre-call money receipt is attached to this record.</p>
            ) : <ReceiptAuthorizationFacts receipt={view.receipt} />}
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <h3 className="font-semibold text-foreground">After</h3>
            <CardDescription>Recorded settlement, refund, or uncertainty.</CardDescription>
          </CardHeader>
          <CardContent>
            {view.usage === undefined && view.receipt === undefined ? (
              <p className="text-sm text-muted-foreground">No post-call money fact is recorded yet.</p>
            ) : <ReceiptSettlementFacts usage={view.usage} receipt={view.receipt} />}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function ReceiptAuthorizationFacts({ receipt }: Readonly<{ receipt: OperationInvokeReceipt }>) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <Fact label="Provider quote" value={formatCurrencyAmount(receipt.providerQuotedAmount)} />
      <Fact label="Agentic Economy fee" value={formatCurrencyAmount(receipt.agenticEconomyFee)} />
      <Fact label="Buyer authorized up to" value={formatCurrencyAmount(receipt.totalBuyerAuthorization)} />
      <Fact label="Price digest"><Ref value={receipt.priceDigest} /></Fact>
    </dl>
  )
}

function ReceiptSettlementFacts({
  usage,
  receipt,
}: Readonly<{ usage: OperationInvokeUsageSummary | undefined; receipt: OperationInvokeReceipt | undefined }>) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {usage === undefined ? null : (
        <>
          <Fact label="Recorded outcome" value={machineLabel(usage.chargeState)} />
          <Fact label="Exact amount" value={formatCurrencyAmount(usage.amount)} />
          <Fact label="Observed"><time dateTime={timestampIso(usage.observedAt)}>{formatUtcTimestamp(usage.observedAt)} UTC</time></Fact>
          <Fact label="Usage reference"><Ref value={usage.usageRef} /></Fact>
          {usage.transactionRef === undefined ? null : <Fact label="Transaction reference"><Ref value={usage.transactionRef} /></Fact>}
          {usage.durationMs === undefined ? null : <Fact label="Duration" value={`${usage.durationMs} ms`} />}
        </>
      )}
      {receipt === undefined ? null : (
        <>
          <Fact label="Receipt state" value={machineLabel(receipt.state)} />
          <Fact label="Receipt reference"><Ref value={receipt.receiptRef} /></Fact>
          <Fact label="Refund state" value={machineLabel(receipt.refundState ?? 'not recorded')} />
          <Fact label="Loss state" value={machineLabel(receipt.lossState ?? 'not recorded')} />
          {receipt.settlementTransactionHash === undefined ? null : <Fact label="Settlement transaction"><Ref value={receipt.settlementTransactionHash} /></Fact>}
        </>
      )}
    </dl>
  )
}

function InvocationReuseActions({ view }: Readonly<{ view: InvocationReceiptView }>) {
  const operationRef = view.operationRef
  if (operationRef === undefined) return null
  const priorInputJson = view.previousInput === undefined ? undefined : JSON.stringify(view.previousInput)
  const cliInput = priorInputJson === undefined
    ? '"$AE_INPUT_JSON"'
    : `'${priorInputJson.replaceAll("'", "'\\''")}'`
  const apiInput = priorInputJson ?? '$AE_INPUT_JSON'
  const cli = `ae call '${operationRef}' --input ${cliInput} --wait`
  const api = `curl -sS '$ORIGIN/api/v1/operations/call' \\
  -H "Authorization: Bearer $AE_API_KEY" \\
  -H 'content-type: application/json' \\
  --data "{\\"operationRef\\":\\"${operationRef}\\",\\"input\\":${apiInput.replaceAll('"', '\\"')},\\"idempotencyKey\\":\\"$AE_IDEMPOTENCY_KEY\\"}"`
  const inputInstruction = priorInputJson === undefined ? 'fresh input' : `this prior input as a starting point: ${priorInputJson}`
  const mcp = `Connect to $ORIGIN/mcp, initialize the session, list tools, then call ae_operation_invoke with operationRef=${operationRef}, ${inputInstruction}, and a new idempotencyKey.`
  const prompt = `Use Agentic Economy to inspect ${operationRef}. Reconfirm current terms and ${inputInstruction}. Ask me for any required approval. Create a new idempotency key, invoke the Operation once, follow its invocation reference to a terminal result, and return the output with its receipt. Do not replay ${view.invocationRef} as a new call.`
  return (
    <section className="grid gap-4 border-t border-border pt-6" aria-labelledby="reuse-title">
      <div className="grid gap-1">
        <h2 id="reuse-title" className="text-xl font-semibold tracking-tight text-foreground">Use this capability again</h2>
        <p className="text-sm text-muted-foreground">A new run needs fresh input and a new idempotency key. The completed receipt above never becomes the identity for another call.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild className="min-h-11">
          <Link to="/operations/$operationRef" params={{ operationRef }}>Run again</Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11"><a href="#receipt">View receipt</a></Button>
      </div>
      {priorInputJson === undefined ? null : (
        <Card className="shadow-none">
          <CardHeader>
            <h3 className="font-semibold text-foreground">Previous input</h3>
            <CardDescription>Owner-visible input from this invocation. Reconfirm current terms before running it again.</CardDescription>
          </CardHeader>
          <CardContent><pre className="overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs"><code>{JSON.stringify(view.previousInput, null, 2)}</code></pre></CardContent>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <ReuseCopy title="Copy as CLI" description="Run with the installed Agentic Economy CLI." label="CLI command" code={cli} />
        <ReuseCopy title="Copy as API request" description="Call the canonical authenticated HTTP boundary." label="API request" code={api} />
        <ReuseCopy title="Add to MCP" description="Give an MCP-capable agent the exact endpoint and Operation." label="MCP setup instruction" code={mcp} />
        <ReuseCopy title="Copy agent prompt" description="Hand the task to an agent without reusing this receipt identity." label="agent prompt" code={prompt} />
      </div>
    </section>
  )
}

function ReuseCopy({ title, description, label, code }: Readonly<{ title: string; description: string; label: string; code: string }>) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <h3 className="font-semibold text-foreground">{title}</h3>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent><AeCopyCommand compact label={label} code={code} /></CardContent>
    </Card>
  )
}

function MachineReadableReceipt({ view }: Readonly<{ view: InvocationReceiptView }>) {
  return (
    <details className="rounded-lg border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        Machine-readable receipt
      </summary>
      <div className="border-t p-4">
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-xs text-foreground"><code>{JSON.stringify(view, null, 2)}</code></pre>
      </div>
    </details>
  )
}

function InvocationRecoveryActions({
  result,
  actions,
}: Readonly<{ result: FoundInvocationStatus; actions?: InvocationStatusPageActions }>) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [resolution, setResolution] = useState<InvocationReconciliationForm['resolution']>('not_released')
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
    <section className="grid gap-3 border-t border-border pt-6" aria-labelledby="recovery-actions-title">
      <div className="grid gap-1">
        <h2 id="recovery-actions-title" className="text-xl font-semibold tracking-tight text-foreground">Resolve this invocation</h2>
        <p className="text-sm text-muted-foreground">Use only the action supported by the recorded state. Each action refreshes this exact invocation.</p>
      </div>
      <StatusFeedback feedback={actions?.feedback} invocationRef={result.invocationRef} />
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
                onValueChange={(value) => setResolution(value as InvocationReconciliationForm['resolution'])}
                disabled={recoveryPending}
                required
              >
                <SelectTrigger id="reconciliation-resolution" className="w-full">
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
              />
            </Field>
            <Field orientation="horizontal">
              <Button type="submit" disabled={recoveryPending}>
                {actions?.reconcilePending === true ? 'Reconciling invocation…' : 'Submit reconciliation'}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      ) : null}
      {canRefreshNow || (canCancelNow && actions?.onCancel !== undefined) ? (
        <div className="flex flex-wrap gap-2">
          {canRefreshNow ? (
            <Button
              type="button"
              variant="outline"
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
              disabled={actions?.cancelPending === true || actions?.refreshPending === true || actions?.reconcilePending === true}
              onClick={() => setCancelDialogOpen(true)}
            >
              Cancel invocation
            </Button>
          ) : null}
        </div>
      ) : null}
      <AeConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title="Cancel this invocation?"
        description="Cancellation is explicit and may be refused if the external effect has already started."
        confirmLabel="Confirm cancellation"
        cancelLabel="Keep invocation"
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


function statusFromRecovery(result: OperationInvokeRecoveryResult): InvocationStatusPageResult {
  if (result.kind !== 'reconciliation_required') return result
  return {
    kind: 'found',
    invocationRef: result.invocationRef,
    operationRef: result.operationRef,
    state: 'reconciliation_required',
    attemptRef: result.evidence.attemptRef,
    effectGeneration: result.evidence.effectGeneration,
  }
}

function refreshFeedback(result: OperationInvokeStatusResult): InvocationStatusPageActions['feedback'] {
  if (result.kind === 'found') {
    return { kind: 'success', message: `Current status refreshed. The current state is ${machineLabel(result.state)}.` }
  }
  return {
    kind: 'error',
    message: `The status source refused the refresh (${machineLabel(result.code)}). No current state is claimed.`,
  }
}

function cancelFeedback(result: OperationInvokeRecoveryResult): InvocationStatusPageActions['feedback'] {
  if (result.kind === 'reconciliation_required') {
    return {
      kind: 'error',
      message: 'Cancellation could not complete because the external effect may have started. Reconciliation evidence is required before retrying.',
    }
  }
  if (result.kind === 'refused') {
    return { kind: 'error', message: recoveryRefusalMessage(result.code) }
  }
  if (result.state === 'cancelled') {
    return { kind: 'success', message: 'Cancellation was recorded. The current status was refreshed.' }
  }
  return { kind: 'error', message: `Cancellation was not accepted. Current state remains ${machineLabel(result.state)}.` }
}
function reconcileFeedback(result: OperationInvokeRecoveryResult): InvocationStatusPageActions['feedback'] {
  if (result.kind === 'refused') return { kind: 'error', message: `Reconciliation was refused (${machineLabel(result.code)}). No state change is claimed.` }
  if (result.kind === 'reconciliation_required') return { kind: 'error', message: 'Reconciliation remains required. The submitted evidence was not accepted.' }
  if (result.state === 'terminal' || result.state === 'retryable') {
    return { kind: 'success', message: `Reconciliation recorded. Current state is ${machineLabel(result.state)} and the status was refreshed.` }
  }
  return { kind: 'error', message: `Reconciliation did not complete. Current state remains ${machineLabel(result.state)}.` }
}


function recoveryRefusalMessage(code: string): string {
  if (code === 'invocation_not_found') return 'This invocation is no longer available to the signed-in owner.'
  if (code === 'invocation_runtime_unavailable') return 'The invocation source is unavailable. No new state is claimed.'
  if (code === 'grant_generation_stale' || code === 'grant_revoked' || code === 'grant_expired') {
    return 'The issuing access grant changed, but owner recovery remains bound to this invocation. Refresh the current record.'
  }
  return `The cancellation was refused (${machineLabel(code)}). No state change is claimed.`
}


function ResultDetails({ result }: Readonly<{ result: OperationInvokeResult }>) {
  return (
    <section className="grid gap-5 border-t border-border pt-6" aria-labelledby="current-result-title">
      <div className="grid gap-1">
        <h2 id="current-result-title" className="text-xl font-semibold tracking-tight text-foreground">Current result</h2>
        <p className="text-sm text-muted-foreground">Canonical result facts as recorded, without changing the current state above.</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Fact label="Result kind" value={machineLabel(result.kind)} />
        {'invocationRef' in result ? <Fact label="Result invocation reference"><Ref value={result.invocationRef} /></Fact> : null}
        {result.operationRef === undefined ? null : <Fact label="Result Operation reference"><Ref value={result.operationRef} /></Fact>}
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
        <div className="grid min-w-0 gap-2">
          <h3 className="text-base font-semibold text-foreground">Output</h3>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-xs text-foreground"><code>{JSON.stringify(result.output, null, 2)}</code></pre>
        </div>
      ) : null}
    </section>
  )
}

function StatusRefused({
  result,
  actions,
}: Readonly<{
  result: Extract<OperationInvokeStatusResult, { kind: 'refused' }>
  actions?: InvocationStatusPageActions
}>) {
  const canRetry = result.retryable && actions?.onRefresh !== undefined
  const receiptView = projectInvocationReceipt(result)
  return (
    <AePublicShell>
      <section id="receipt" className="ae-rail grid scroll-mt-6 gap-8 pb-page">
        <div className="grid gap-3">
          <Badge variant="warning" className="w-fit">{receiptView.statusLabel}</Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Invocation receipt</h1>
          <p className="text-muted-foreground">{receiptView.statusDetail}</p>
          <Ref value={result.invocationRef} />
          {result.code === 'invocation_not_found' ? (
            <StatusSignInAction invocationRef={result.invocationRef} />
          ) : canRetry && actions !== undefined ? (
            <RefreshStatusButton actions={actions} />
          ) : null}
          <StatusFeedback feedback={actions?.feedback} invocationRef={result.invocationRef} />
        </div>
        <ReceiptTimeline stages={receiptView.stages} />
        {receiptView.issue === undefined ? null : <InvocationIssue issue={receiptView.issue} />}
        <ReceiptMoneyFacts view={receiptView} />
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-foreground">Refusal</h2>
            <CardDescription>The server response is shown without inventing invocation state.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact label="Code" value={machineLabel(result.code)} />
              <Fact label="Retryable" value={result.retryable ? 'Yes' : 'No'} />
              {result.nextAction === undefined ? null : <Fact label="Next action" value={result.nextAction} />}
            </dl>
          </CardContent>
        </Card>
        <MachineReadableReceipt view={receiptView} />
      </section>
    </AePublicShell>
  )
}

function StatusUnavailable({
  result,
  actions,
}: Readonly<{
  result: Extract<InvocationStatusPageResult, { kind: 'source_unavailable' }>
  actions?: InvocationStatusPageActions
}>) {
  const receiptView = projectInvocationReceipt(result)
  return (
    <AePublicShell>
      <section id="receipt" className="ae-rail grid scroll-mt-6 gap-8 pb-page">
        <div className="grid gap-3">
          <Badge variant="warning" className="w-fit">Receipt unavailable</Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Invocation receipt</h1>
          <p className="text-muted-foreground">{receiptView.statusDetail}</p>
          <Ref value={result.invocationRef} />
          {actions?.onRefresh === undefined ? null : <RefreshStatusButton actions={actions} />}
          <StatusFeedback feedback={actions?.feedback} invocationRef={result.invocationRef} />
        </div>
        <ReceiptTimeline stages={receiptView.stages} />
        {receiptView.issue === undefined ? null : <InvocationIssue issue={receiptView.issue} />}
        <ReceiptMoneyFacts view={receiptView} />
        <MachineReadableReceipt view={receiptView} />
      </section>
    </AePublicShell>
  )
}

function RefreshStatusButton({ actions }: Readonly<{ actions: InvocationStatusPageActions }>) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 w-fit"
      disabled={actions.refreshPending === true}
      onClick={() => { void actions.onRefresh?.() }}
    >
      {actions.refreshPending === true ? 'Refreshing current status…' : 'Refresh current status'}
    </Button>
  )
}

function StatusFeedback({
  feedback,
  invocationRef,
}: Readonly<{ feedback?: InvocationStatusPageActions['feedback']; invocationRef: string }>) {
  if (feedback === undefined) return null
  if (feedback.kind === 'error') {
    return (
      <InvocationIssue issue={{
        title: 'The requested receipt action did not complete',
        whatHappened: feedback.message,
        moneyMovement: 'This failed action does not prove that money moved. The recorded before-and-after facts on this receipt remain authoritative.',
        automaticNext: 'No replacement invocation was created automatically.',
        userNext: 'Follow only the recovery action supported by the current receipt state, or reload this same receipt.',
        retainedReference: invocationRef,
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

function StatusSignInAction({ invocationRef }: Readonly<{ invocationRef: string }>) {
  const redirect = `/operations/invocations/${encodeURIComponent(invocationRef)}`
  return (
    <Button asChild className="min-h-11 w-fit">
      <Link to="/sign-in/$" params={{ _splat: '' }} search={{ redirect }}>
        Sign in to view current status
      </Link>
    </Button>
  )
}

function InvocationStatusPending() {
  return (
    <AePublicShell>
      <section className="mx-auto w-full max-w-3xl px-4 py-16 md:px-6" aria-busy="true" aria-live="polite">
        <h1 className="sr-only">Invocation receipt</h1>
        <p className="text-muted-foreground">Checking the exact current owner-scoped invocation receipt…</p>
      </section>
    </AePublicShell>
  )
}

function InvocationStatusError() {
  const { invocationRef } = Route.useParams()
  return <StatusUnavailable result={{ kind: 'source_unavailable', invocationRef }} />
}

function Fact({ label, value, children }: Readonly<{ label: string; value?: string; children?: ReactNode }>) {
  return <div className="grid min-w-0 gap-1"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="break-words text-sm text-foreground">{children ?? value}</dd></div>
}

function Ref({ value }: Readonly<{ value: string }>) {
  return <code dir="ltr" className="break-all font-mono text-xs text-foreground">{value}</code>
}

function canRefreshStatus(result: InvocationStatusPageResult): boolean {
  if (result.kind === 'source_unavailable') return true
  if (result.kind === 'refused') return result.retryable
  return result.state !== 'terminal' && result.state !== 'cancelled' && result.state !== 'invalidated'
}

function machineLabel(value: string): string {
  const label = value.replaceAll('_', ' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}
