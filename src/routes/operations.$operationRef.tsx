import { Link, createFileRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AePublicRoutePending } from '@/components/ae/layout/AePublicRoutePending'
import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperationPrice } from '@/components/ae/market/AeOperationPrice'
import { Button } from '@/components/ui/button'
import { formatUtcTimestamp, timestampIso } from '@/lib/ui/format-time'
import type {
  PublicOperationDescriptor,
  PublicOperationParameter,
  PublicOperationPrice,
} from '@/modules/capability-supply/public'
import { formatCurrencyAmount } from '@/modules/money/public'
import {
  readPublicOperationDetailRouteServer,
  type PublicOperationDetailRouteResult,
} from '@/modules/registry/operation-detail-route.functions'

export const Route = createFileRoute('/operations/$operationRef')({
  loader: ({ params }) => readPublicOperationDetailRouteServer({ data: { operationRef: params.operationRef } })
    .catch((): PublicOperationDetailRouteResult => ({ kind: 'source_unavailable', operationRef: params.operationRef })),
  head: ({ loaderData }) => {
    if (loaderData?.kind !== 'found') {
      return { meta: [
        { title: 'Operation unavailable | Agentic Economy' },
        { name: 'robots', content: 'noindex' },
      ] }
    }
    return { meta: [
      { title: `${loaderData.operation.offering.label} | Agentic Economy` },
      { name: 'description', content: loaderData.operation.summary },
    ] }
  },
  pendingComponent: OperationDetailPending,
  errorComponent: OperationDetailError,
  component: OperationDetailRoute,
})

function OperationDetailRoute() {
  return <PublicOperationDetail result={Route.useLoaderData()} />
}

export function PublicOperationDetail({ result }: Readonly<{ result: PublicOperationDetailRouteResult }>) {
  if (result.kind !== 'found') return <OperationUnavailable result={result} />
  return <CurrentOperationDetail operation={result.operation} />
}

function CurrentOperationDetail({ operation }: Readonly<{ operation: PublicOperationDescriptor }>) {
  const requiredParameters = operation.parameters?.filter(({ required }) => required) ?? []
  const optionalParameters = operation.parameters?.filter(({ required }) => !required) ?? []
  const inputExample = operation.contract.inputExamples?.[0]
  const mcpInput = inputExample === undefined
    ? '<JSON matching the published schema>'
    : JSON.stringify(inputExample.input)
  const invokeInput = inputExample === undefined
    ? '"$AE_INPUT_JSON"'
    : `'${JSON.stringify(inputExample.input).replaceAll("'", "'\\''")}'`
  const accessMode = operation.availability.posture !== 'routeable'
    ? 'inspect_only'
    : operation.navigation.some(({ relation }) => relation === 'execute')
      ? 'anonymous_execute'
      : operation.navigation.some(({ relation }) => relation === 'invoke')
        ? 'authenticated_invoke'
        : 'inspect_only'
  const lastVerifiedAt = operation.availability.observedAt
    ?? operation.commercial.priceEvidence?.observedAt
  return (
    <AePublicShell>
      <AePageHeader
        title={operation.offering.label}
        description={operation.summary}
        actions={
          <Button asChild variant="ghost" className="min-h-11">
            <Link to="/market" search={{ window: '30d' }} hash="operations">Catalog</Link>
          </Button>
        }
        meta={label(operation.availability.posture)}
      />
      <article className="ae-rail grid gap-8 pb-page">
        <header className="grid gap-4">
          <p className="text-sm text-muted-foreground">{operation.business.name}</p>
          <OperationDecision operation={operation} />
          <AeFactList
            className="sm:grid-cols-3"
            facts={[
              { label: 'Provider', value: <BusinessLink operation={operation} /> },
              {
                label: 'Last verified',
                value: lastVerifiedAt === undefined
                  ? 'Not published'
                  : <time dateTime={timestampIso(lastVerifiedAt)}>{formatUtcTimestamp(lastVerifiedAt)} UTC</time>,
              },
              { label: 'Authentication', value: authenticationLabel(operation) },
            ]}
          />
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="grid min-w-0 gap-6">
            <Section id="parameters" title="Parameters" description="The fields your agent needs before it calls this Operation.">
              {operation.parameters === undefined ? (
                <p className="text-sm text-muted-foreground">No flat parameter list is published. <a href="#technical-contract" className="font-medium text-foreground underline underline-offset-4">Read the input JSON Schema</a> before calling.</p>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2">
                  <ParameterList title="Required parameters" parameters={requiredParameters} empty="No required parameters." />
                  <ParameterList title="Optional parameters" parameters={optionalParameters} empty="No optional parameters." />
                </div>
              )}
            </Section>

            <Section title="Example input and output" description="Published examples only. Missing examples are never inferred.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Example
                  title="Example input"
                  value={inputExample?.input}
                  empty="No example input is published. Use the input schema below."
                />
                <Example
                  title="Example output"
                  empty="No example output is published. Validate the response against the output schema below."
                />
              </div>
            </Section>

            <Section id="price-and-terms" title="Price and terms" description="The exact buyer authorization and published commercial terms for this capability.">
              <PriceBreakdown operation={operation} />
              <dl className="grid gap-3 sm:grid-cols-2">
                {operation.commercial.priceEvidence?.observedAt === undefined ? null : (
                  <TimeFact label="Price observed" value={operation.commercial.priceEvidence.observedAt} />
                )}
                {operation.commercial.priceEvidence?.validUntil === undefined ? null : (
                  <TimeFact label="Price valid until" value={operation.commercial.priceEvidence.validUntil} />
                )}
                <Fact label="Commercial relationship" value={`${label(operation.commercial.relationship.kind)} — ${operation.commercial.relationship.summary}`} />
                <Fact label="Provider"><BusinessLink operation={operation} /></Fact>
              </dl>
              <TermList terms={operation.commercial.materialTerms} />
            </Section>

            <Section title="Readiness and reliability" description="Current readiness, named completion evidence, and recovery behavior. Publication alone is not usage evidence.">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Fact label="Status" value={label(operation.availability.posture)} />
                <TimeFact label="Readiness verified" value={operation.availability.observedAt} />
                <TimeFact label="Readiness valid until" value={operation.availability.validUntil} />
                <Fact label="Idempotency" value={label(operation.recovery.idempotency)} />
                <Fact label="Recovery" value={label(operation.recovery.recovery)} />
                <Fact label="Cancellation" value={label(operation.cancellation.kind)} />
                <Fact label="Observed calls" value="Not available on this descriptor" />
              </dl>
              <ul className="m-0 grid list-none gap-3 p-0">
                {operation.evidence.length === 0 ? <li className="text-sm text-muted-foreground">No output evidence pointers are declared.</li> : operation.evidence.map((evidence) => (
                  <li key={evidence.evidenceId} className="rounded-card border border-border bg-card p-4 text-sm">
                    <span className="font-medium text-foreground">{label(evidence.purpose)}</span>
                    <span className="text-muted-foreground"> · {evidence.evidenceId} · {evidence.outputPointer}</span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <OperationAccessSidecard operation={operation} accessMode={accessMode} invokeInput={invokeInput} mcpInput={mcpInput} />
        </div>

        <details id="technical-contract" className="scroll-mt-6 rounded-card border border-border bg-card">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Technical contract, schemas, digests, and references
          </summary>
          <div className="grid gap-6 border-t border-border p-4 sm:p-5">
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Fact label="Operation reference"><Ref value={operation.operationRef} /></Fact>
              <Fact label="Operation ID" value={operation.operationId} />
              <Fact label="Capability" value={`${operation.contract.capabilityId} · version ${operation.contract.version}`} />
              <Fact label="Publisher" value={label(operation.provenance.publisher)} />
              <Fact label="Source kind" value={label(operation.provenance.sourceKind)} />
              <Fact label="Transport" value={`${operation.transport.method}${operation.transport.pathTemplate === undefined ? '' : ` ${operation.transport.pathTemplate}`}`} />
              <Fact label="Request timeout" value={`${operation.transport.requestTimeoutMs} ms`} />
              <Fact label="Price digest" value={operation.commercial.priceEvidence?.priceDigest ?? 'Not published'} />
              <Fact label="Price source" value={operation.commercial.priceEvidence?.sourceRef ?? 'Not published'} />
              <Fact label="Price evidence" value={operation.commercial.priceEvidence?.evidenceRefs.join(', ') || 'Not published'} />
            </dl>
            <section className="grid gap-3">
              <h3 className="text-sm font-semibold text-foreground">Data use</h3>
              <ul className="m-0 grid list-none gap-2 p-0">
                {operation.dataUse.length === 0 ? <li className="text-sm text-muted-foreground">No data-use effects are declared.</li> : operation.dataUse.map((effect) => (
                  <li key={`${effect.effectId}:${effect.inputPointer}:${effect.phase}`} className="rounded-md border border-border p-3 text-sm">
                    <span className="font-medium text-foreground">{label(effect.classification)} · {effect.inputPointer}</span>
                    <span className="text-muted-foreground"> · {effect.effectId} · {label(effect.phase)} · {label(effect.recipient)} · {effect.purposes.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="grid gap-3">
              <h3 className="text-sm font-semibold text-foreground">Effects and authority</h3>
              <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
                {operation.effects.length === 0 ? <li className="text-sm text-muted-foreground">No consequential effects are declared.</li> : operation.effects.map((effect) => (
                  <li key={`${effect.effectId}:${effect.class}:${effect.authority}:${effect.reversibility}`} className="rounded-md border border-border p-3 text-sm">
                    <span className="font-medium text-foreground">{label(effect.class)}</span>
                    <span className="text-muted-foreground"> · {effect.effectId} · {label(effect.authority)} · {label(effect.reversibility)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <Schema title="Input JSON Schema" value={operation.contract.inputJsonSchema} />
            <Schema title="Output JSON Schema" value={operation.contract.outputJsonSchema} />
          </div>
        </details>
      </article>
    </AePublicShell>
  )
}

function OperationAccessSidecard({
  operation,
  accessMode,
  invokeInput,
  mcpInput,
}: Readonly<{
  operation: PublicOperationDescriptor
  accessMode: 'anonymous_execute' | 'authenticated_invoke' | 'inspect_only'
  invokeInput: string
  mcpInput: string
}>) {
  if (accessMode === 'anonymous_execute') {
    return (
      <aside className="grid gap-4 border-t border-border pt-6 lg:sticky lg:top-20 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0" aria-labelledby="execution-title">
        <div className="grid gap-1">
          <h2 id="execution-title" className="text-lg font-semibold text-foreground">Use this capability</h2>
          <p className="text-sm text-muted-foreground">Ready now with no provider key. Inspect the contract, then call it through MCP.</p>
        </div>
        <ol className="m-0 grid list-none gap-5 p-0">
          <CommandStep number={1} title="Inspect capability" code={inspectCommand(operation.operationRef)} />
          <CommandStep
            number={2}
            title="Call capability"
            code={`ae_operation_execute\noperationRef=${operation.operationRef}\ninput=${mcpInput}`}
          />
        </ol>
        <p className="text-sm text-muted-foreground">Pass only published input fields. Headline availability can change; the current descriptor remains authoritative.</p>
      </aside>
    )
  }

  if (accessMode === 'authenticated_invoke') {
    return (
      <aside className="grid gap-4 border-t border-border pt-6 lg:sticky lg:top-20 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0" aria-labelledby="execution-title">
        <div className="grid gap-1">
          <h2 id="execution-title" className="text-lg font-semibold text-foreground">Use this capability</h2>
          <p className="text-sm text-muted-foreground">Connect once, call this capability, then follow the returned receipt. The CLI keeps the credential and retry identity for you.</p>
        </div>
        <Button asChild className="min-h-11 w-full">
          <Link to="/for-agents">Connect an agent</Link>
        </Button>
        <ol className="m-0 grid list-none gap-5 p-0">
          <CommandStep number={1} title="Inspect capability" code={inspectCommand(operation.operationRef)} />
          <CommandStep number={2} title="Connect once" code="ae connect" />
          <CommandStep number={3} title="Call capability" code={`ae call '${operation.operationRef}' --input ${invokeInput}`} />
          <CommandStep number={4} title="Open the receipt" code="ae status <invocation-ref>" />
        </ol>
        <p className="text-sm text-muted-foreground"><code>ae connect</code> stores and validates one origin-bound agent key with user-only permissions. <code>ae call</code> generates a durable retry identity when one is not supplied.</p>
      </aside>
    )
  }

  return (
    <aside className="grid gap-4 border-t border-border pt-6 lg:sticky lg:top-20 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0" aria-labelledby="availability-title">
      <div className="grid gap-1">
        <h2 id="availability-title" className="text-lg font-semibold text-foreground">Use this capability</h2>
        <p className="text-sm text-muted-foreground">
          {operation.availability.posture === 'integrated' ? 'Setup is required before invocation.' : 'This capability is currently unavailable.'} You can still inspect its price and contract, but it cannot be called now.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Button asChild className="min-h-11"><Link to="/market" search={{ window: '30d' }} hash="operations">Browse current Operations</Link></Button>
        <Button asChild variant="secondary" className="min-h-11"><Link to="/market" search={{ window: '30d' }}>Back to market</Link></Button>
      </div>
    </aside>
  )
}

/**
 * First-viewport buy decision. Routeable operations lead with a primary
 * "Use this capability" action and the total authorization figure; integrated
 * and unavailable operations lead with inspector actions instead. The
 * sidebar card (OperationAccessSidecard) keeps carrying the full step flow.
 */
function OperationDecision({ operation }: Readonly<{ operation: PublicOperationDescriptor }>) {
  const routeable = operation.availability.posture === 'routeable'
  return (
    <section
      aria-labelledby="operation-decision-title"
      className="grid gap-3 rounded-lg border bg-card p-4 sm:flex sm:items-end sm:justify-between sm:gap-4 sm:p-5"
    >
      <div className="grid gap-1">
        <p
          id="operation-decision-title"
          className="text-sm font-medium text-muted-foreground"
        >
          {routeable ? 'Ready to call' : 'Setup required'}
        </p>
        <AeOperationPrice price={totalPrice(operation)} size="lg" label="Total authorization" />
        <p className="max-w-md text-xs leading-5 text-muted-foreground">
          {routeable
            ? 'The maximum charged for one call. Read the contract before invoking.'
            : 'Read the full contract before requesting access.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {routeable ? (
          <Button asChild className="min-h-11">
            <Link to="/for-agents">Use this capability</Link>
          </Button>
        ) : (
          <>
            <Button asChild variant="secondary" className="min-h-11">
              <a href="#price-and-terms">Inspect price and terms</a>
            </Button>
            <Button asChild variant="ghost" className="min-h-11">
              <a href="#parameters">View parameters</a>
            </Button>
          </>
        )}
      </div>
    </section>
  )
}

function OperationUnavailable({ result }: Readonly<{ result: Exclude<PublicOperationDetailRouteResult, { kind: 'found' }> }>) {
  const presentation = result.kind === 'not_found'
    ? {
        tone: 'neutral' as const,
        title: 'This exact Operation is unknown or no longer current',
        description: 'AE has no current descriptor for this reference, so no historical terms, price, or invocation steps are shown.',
      }
    : result.kind === 'source_unavailable'
      ? {
          tone: 'warning' as const,
          title: 'Operation details are unavailable',
          description: 'AE cannot verify the current descriptor right now, so no commercial facts or invocation steps are shown.',
        }
      : {
          tone: 'warning' as const,
          title: 'This Operation is not currently available',
          description: `AE reports ${label(result.reason)} for this exact reference. No commercial facts or invocation steps are shown.`,
        }
  return (
    <AePageState
      tone={presentation.tone}
      title={presentation.title}
      description={presentation.description}
      action={
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild className="min-h-11"><Link to="/market" search={{ window: '30d' }} hash="operations">Browse current Operations</Link></Button>
          <Button asChild variant="secondary" className="min-h-11"><Link to="/market" search={{ window: '30d' }}>Back to market</Link></Button>
        </div>
      }
    />
  )
}

function OperationDetailPending() {
  return <AePublicRoutePending label="Checking the current capability…" shape="detail" />
}

function OperationDetailError() {
  return <OperationUnavailable result={{ kind: 'source_unavailable', operationRef: 'Requested reference' }} />
}

function Section({ id, title, description, children }: Readonly<{ id?: string; title: string; description: string; children: ReactNode }>) {
  return (
    <section id={id} className="scroll-mt-6 grid gap-4 border-t border-border pt-6">
      <div className="grid gap-1">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}

function Fact({ label: factLabel, value, children }: Readonly<{ label: string; value?: string; children?: ReactNode }>) {
  return <div className="grid min-w-0 gap-1"><dt className="text-xs font-medium text-muted-foreground">{factLabel}</dt><dd className="break-words text-sm text-foreground">{children ?? value}</dd></div>
}

function TimeFact({ label: factLabel, value }: Readonly<{ label: string; value: number | undefined }>) {
  return value === undefined
    ? <Fact label={factLabel} value="Not published" />
    : <Fact label={factLabel}><time dateTime={timestampIso(value)}>{formatUtcTimestamp(value)} UTC</time></Fact>
}

function Ref({ value }: Readonly<{ value: string }>) {
  return <code dir="ltr" className="break-all font-mono text-xs text-foreground">{value}</code>
}

function BusinessLink({ operation }: Readonly<{ operation: PublicOperationDescriptor }>) {
  return <Link to="/$slug" params={{ slug: operation.business.slug }} className="font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{operation.business.name}</Link>
}

function ParameterList({ title, parameters, empty }: Readonly<{ title: string; parameters: readonly PublicOperationParameter[]; empty: string }>) {
  return (
    <div className="grid content-start gap-3">
      <h3 className="font-semibold text-foreground">{title}</h3>
      {parameters.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {parameters.map((parameter) => (
            <li key={`${parameter.group}:${parameter.name}`} className="rounded-card border border-border bg-card p-4">
              <p className="font-medium text-foreground"><code className="font-mono text-sm">{parameter.name}</code> <span className="text-sm font-normal text-muted-foreground">{parameter.type} · {parameter.group}</span></p>
              {parameter.description === undefined ? null : <p className="mt-1 text-sm text-muted-foreground">{parameter.description}</p>}
              {parameter.enumValues === undefined ? null : <p className="mt-1 text-xs text-muted-foreground">Allowed: {parameter.enumValues.join(', ')}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TermList({ terms }: Readonly<{ terms: PublicOperationDescriptor['commercial']['materialTerms'] }>) {
  if (terms.length === 0) return <p className="text-sm text-muted-foreground">No additional material terms are published.</p>
  return <dl className="grid gap-3 sm:grid-cols-2">{terms.map((term) => <Fact key={`${term.label}:${term.value}`} label={term.label} value={term.value} />)}</dl>
}

function PriceBreakdown({ operation }: Readonly<{ operation: PublicOperationDescriptor }>) {
  const breakdown = operation.commercial.priceBreakdown
  if (breakdown === undefined) {
    return (
      <div className="grid gap-1 rounded-lg border bg-muted/20 p-4">
        <p className="text-xs font-medium text-muted-foreground">Total price</p>
        <p className="font-mono text-lg font-semibold tabular-nums">{totalPrice(operation)}</p>
        <p className="text-xs text-muted-foreground">No separate fee breakdown is published for this capability.</p>
      </div>
    )
  }
  return (
    <section aria-labelledby="price-breakdown-heading" className="grid gap-3 rounded-lg border bg-muted/20 p-4">
      <h3 id="price-breakdown-heading" className="font-semibold text-foreground">Exact price breakdown</h3>
      <dl className="grid gap-3 sm:grid-cols-3">
        <Fact label="Provider price" value={formatCurrencyAmount(breakdown.providerQuotedAmount)} />
        <Fact label="Agentic Economy fee" value={formatCurrencyAmount(breakdown.agenticEconomyFee)} />
        <Fact label="Total authorization" value={formatCurrencyAmount(breakdown.totalBuyerAuthorization)} />
        <Fact label="Payment network" value={`Base (${breakdown.network})`} />
        <Fact label="Payment asset" value={`USDC (${breakdown.asset})`} />
      </dl>
      <p className="text-xs text-muted-foreground">The total authorization is the maximum charged for this call.</p>
    </section>
  )
}

function Example({ title, value, empty }: Readonly<{ title: string; value?: unknown; empty: string }>) {
  return (
    <section className="grid min-w-0 content-start gap-2 rounded-lg border bg-card p-4">
      <h3 className="font-semibold text-foreground">{title}</h3>
      {value === undefined
        ? <p className="text-sm leading-6 text-muted-foreground">{empty}</p>
        : <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs text-foreground"><code>{JSON.stringify(value, null, 2)}</code></pre>}
    </section>
  )
}

function Schema({ title, value }: Readonly<{ title: string; value: Readonly<Record<string, unknown>> }>) {
  return <section className="grid min-w-0 gap-2"><h3 className="font-semibold text-foreground">{title}</h3><pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs text-foreground"><code>{JSON.stringify(value, null, 2)}</code></pre></section>
}

function CommandStep({ number, title, code }: Readonly<{ number: number; title: string; code: string }>) {
  return <li className="grid min-w-0 gap-2"><h3 className="text-sm font-semibold text-foreground">{number}. {title}</h3><AeCopyCommand compact label={title} code={code} /></li>
}

function inspectCommand(operationRef: string): string {
  return `ae inspect '${operationRef}'`
}

function formatPrice(price: PublicOperationPrice): string {
  if (price.kind === 'on_request') return 'On request'
  if (price.kind === 'fixed') return formatCurrencyAmount(price.amount)
  return `${formatCurrencyAmount(price.minimum)}–${formatCurrencyAmount(price.maximum)}`
}

function totalPrice(operation: PublicOperationDescriptor): string {
  return operation.commercial.priceBreakdown === undefined
    ? formatPrice(operation.commercial.price)
    : formatCurrencyAmount(operation.commercial.priceBreakdown.totalBuyerAuthorization)
}

function authenticationLabel(operation: PublicOperationDescriptor): string {
  const authentication = operation.authentication
  if (authentication.kind === 'keyless') return 'Keyless provider access'
  if (authentication.kind === 'platform_credential') {
    return authentication.scheme === 'bearer'
      ? 'AE-managed bearer credential'
      : `AE-managed API key in ${authentication.in}: ${authentication.name}`
  }
  return authentication.kind === 'x402' ? 'x402 payment' : 'Unknown'
}

function label(value: string): string {
  return value.replaceAll('_', ' ')
}
