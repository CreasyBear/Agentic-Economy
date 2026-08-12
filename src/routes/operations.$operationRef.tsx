import { Link, createFileRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
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
  const invokeInput = inputExample === undefined
    ? '"$AE_INPUT_JSON"'
    : `'${JSON.stringify(inputExample.input).replaceAll("'", "'\\''")}'`

  return (
    <AePublicShell>
      <article className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 md:px-6 md:py-12">
        <header className="grid max-w-4xl gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Current Operation</Badge>
            <Badge variant={operation.availability.posture === 'routeable' ? 'default' : 'secondary'}>
              {label(operation.availability.posture)}
            </Badge>
          </div>
          <div className="grid gap-2">
            <p className="text-sm font-medium text-muted-foreground">{operation.business.name}</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">{operation.offering.label}</h1>
            <p className="max-w-3xl text-lg text-muted-foreground">{operation.summary}</p>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Fact label="Operation reference"><Ref value={operation.operationRef} /></Fact>
            <Fact label="Operation ID" value={operation.operationId} />
            <Fact label="Capability" value={`${operation.contract.capabilityId} · version ${operation.contract.version}`} />
            <Fact label="Supplier"><BusinessLink operation={operation} /></Fact>
          </dl>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="grid min-w-0 gap-8">
            <Section title="Availability" description="Current routeability and the readiness window attached to this exact reference.">
              <dl className="grid gap-3 sm:grid-cols-3">
                <Fact label="Posture" value={label(operation.availability.posture)} />
                <TimeFact label="Observed" value={operation.availability.observedAt} />
                <TimeFact label="Valid until" value={operation.availability.validUntil} />
                {operation.availability.reason === undefined ? null : <Fact label="Reason" value={label(operation.availability.reason)} />}
              </dl>
            </Section>

            <Section title="Inputs" description="Use values that satisfy the technical input schema below.">
              {operation.parameters === undefined ? (
                <p className="text-sm text-muted-foreground">No flat parameter list is published. Inspect the input schema before invoking.</p>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2">
                  <ParameterList title="Required parameters" parameters={requiredParameters} empty="No required parameters." />
                  <ParameterList title="Optional parameters" parameters={optionalParameters} empty="No optional parameters." />
                </div>
              )}
            </Section>

            <Section title="Commercial terms" description="Price and relationship facts published for this exact current Operation.">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Fact label="Price" value={formatPrice(operation.commercial.price)} />
                <Fact label="Price digest" value={operation.commercial.priceEvidence?.priceDigest ?? 'Not published'} />
                <Fact label="Price source" value={operation.commercial.priceEvidence?.sourceRef ?? 'Not published'} />
                <Fact label="Price evidence" value={operation.commercial.priceEvidence?.evidenceRefs.join(', ') || 'Not published'} />
                {operation.commercial.priceEvidence?.observedAt === undefined ? null : (
                  <TimeFact label="Price observed" value={operation.commercial.priceEvidence.observedAt} />
                )}
                {operation.commercial.priceEvidence?.validUntil === undefined ? null : (
                  <TimeFact label="Price valid until" value={operation.commercial.priceEvidence.validUntil} />
                )}
                <Fact label="Commercial relationship" value={`${label(operation.commercial.relationship.kind)} — ${operation.commercial.relationship.summary}`} />
                <Fact label="Business relation"><BusinessLink operation={operation} /></Fact>
              </dl>
              <TermList terms={operation.commercial.materialTerms} />
            </Section>

            <Section title="Data use" description="What input may be released, when, to whom, and why.">
              <ul className="m-0 grid list-none gap-3 p-0">
                {operation.dataUse.length === 0 ? <li className="text-sm text-muted-foreground">No data-use effects are declared.</li> : operation.dataUse.map((effect) => (
                  <li key={effect.effectId} className="rounded-lg border border-border p-4">
                    <p className="font-medium text-foreground">{label(effect.classification)} · {effect.inputPointer}</p>
                    <p className="text-sm text-muted-foreground">Effect: {effect.effectId} · {label(effect.phase)} · {label(effect.recipient)} · {effect.purposes.join(', ')}</p>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Effects and authority" description="Consequences, approval requirements, and reversibility declared by the contract.">
              <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
                {operation.effects.length === 0 ? <li className="text-sm text-muted-foreground">No consequential effects are declared.</li> : operation.effects.map((effect) => (
                  <li key={effect.effectId} className="rounded-lg border border-border p-4">
                    <p className="font-medium text-foreground">{label(effect.class)}</p>
                    <p className="text-sm text-muted-foreground">Effect: {effect.effectId} · Authority: {label(effect.authority)} · Reversibility: {label(effect.reversibility)}</p>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Evidence and recovery" description="What supports completion and how uncertain work must be handled.">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Fact label="Idempotency" value={label(operation.recovery.idempotency)} />
                <Fact label="Recovery" value={label(operation.recovery.recovery)} />
                <Fact label="Cancellation" value={label(operation.cancellation.kind)} />
                <Fact label="Authentication" value={authenticationLabel(operation)} />
              </dl>
              <ul className="m-0 grid list-none gap-3 p-0">
                {operation.evidence.length === 0 ? <li className="text-sm text-muted-foreground">No output evidence pointers are declared.</li> : operation.evidence.map((evidence) => (
                  <li key={evidence.evidenceId} className="rounded-lg border border-border p-4 text-sm">
                    <span className="font-medium text-foreground">{label(evidence.purpose)}</span>
                    <span className="text-muted-foreground"> · {evidence.evidenceId} · {evidence.outputPointer}</span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Provenance" description="Publication and source class for the current descriptor.">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Fact label="Publisher" value={label(operation.provenance.publisher)} />
                <Fact label="Source kind" value={label(operation.provenance.sourceKind)} />
                <Fact label="Transport" value={`${operation.transport.method}${operation.transport.pathTemplate === undefined ? '' : ` ${operation.transport.pathTemplate}`}`} />
                <Fact label="Request timeout" value={`${operation.transport.requestTimeoutMs} ms`} />
              </dl>
            </Section>

            <details className="rounded-xl border border-border bg-card">
              <summary className="flex min-h-11 cursor-pointer items-center px-5 py-4 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Technical input and output schemas
              </summary>
              <div className="grid gap-5 border-t border-border p-5">
                <Schema title="Input JSON Schema" value={operation.contract.inputJsonSchema} />
                <Schema title="Output JSON Schema" value={operation.contract.outputJsonSchema} />
              </div>
            </details>
          </div>

          {operation.availability.posture === 'routeable' ? (
            <aside className="grid gap-4 lg:sticky lg:top-6" aria-labelledby="execution-title">
              <Card className="gap-5">
                <CardHeader>
                  <h2 id="execution-title" className="text-xl font-semibold text-foreground">Use this exact Operation</h2>
                  <CardDescription>Inspect, connect once, invoke with a stable idempotency key, then follow the returned invocation reference.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="m-0 grid list-none gap-5 p-0">
                    <CommandStep number={1} title="Inspect" code={`npm run -s ae -- inspect '${operation.operationRef}' --json`} />
                    <CommandStep number={2} title="Connect" code="npm run -s ae -- connect --json" />
                    <CommandStep number={3} title="Invoke" code={`npm run -s ae -- invoke '${operation.operationRef}' ${invokeInput} --idempotency-key "$AE_IDEMPOTENCY_KEY" --json`} />
                    <CommandStep number={4} title="Status" code={'npm run -s ae -- status "$AE_INVOCATION_REF" --json'} />
                  </ol>
                </CardContent>
                <CardContent className="border-t border-border pt-5">
                  <p className="text-sm text-muted-foreground">Connect may reveal an AE caller key once. Save it securely when shown; this page never receives, stores, or displays that secret. Replace only your input, idempotency key, and returned invocation reference.</p>
                </CardContent>
              </Card>
            </aside>
          ) : (
            <aside className="grid gap-4 lg:sticky lg:top-6" aria-labelledby="availability-title">
              <Card className="gap-5">
                <CardHeader>
                  <h2 id="availability-title" className="text-xl font-semibold text-foreground">
                    {operation.availability.posture === 'integrated' ? 'Setup required before invocation' : 'Currently unavailable'}
                  </h2>
                  <CardDescription>
                    AE reports {label(operation.availability.reason ?? operation.availability.posture)} for this exact Operation. Its current contract, commercial, and provenance facts remain available to inspect, but it cannot be invoked now.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Button asChild className="min-h-11"><Link to="/" search={{ q: operation.operationRef }}>Search current Operations</Link></Button>
                  <Button asChild variant="secondary" className="min-h-11"><Link to="/">Back to Ask</Link></Button>
                </CardContent>
              </Card>
            </aside>
          )}
        </div>
      </article>
    </AePublicShell>
  )
}

function OperationUnavailable({ result }: Readonly<{ result: Exclude<PublicOperationDetailRouteResult, { kind: 'found' }> }>) {
  const presentation = result.kind === 'not_found'
    ? {
        title: 'This exact Operation is unknown or no longer current',
        description: 'AE has no current descriptor for this reference, so no historical terms, price, or invocation steps are shown.',
      }
    : result.kind === 'source_unavailable'
      ? {
          title: 'Operation details are unavailable',
          description: 'AE cannot verify the current descriptor right now, so no commercial facts or invocation steps are shown.',
        }
      : {
          title: 'This Operation is not currently available',
          description: `AE reports ${label(result.reason)} for this exact reference. No commercial facts or invocation steps are shown.`,
        }
  return (
    <AePublicShell>
      <section className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-16 md:px-6">
        <div className="grid gap-3">
          <Badge variant="outline">Unavailable</Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">{presentation.title}</h1>
          <p className="text-muted-foreground">{presentation.description}</p>
          <Ref value={result.operationRef} />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild className="min-h-11"><Link to="/" search={{ q: result.operationRef }}>Search current Operations</Link></Button>
          <Button asChild variant="secondary" className="min-h-11"><Link to="/">Back to Ask</Link></Button>
        </div>
      </section>
    </AePublicShell>
  )
}

function OperationDetailPending() {
  return (
    <AePublicShell>
      <section className="mx-auto w-full max-w-3xl px-4 py-16 md:px-6" aria-busy="true">
        <p className="text-muted-foreground">Checking the exact current Operation…</p>
      </section>
    </AePublicShell>
  )
}

function OperationDetailError() {
  return <OperationUnavailable result={{ kind: 'source_unavailable', operationRef: 'Requested reference' }} />
}

function Section({ title, description, children }: Readonly<{ title: string; description: string; children: ReactNode }>) {
  return (
    <section className="grid gap-5 border-t border-border pt-8">
      <div className="grid gap-1">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
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
            <li key={`${parameter.group}:${parameter.name}`} className="rounded-lg border border-border p-4">
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

function Schema({ title, value }: Readonly<{ title: string; value: Readonly<Record<string, unknown>> }>) {
  return <section className="grid min-w-0 gap-2"><h3 className="font-semibold text-foreground">{title}</h3><pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs text-foreground"><code>{JSON.stringify(value, null, 2)}</code></pre></section>
}

function CommandStep({ number, title, code }: Readonly<{ number: number; title: string; code: string }>) {
  return <li className="grid min-w-0 gap-2"><h3 className="text-sm font-semibold text-foreground">{number}. {title}</h3><pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs text-foreground"><code>{code}</code></pre></li>
}

function formatPrice(price: PublicOperationPrice): string {
  if (price.kind === 'on_request') return 'On request'
  if (price.kind === 'fixed') return formatCurrencyAmount(price.amount)
  return `${formatCurrencyAmount(price.minimum)}–${formatCurrencyAmount(price.maximum)}`
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
