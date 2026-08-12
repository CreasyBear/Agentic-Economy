import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'

import { AeSupplyEarningsCard } from './AeSupplyEarningsCard'
import type { OwnerProviderEarningsReadback, OwnerSupplyFunnelReadback, OwnerSupplyOfferingReadback } from '@/modules/capability-supply/supply-funnel.functions'
import type { OwnerConnectReadinessReadback } from '@/modules/money/server'
import { formatExactAmount } from '@/modules/money/public'

export function AeSupplyPublisherHome({ readback, earnings, connect }: Readonly<{
  readback: OwnerSupplyFunnelReadback
  earnings: OwnerProviderEarningsReadback
  connect?: OwnerConnectReadinessReadback
}>) {
  if (readback.kind === 'error') {
    return (
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle><h2 className="text-2xl font-semibold text-foreground">Your operations are unavailable</h2></CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <p className="text-muted-foreground">We could not load your operation controls. Try again to continue.</p>
        </CardContent>
        <CardFooter className="p-5 pt-0">
          <Button asChild variant="default" className="min-h-11">
            <Link to="/owner/supply">Reload services</Link>
          </Button>
        </CardFooter>
      </Card>
    )
  }
  if (readback.kind === 'not_found') {
    return (
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle><h2 className="text-2xl font-semibold text-foreground">Claim your provider identity to publish</h2></CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <p className="text-muted-foreground">A programmable-provider claim connects each admitted operation to the right owner.</p>
        </CardContent>
        <CardFooter className="p-5 pt-0">
          <Button asChild variant="default" className="min-h-11">
            <Link to="/claim/form" search={{ source: 'supply' }}>Claim provider identity</Link>
          </Button>
        </CardFooter>
      </Card>
    )
  }
  if (readback.kind === 'incomplete') {
    return (
      <div className="grid gap-4">
        <Alert>
          <AlertTitle>Operations need repair</AlertTitle>
          <AlertDescription>The owner readback reached its bounded limit before every operation could be joined. Reload services to try again.</AlertDescription>
        </Alert>
        <Button asChild variant="secondary" className="min-h-11 justify-self-start">
          <Link to="/owner/supply">Reload services</Link>
        </Button>
      </div>
    )
  }
  const { liquidity } = readback
  const isProductionLiquidity = liquidity.environment === 'production'
  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <p className="block text-sm font-semibold text-muted-foreground">OPERATION CONTROL</p>
        <h2 className="text-2xl font-semibold text-foreground">Publish and control your operations</h2>
        <p className="block text-muted-foreground">Create an Offering, admit its source, observe readiness, test it, and control its publication. Every fact below comes from the current owner readback.</p>
      </header>
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle><h2 className="text-lg font-semibold text-foreground">Your operations</h2></CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          {readback.offerings.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No operations yet.</EmptyTitle>
                <EmptyDescription>Create an Offering, then admit its operation source.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="m-0 grid list-none gap-3 p-0">
              {readback.offerings.map((offering) => <OwnerOfferingRow key={offering.offeringRef} offering={offering} />)}
            </ul>
          )}
        </CardContent>
        <CardFooter className="p-5 pt-0">
          <Button asChild variant="default" className="min-h-11">
            <Link to="/owner/offerings/new" search={{ next: 'supply' }}>Create an Offering</Link>
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle><h2 className="text-lg font-semibold text-foreground">Operational usage{isProductionLiquidity ? '' : ` · ${liquidity.environment}`}</h2></CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-5">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1"><dt className="text-sm font-medium text-muted-foreground">Environment</dt><dd className="m-0 text-foreground">{liquidity.environment}</dd></div>
            <div className="grid gap-1"><dt className="text-sm font-medium text-muted-foreground">Observed calls</dt><dd className="m-0 text-foreground">{readback.callLog.length}</dd></div>
            <div className="grid gap-1"><dt className="text-sm font-medium text-muted-foreground">Filled observations</dt><dd className="m-0 text-foreground">{liquidity.fillCount}</dd></div>
            <div className="grid gap-1"><dt className="text-sm font-medium text-muted-foreground">Zero-result observations</dt><dd className="m-0 text-foreground">{liquidity.zeroCount}</dd></div>
            <div className="grid gap-1"><dt className="text-sm font-medium text-muted-foreground">First-success p50</dt><dd className="m-0 text-foreground">{liquidity.firstSuccessP50Ms === undefined ? 'Not observed' : `${liquidity.firstSuccessP50Ms} ms`}</dd></div>
            <div className="grid gap-1"><dt className="text-sm font-medium text-muted-foreground">First-success p95</dt><dd className="m-0 text-foreground">{liquidity.firstSuccessP95Ms === undefined ? 'Not observed' : `${liquidity.firstSuccessP95Ms} ms`}</dd></div>
            <div className="grid gap-1"><dt className="text-sm font-medium text-muted-foreground">Depth samples</dt><dd className="m-0 text-foreground">{liquidity.depthSamples}</dd></div>
          </dl>
          {readback.activityTruncated ? <p className="text-sm text-muted-foreground">Showing the 50 most recent activity records.</p> : null}
          <p className="text-sm text-muted-foreground">{isProductionLiquidity ? 'These are operational observations only. They are not Qualified Use or revenue, and setup or test calls do not create earnings.' : `These are ${liquidity.environment} operational observations only. They are not production proof, Qualified Use, or revenue, and setup or test calls do not create earnings.`}</p>
        </CardContent>
      </Card>
      <AeSupplyEarningsCard readback={earnings} {...(connect === undefined ? {} : { connect })} />
    </div>
  )
}

function OwnerOfferingRow({ offering }: Readonly<{ offering: OwnerSupplyOfferingReadback }>) {
  return (
    <li className="grid gap-4 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <p className="block font-semibold text-foreground">{offering.name}</p>
          <p className="block text-sm text-muted-foreground">{offering.summary}</p>
        </div>
        <Button asChild variant="secondary" className="min-h-11">
          <Link to="/owner/supply/$offeringRef" params={{ offeringRef: offering.offeringRef }}>Open operation</Link>
        </Button>
      </div>
      <AeOwnerOperationFacts offering={offering} />
    </li>
  )
}

export function AeOwnerOperationFacts({
  offering,
  detail = false,
}: Readonly<{ offering: OwnerSupplyOfferingReadback; detail?: boolean }>) {
  const publication = offering.publication
  const source = publication?.source ?? offering.source
  const pricing = publication?.pricing ?? offering.pricing
  const readiness = publication?.readiness ?? offering.readiness
  const lifecycle = publication?.lifecycle ?? offering.lifecycle
  const binding = publication?.binding
  const paidAmount = pricing?.config.paidAmount
  const price = paidAmount === undefined
    ? 'Not published'
    : `${paidAmount.currency} ${formatExactAmount(paidAmount) ?? '—'} · units ${paidAmount.units} · exponent ${paidAmount.exponent}`
  const readinessWindow = [
    readiness.observedAt === undefined ? undefined : `observed ${new Date(readiness.observedAt).toISOString()}`,
    readiness.validUntil === undefined ? undefined : `valid until ${new Date(readiness.validUntil).toISOString()}`,
  ].filter((value): value is string => value !== undefined).join(' · ')

  const facts = [
    { label: 'Offering', value: `${offering.offeringRef} · revision ${offering.revision}` },
    { label: 'Operation ref', value: publication?.operationRef ?? 'Not published' },
    { label: 'Publication', value: publication === undefined ? 'Not published' : `${publication.publicationRef} · revision ${publication.publicationRevision}` },
    { label: 'Binding ID', value: binding?.bindingId ?? 'Not published' },
    { label: 'Adapter', value: binding?.adapterId ?? 'Not published' },
    { label: 'Endpoint', value: binding?.endpointUrl ?? offering.endpointUrl ?? 'Not supplied' },
    { label: 'Source', value: source === undefined ? 'Not supplied' : `${source.kind} · ${source.revision}` },
    { label: 'Source digest', value: source?.digest ?? 'Not supplied' },
    { label: 'Pricing config', value: pricing === undefined ? 'Not published' : `${pricing.config.version} · ${pricing.config.unit}` },
    { label: 'Exact price', value: price },
    { label: 'Price digest', value: pricing?.priceDigest ?? 'Not published' },
    { label: 'Readiness', value: readiness.outcome },
    { label: 'Readiness window', value: readinessWindow || 'Unobserved' },
    { label: 'Readiness evidence', value: readiness.evidenceRefs.length === 0 ? 'None recorded' : readiness.evidenceRefs.join(', ') },
    { label: 'Readiness target digest', value: publication?.readiness.targetDigest ?? 'Not recorded' },
    { label: 'Readiness request digest', value: publication?.readiness.requestDigest ?? 'Not recorded' },
    { label: 'Readiness response', value: publication?.readiness.responseStatus === undefined ? 'Not recorded' : `${publication.readiness.responseStatus}${publication.readiness.responseContentType === undefined ? '' : ` · ${publication.readiness.responseContentType}`}` },
    { label: 'Readiness response digest', value: publication?.readiness.responseDigest ?? 'Not recorded' },
    { label: 'Lifecycle', value: lifecycle.reasons.length === 0 ? lifecycle.state : `${lifecycle.state} · ${lifecycle.reasons.join(', ')}` },
    { label: 'Live status', value: offering.live.available ? 'available' : `unavailable${offering.live.reason === undefined ? '' : ` · ${offering.live.reason}`}` },
  ] as const

  return (
    <dl className={`grid gap-x-4 gap-y-3 border-t border-border pt-4 text-sm ${detail ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
      {facts.map((fact) => (
        <div key={fact.label} className="grid min-w-0 gap-0.5">
          <dt className="font-medium text-muted-foreground">{fact.label}</dt>
          <dd className="m-0 break-all text-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
