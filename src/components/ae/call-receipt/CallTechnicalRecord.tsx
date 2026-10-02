
import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'
import { useClipboardCopy } from '@/hooks/use-clipboard-copy'
import { formatUtcTimestamp, timestampIso } from '@/lib/ui/format-time'
import type { CallResult } from '@/modules/capability-execution/call-contracts'
import type { CallReceiptView } from '@/modules/capability-execution/call-receipt-view'
import { nextActionForCallStatus } from '@/modules/market/suggested-next-action'
import { formatCurrencyAmount } from '@/modules/money/public'

import type { FoundCallStatus } from '@/lib/call-recovery/call-status-page-types'

import { machineLabel } from './call-receipt-format'
import { CallMoneyFacts } from './CallMoneyFacts'
import { CallOutputPreview } from './CallOutputPreview'
import { CallReceiptTimeline } from './CallReceiptTimeline'
import { CallReceiptFact, CallReceiptRef } from './CallReceiptPrimitives'
import './ReceiptComposition.css'

export function CallTechnicalRecord({ result, view }: Readonly<{ result: FoundCallStatus; view: CallReceiptView }>) {
  const ownerContext = result.ownerContext
  return (
    <details className="arc-market arc-call-disclosure">
      <summary>Technical details</summary>
      <div className="arc-call-disclosure-body">
        <AeFactList facts={[
          { label: "Call reference", value: <CallReceiptRef label="Call reference" value={result.callRef} />, mono: true },
          { label: "Tool reference", value: <CallReceiptRef label="Tool reference" value={result.toolRef} />, mono: true },
          { label: "Call state", value: machineLabel(result.state) },
          ...(result.attemptRef === undefined ? [] : [{ label: "Attempt reference", value: <CallReceiptRef label="attempt reference" value={result.attemptRef} />, mono: true }]),
          ...(result.effectGeneration === undefined ? [] : [{ label: "Effect generation", value: String(result.effectGeneration) }]),
          ...(result.evidenceHash === undefined ? [] : [{ label: "Evidence hash", value: <CallReceiptRef label="evidence hash" value={result.evidenceHash} />, mono: true }]),
          ...(ownerContext === undefined || ownerContext === null ? [] : [
            { label: 'Agent principal reference', value: <CallReceiptRef label="Agent principal reference" value={ownerContext.agent.principalRef} />, mono: true },
            { label: 'Agent application reference', value: <CallReceiptRef label="Agent application reference" value={ownerContext.agent.applicationRef} />, mono: true },
          ]),
        ]} />
        <CallMoneyFacts view={view} />
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
    <details className="arc-market arc-call-disclosure">
      <summary>
        Machine-readable receipt
      </summary>
      <pre className="arc-call-recorded-output"><code>{JSON.stringify(view, null, 2)}</code></pre>
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
        {'callRef' in result ? <CallReceiptFact label="Result Call reference"><CallReceiptRef label="Call reference" value={result.callRef} /></CallReceiptFact> : null}
        {result.toolRef === undefined ? null : <CallReceiptFact label="Result Tool reference"><CallReceiptRef label="Tool reference" value={result.toolRef} /></CallReceiptFact>}
        {result.kind === 'completed' ? (
          <>
            <CallReceiptFact label="Evidence hash"><CallReceiptRef label="evidence hash" value={result.evidenceHash} /></CallReceiptFact>
            <CallReceiptFact label="Result charge state" value={machineLabel(result.usage.chargeState)} />
            <CallReceiptFact label="Result exact amount" value={formatCurrencyAmount(result.usage.amount)} />
            <CallReceiptFact label="Result usage reference"><CallReceiptRef label="usage reference" value={result.usage.usageRef} /></CallReceiptFact>
            <CallReceiptFact label="Result usage observed"><time dateTime={timestampIso(result.usage.observedAt)}>{formatUtcTimestamp(result.usage.observedAt)} UTC</time></CallReceiptFact>
            <CallReceiptFact label="Result price digest"><CallReceiptRef label="price digest" value={result.usage.priceDigest} /></CallReceiptFact>
            {result.usage.transactionRef === undefined ? null : <CallReceiptFact label="Result transaction reference"><CallReceiptRef label="transaction reference" value={result.usage.transactionRef} /></CallReceiptFact>}
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
            <CallReceiptFact label="Attempt reference"><CallReceiptRef label="attempt reference" value={result.evidence.attemptRef} /></CallReceiptFact>
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

export function CallRequestSection({ input }: Readonly<{ input: FoundCallStatus['previousInput'] }>) {
  if (input === undefined) return null
  return (
    <details className="arc-market arc-call-disclosure">
      <summary>Request</summary>
      <pre className="arc-call-recorded-output"><code>{JSON.stringify(input, null, 2)}</code></pre>
    </details>
  )
}

export function CallOutputSection({ result }: Readonly<{ result: CallResult }>) {
  if (result.kind !== 'completed') return null
  return <RecordedCallOutput key={result.evidenceHash} output={result.output} />
}

function RecordedCallOutput({ output }: Readonly<{ output: Extract<CallResult, { kind: 'completed' }>['output'] }>) {
  const text = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
  const clipboard = useClipboardCopy(text)
  return (
    <AeSection title="Output">
      {typeof output === 'string' ? (
        <pre className="arc-call-recorded-output"><code>{text === '' ? 'Empty text' : text}</code></pre>
      ) : (
        <div className="arc-call-recorded-output"><CallOutputPreview value={output} /></div>
      )}
      <Button type="button" variant="secondary" size="md" className="w-fit" onClick={() => { void clipboard.copy() }}>
        {clipboard.isCopied ? 'Output copied' : 'Copy output'}
      </Button>
      {clipboard.status === 'failed' ? <p role="status" className="text-sm text-muted-foreground">{typeof output === 'string' ? 'Copy failed. Select the output above and copy it manually.' : 'Copy failed. Open full JSON below and copy it manually.'}</p> : null}
      {typeof output === 'string' ? null : (
        <details className="arc-call-disclosure">
          <summary>View full JSON</summary>
          <pre className="arc-call-recorded-output"><code>{text}</code></pre>
        </details>
      )}
    </AeSection>
  )
}
