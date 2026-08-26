import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type FormEvent } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeSupplyEarningsCard } from './AeSupplyEarningsCard'
import {
  connectOwnerX402Server,
  reconnectOwnerProviderConnectionServer,
  retryOwnerProviderConnectionCleanupServer,
  revokeOwnerProviderConnectionServer,
} from '@/modules/capability-supply/supply-funnel.functions'
import type {
  OwnerProviderConnection,
  OwnerProviderEarningsReadback,
  OwnerSupplyFunnelReadback,
  OwnerSupplyOfferingReadback,
} from '@/modules/capability-supply/supply-funnel.functions'
import type { OwnerConnectReadinessReadback } from '@/modules/money/server'
import { formatExactAmount } from '@/modules/money/public'

export function AeSupplyPublisherHome({ readback, earnings, connect, connections = [] }: Readonly<{
  readback: OwnerSupplyFunnelReadback
  earnings: OwnerProviderEarningsReadback
  connect?: OwnerConnectReadinessReadback
  connections?: readonly OwnerProviderConnection[]
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
            <Link to="/owner/supply">Reload Operations</Link>
          </Button>
        </CardFooter>
      </Card>
    )
  }
  if (readback.kind === 'not_found') {
    return (
      <Card>
        <CardHeader className="p-5 pb-0">
          <CardTitle><h2 className="text-2xl font-semibold text-foreground">No supplier identity is available</h2></CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <p className="text-muted-foreground">Review the supplier requirements before publishing Operations.</p>
        </CardContent>
        <CardFooter className="p-5 pt-0">
          <Button asChild variant="default" className="min-h-11">
            <Link to="/for-providers">Review supplier setup</Link>
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
          <AlertDescription>The owner readback reached its bounded limit before every Operation could be joined. Reload Operations to try again.</AlertDescription>
        </Alert>
        <Button asChild variant="secondary" className="min-h-11 justify-self-start">
          <Link to="/owner/supply">Reload Operations</Link>
        </Button>
      </div>
    )
  }
  const { liquidity } = readback
  const isProductionLiquidity = liquidity.environment === 'production'
  return (
    <div className="grid gap-8">
      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Operations</h2>
          <Button asChild className="min-h-11">
            <Link to="/owner/offerings/new" search={{ next: 'supply' }}>Create Operation</Link>
          </Button>
        </div>
        {readback.offerings.length === 0 ? (
          <AeEmptyState
            title="No Operations yet"
            description="Create an Operation, then connect its source."
          />
        ) : (
          <ul className="m-0 grid list-none divide-y border-y border-border p-0">
            {readback.offerings.map((offering) => <OwnerOfferingRow key={offering.offeringRef} offering={offering} />)}
          </ul>
        )}
      </section>
      <OwnerProviderConnections businessId={readback.businessId} connections={connections} />
      <Card className="shadow-none">
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
      <OwnerEarningsCard
        earnings={earnings}
        {...(connect === undefined ? {} : { connect })}
      />
    </div>
  )
}
function OwnerEarningsCard({ earnings, connect }: Readonly<{
  earnings: OwnerProviderEarningsReadback
  connect?: OwnerConnectReadinessReadback
}>) {
  const router = useRouter()
  return (
    <AeSupplyEarningsCard
      readback={earnings}
      {...(connect === undefined ? {} : { connect })}
      onStatusRefreshed={() => router.invalidate()}
    />
  )
}

function OwnerProviderConnections({ businessId, connections }: Readonly<{
  businessId: string
  connections: readonly OwnerProviderConnection[]
}>) {
  const router = useRouter()
  const connectX402 = useServerFn(connectOwnerX402Server)
  const reconnect = useServerFn(reconnectOwnerProviderConnectionServer)
  const revoke = useServerFn(revokeOwnerProviderConnectionServer)
  const retryCleanup = useServerFn(retryOwnerProviderConnectionCleanupServer)
  const [resourceUrl, setResourceUrl] = useState('')
  const [busy, setBusy] = useState<string>()
  const [notice, setNotice] = useState<{ kind: 'error' | 'status'; text: string }>()

  async function refresh() {
    await router.invalidate()
    setNotice({ kind: 'status', text: 'Supplier connections updated.' })
  }

  async function submitConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const commandId = crypto.randomUUID()
    setBusy('new')
    setNotice(undefined)
    try {
      const result = await connectX402({
        data: {
          businessId,
          resourceUrl,
          commandId,
        },
      })
      if (result.kind === 'refused') {
        setNotice({ kind: 'error', text: connectionRefusalCopy(result.code) })
        return
      }
      setResourceUrl('')
      await refresh()
    } catch {
      setNotice({ kind: 'error', text: 'The supplier connection could not be saved. Try again.' })
    } finally {
      setBusy(undefined)
    }
  }

  async function updateConnection(
    action: 'reconnect' | 'revoke',
    connection: OwnerProviderConnection,
  ) {
    const commandId = crypto.randomUUID()
    setBusy(connection.connectionRef)
    setNotice(undefined)
    const data = {
      connectionRef: connection.connectionRef,
      commandId,
      expectedAuthorityGeneration: connection.authorityGeneration,
      expectedAuthorityDigest: connection.authorityDigest,
    }
    try {
      const result = action === 'reconnect'
        ? await reconnect({ data })
        : await revoke({ data })
      if (result.kind === 'refused') {
        setNotice({ kind: 'error', text: connectionRefusalCopy(result.code) })
        return
      }
      await refresh()
    } catch {
        setNotice({ kind: 'error', text: 'The supplier connection could not be updated. Try again.' })
    } finally {
      setBusy(undefined)
    }
  }
  async function retryConnectionCleanup(connection: OwnerProviderConnection) {
    setBusy(connection.connectionRef)
    setNotice(undefined)
    try {
      const result = await retryCleanup({
        data: {
          connectionRef: connection.connectionRef,
          commandId: crypto.randomUUID(),
        },
      })
      if (result.kind === 'refused') {
        setNotice({ kind: 'error', text: connectionRefusalCopy(result.code) })
        return
      }
      await refresh()
    } catch {
      setNotice({ kind: 'error', text: 'Provider cleanup could not be restarted. Try again.' })
    } finally {
      setBusy(undefined)
    }
  }


  return (
    <Card>
      <CardHeader className="grid gap-2 p-5 pb-0">
        <CardTitle><h2 className="text-lg font-semibold text-foreground">Supplier connections</h2></CardTitle>
        <p className="text-sm text-muted-foreground">Connect a hosted x402 endpoint so Agentic Economy can route paid calls without collecting an API key or wallet secret. Then open an operation and select this connection as its access authority.</p>
      </CardHeader>
      <CardContent className="grid gap-5 p-5">
        {connections.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>No provider connection yet</EmptyTitle>
              <EmptyDescription>Add the public HTTPS endpoint that returns the x402 payment challenge for your operation.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0">
            {connections.map((connection) => (
              <li key={connection.connectionRef} className="grid min-w-0 gap-3 rounded-md border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-1">
                    <p className="font-semibold text-foreground">{providerConnectionStatus(connection)}</p>
                    <p className="break-all text-sm text-muted-foreground">{connection.grantedResources[0] ?? connection.providerAccountRef}</p>
                  </div>
                  {(connection.lifecycle === 'active' || connection.lifecycle === 'reauthorization_required') ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        className="min-h-11"
                        disabled={busy !== undefined}
                        onClick={() => void updateConnection('reconnect', connection)}
                      >
                        {connection.lifecycle === 'active' ? 'Refresh authority' : 'Reconnect'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={busy !== undefined}
                        onClick={() => void updateConnection('revoke', connection)}
                      >
                        Revoke
                      </Button>
                    </div>
                  ) : connection.lifecycle === 'cleanup_required' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11"
                      disabled={busy !== undefined}
                      onClick={() => void retryConnectionCleanup(connection)}
                    >
                      Retry cleanup
                    </Button>
                  ) : null}
                </div>
                <details className="text-sm text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-foreground">Technical details</summary>
                  <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div><dt className="font-medium">Connection</dt><dd className="m-0 break-all">{connection.connectionRef}</dd></div>
                    <div><dt className="font-medium">Authority generation</dt><dd className="m-0">{connection.authorityGeneration}</dd></div>
                    <div><dt className="font-medium">Adapter</dt><dd className="m-0">{connection.adapterId}</dd></div>
                    <div><dt className="font-medium">Last updated</dt><dd className="m-0">{new Date(connection.updatedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC</dd></div>
                  </dl>
                </details>
              </li>
            ))}
          </ul>
        )}
        <form className="grid gap-3" onSubmit={submitConnection}>
          <div className="grid gap-1.5">
            <label htmlFor="provider-x402-resource-url" className="text-sm font-medium text-foreground">x402 resource URL</label>
            <Input
              id="provider-x402-resource-url"
              name="resourceUrl"
              type="url"
              inputMode="url"
              autoComplete="url"
              maxLength={2_048}
              placeholder="https://api.example.com/paid-operation"
              value={resourceUrl}
              onChange={(event) => setResourceUrl(event.target.value)}
              aria-describedby="provider-x402-resource-url-hint"
              required
            />
            <p id="provider-x402-resource-url-hint" className="text-sm text-muted-foreground">Use the exact public route that returns HTTP 402 when called without payment.</p>
          </div>
          <Button type="submit" className="min-h-11 justify-self-start" disabled={busy !== undefined}>
            {busy === 'new' ? 'Connecting…' : 'Connect supplier'}
          </Button>
        </form>
        <p
          role={notice?.kind === 'error' ? 'alert' : 'status'}
          className={notice?.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
        >
          {notice?.text ?? ''}
        </p>
      </CardContent>
    </Card>
  )
}

function providerConnectionStatus(connection: OwnerProviderConnection): string {
  if (connection.lifecycle === 'active') return connection.available ? 'Connection active' : 'Connection authority expired'
  if (connection.lifecycle === 'reauthorization_required') return 'Reconnect required'
  if (connection.lifecycle === 'revocation_pending') return 'Revocation in progress'
  if (connection.lifecycle === 'cleanup_required') return 'Cleanup required'
  return 'Revoked'
}

function connectionRefusalCopy(code: string): string {
  if (code === 'connection_resource_conflict') return 'This x402 endpoint is already connected to another provider.'
  if (code === 'credential_resource_conflict') return 'This endpoint is already connected with a different authority method.'
  if (code === 'authentication_required' || code === 'authorization_denied') return 'Sign in as the provider owner and try again.'
  if (code === 'authority_conflict') return 'This connection changed in another session. Reload and try again.'
  if (code === 'invalid_resource') return 'Enter a public HTTPS x402 resource URL.'
  return 'The provider connection could not be updated. Reload and try again.'
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
    { label: 'Operation', value: `${offering.offeringRef} · revision ${offering.revision}` },
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
