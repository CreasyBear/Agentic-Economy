import { Link } from '@tanstack/react-router'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { formatUtcTimestamp, timestampIso } from '@/lib/ui/format-time'
import type { CallResult } from '@/modules/capability-execution/call-contracts'
import type { CallReceiptView } from '@/modules/capability-execution/call-receipt-view'
import { nextActionForCallStatus } from '@/modules/market/suggested-next-action'
import { formatCurrencyAmount } from '@/modules/money/public'

import type { FoundCallStatus } from '@/lib/call-recovery/call-status-page-types'

import { machineLabel } from './call-receipt-format'
import { CallReceiptTimeline } from './CallReceiptTimeline'
import { CallReceiptFact, CallReceiptRef } from './CallReceiptPrimitives'

export function CallTechnicalRecord({ result, view }: Readonly<{ result: FoundCallStatus; view: CallReceiptView }>) {
  const ownerContext = result.ownerContext
  return (
    <details className="border-t border-border pt-related">
      <summary className="flex min-h-touch cursor-pointer items-center text-sm font-medium text-foreground">Technical record</summary>
      <div className="grid gap-section pt-related">
        <AeFactList facts={[
          { label: "Call reference", value: <CallReceiptRef value={result.callRef} />, mono: true },
          { label: "Tool reference", value: <CallReceiptRef value={result.toolRef} />, mono: true },
          { label: "Call state", value: machineLabel(result.state) },
          ...(result.attemptRef === undefined ? [] : [{ label: "Attempt reference", value: <CallReceiptRef value={result.attemptRef} />, mono: true }]),
          ...(result.effectGeneration === undefined ? [] : [{ label: "Effect generation", value: String(result.effectGeneration) }]),
          ...(result.evidenceHash === undefined ? [] : [{ label: "Evidence hash", value: <CallReceiptRef value={result.evidenceHash} />, mono: true }]),
          ...(ownerContext === undefined || ownerContext === null ? [] : [
            { label: 'Agent principal reference', value: <CallReceiptRef value={ownerContext.agent.principalRef} />, mono: true },
            { label: 'Agent application reference', value: <CallReceiptRef value={ownerContext.agent.applicationRef} />, mono: true },
          ]),
        ]} />
        <CallReceiptTimeline stages={view.stages} />
        {result.result === undefined ? null : <ResultDetails result={result.result} />}
        <CallSuggestedNextAction result={result} />
        <MachineReadableReceipt view={view} />
      </div>
    </details>
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

function ResultDetails({ result }: Readonly<{ result: CallResult }>) {
  return (
    <AeSection
      title="Current result"
      description="Canonical result facts as recorded, without changing the current state above."
    >
      <dl className="grid gap-related sm:grid-cols-2">
        <CallReceiptFact label="Result kind" value={machineLabel(result.kind)} />
        {'callRef' in result ? <CallReceiptFact label="Result Call reference"><CallReceiptRef value={result.callRef} /></CallReceiptFact> : null}
        {result.toolRef === undefined ? null : <CallReceiptFact label="Result Tool reference"><CallReceiptRef value={result.toolRef} /></CallReceiptFact>}
        {result.kind === 'completed' ? (
          <>
            <CallReceiptFact label="Evidence hash"><CallReceiptRef value={result.evidenceHash} /></CallReceiptFact>
            <CallReceiptFact label="Result charge state" value={machineLabel(result.usage.chargeState)} />
            <CallReceiptFact label="Result exact amount" value={formatCurrencyAmount(result.usage.amount)} />
            <CallReceiptFact label="Result usage reference"><CallReceiptRef value={result.usage.usageRef} /></CallReceiptFact>
            <CallReceiptFact label="Result usage observed"><time dateTime={timestampIso(result.usage.observedAt)}>{formatUtcTimestamp(result.usage.observedAt)} UTC</time></CallReceiptFact>
            <CallReceiptFact label="Result price digest"><CallReceiptRef value={result.usage.priceDigest} /></CallReceiptFact>
            {result.usage.transactionRef === undefined ? null : <CallReceiptFact label="Result transaction reference"><CallReceiptRef value={result.usage.transactionRef} /></CallReceiptFact>}
            {result.usage.durationMs === undefined ? null : <CallReceiptFact label="Result duration" value={`${result.usage.durationMs} ms`} />}
          </>
        ) : result.kind === 'pending' ? (
          <CallReceiptFact label="Retry after" value={`${result.retryAfterMs} ms`} />
        ) : result.kind === 'needs_authority' ? (
          <>
            <CallReceiptFact label="Authority kind" value={machineLabel(result.authorityRequest.kind)} />
            <CallReceiptFact label="Consequence" value={machineLabel(result.authorityRequest.consequence)} />
            <CallReceiptFact label="Retry class" value={machineLabel(result.authorityRequest.retryClass)} />
            {result.authorityRequest.maximumSpend === undefined ? null : <CallReceiptFact label="Maximum spend" value={formatCurrencyAmount(result.authorityRequest.maximumSpend)} />}
            <CallReceiptFact label="Data fields" value={result.authorityRequest.dataFields.length === 0 ? 'None' : result.authorityRequest.dataFields.join(', ')} />
            {result.authorityRequest.expiresAt === undefined ? null : <CallReceiptFact label="Authority expires" value={result.authorityRequest.expiresAt} />}
          </>
        ) : result.kind === 'reconciliation_required' ? (
          <>
            <CallReceiptFact label="Attempt reference"><CallReceiptRef value={result.evidence.attemptRef} /></CallReceiptFact>
            <CallReceiptFact label="Effect generation" value={String(result.evidence.effectGeneration)} />
            <CallReceiptFact label="Required at" value={result.evidence.requiredAt} />
            <CallReceiptFact label="Retry policy" value={machineLabel(result.evidence.retry)} />
            <CallReceiptFact label="Evidence source" value={result.evidence.evidenceSource} />
          </>
        ) : (
          <>
            <CallReceiptFact label="Code" value={machineLabel(result.code)} />
            <CallReceiptFact label="Retryable" value={result.retryable ? 'Yes' : 'No'} />
            {result.nextAction === undefined ? null : <CallReceiptFact label="Next action" value={result.nextAction} />}
          </>
        )}
      </dl>
    </AeSection>
  )
}

export function CallOutputSection({ result }: Readonly<{ result: CallResult }>) {
  if (result.kind !== 'completed') return null
  return (
    <AeSection title="Output" description="The Provider output recorded for this Call.">
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-card bg-muted p-gutter text-xs text-foreground"><code>{JSON.stringify(result.output, null, 2)}</code></pre>
    </AeSection>
  )
}

export function CallReuseActions({ view }: Readonly<{ view: CallReceiptView }>) {
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
      title="Use this Tool again"
      description="Review the Tool and its current terms before starting a separate Call. This receipt will not be reused."
    >
      <Link
        to="/tools/$toolRef"
        params={{ toolRef }}
        className={cn(buttonVariants(), 'w-fit min-h-touch')}
      >
        Review Tool
      </Link>
      <details className="border-t border-border pt-related">
        <summary className="flex min-h-touch cursor-pointer items-center text-sm font-medium text-foreground">Technical ways to reuse</summary>
        <div className="grid gap-section pt-related">
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
        </div>
      </details>
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
