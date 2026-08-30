import { Link, useRouter } from '@tanstack/react-router'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { AeOwnerProviderConnections } from './AeOwnerProviderConnections'
import { providerConnectionTargetId } from './provider-connection-target'
import { AeSupplyEarningsCard } from './AeSupplyEarningsCard'
import { Badge } from '@/components/ui/badge'
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
      <AeEmptyState
        title="Your operations are unavailable"
        description="We could not load your operation controls. Try again to continue."
        role="alert"
        action={
          <Button asChild className="min-h-touch">
            <Link to="/owner/supply">Reload Operations</Link>
          </Button>
        }
      />
    )
  }
  if (readback.kind === 'not_found') {
    return (
      <AeEmptyState
        title="No supplier identity is available"
        description="Review the supplier requirements before publishing Operations."
        action={
          <Button asChild className="min-h-touch">
            <Link to="/for-providers">Review supplier setup</Link>
          </Button>
        }
      />
    )
  }
  if (readback.kind === 'incomplete') {
    return (
      <div className="grid gap-4">
        <Alert>
          <AlertTitle>Operations need repair</AlertTitle>
          <AlertDescription>The owner readback reached its bounded limit before every Operation could be joined. Reload Operations to try again.</AlertDescription>
        </Alert>
        <Button asChild variant="secondary" className="min-h-touch justify-self-start">
          <Link to="/owner/supply">Reload Operations</Link>
        </Button>
      </div>
    )
  }
  const { liquidity } = readback
  const isProductionLiquidity = liquidity.environment === 'production'
  return (
    <div className="grid gap-8">
      <AeSection
        title="Operations"
        description="Connect a source, then keep publication current. Open a row to continue setup."
      >
        {readback.offerings.length === 0 ? (
          <AeEmptyState
            title="No Operations yet"
            description="Create an Operation, then connect its source."
            action={
              <Button asChild className="min-h-touch">
                <Link to="/owner/offerings/new" search={{ next: 'supply' }}>Create Operation</Link>
              </Button>
            }
          />
        ) : (
          <SupplyOfferingsTable offerings={readback.offerings} />
        )}
      </AeSection>
      <AeOwnerProviderConnections businessId={readback.businessId} connections={connections} />
      <AeSection
        title={isProductionLiquidity ? 'Operational usage' : `Operational usage · ${liquidity.environment}`}
        description={isProductionLiquidity
          ? 'These are operational observations only. They are not Qualified Use or revenue, and setup or test calls do not create earnings.'
          : `These are ${liquidity.environment} operational observations only. They are not production proof, Qualified Use, or revenue, and setup or test calls do not create earnings.`}
      >
        <AeFactList
          facts={[
            { label: 'Environment', value: liquidity.environment },
            { label: 'Observed calls', value: String(readback.callLog.length) },
            { label: 'Filled observations', value: String(liquidity.fillCount) },
            { label: 'Zero-result observations', value: String(liquidity.zeroCount) },
            { label: 'First-success p50', value: liquidity.firstSuccessP50Ms === undefined ? 'Not observed' : `${liquidity.firstSuccessP50Ms} ms` },
            { label: 'First-success p95', value: liquidity.firstSuccessP95Ms === undefined ? 'Not observed' : `${liquidity.firstSuccessP95Ms} ms` },
            { label: 'Depth samples', value: String(liquidity.depthSamples) },
          ]}
        />
        {readback.activityTruncated ? <p className="text-sm text-muted-foreground">Showing the 50 most recent activity records.</p> : null}
      </AeSection>
      <AeSection id="earnings" title="Earnings and payouts" description="Source-recorded supplier earnings. Setup or test calls do not create earnings.">
        <OwnerEarningsCard
          earnings={earnings}
          {...(connect === undefined ? {} : { connect })}
        />
      </AeSection>
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

function SupplyOfferingsTable({ offerings }: { offerings: readonly OwnerSupplyOfferingReadback[] }) {
  const columns = useMemo<ColumnDef<OwnerSupplyOfferingReadback, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (item) => item.name,
        header: ({ column }) => <AeOperatorSortableHeader label="Operation" column={column} />,
        cell: ({ row }) => (
          <div className="grid min-w-[12rem] gap-0.5">
            <span className="font-medium">{row.original.name}</span>
            <span className="line-clamp-2 text-xs text-muted-foreground">{row.original.summary}</span>
          </div>
        ),
      },
      {
        id: 'status',
        accessorFn: (item) => item.status,
        header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        id: 'live',
        accessorFn: (item) => item.live.available,
        header: 'Live',
        cell: ({ row }) => (row.original.live.available ? 'Available' : 'Unavailable'),
      },
      {
        id: 'continuation',
        header: 'Next action',
        cell: ({ row }) => {
          const continuation = supplierContinuationForOffering(row.original)
          return (
            <Button asChild size="sm" variant="secondary" className="min-h-touch whitespace-nowrap">
              <a href={continuation.href}>{continuation.label}</a>
            </Button>
          )
        },
      },
    ],
    [],
  )

  return (
    <AeRecordTable
      columns={columns}
      data={offerings}
      caption="Operations"
      countLabel="Operations"
      filterPlaceholder="Filter Operations…"
      getRowHref={(item) => `/owner/supply/${encodeURIComponent(item.offeringRef)}`}
    />
  )
}

type SupplierContinuation = Readonly<{
  label:
    | 'Continue description'
    | 'Connect provider'
    | 'Refresh and re-admit'
    | 'Re-admit provider authority'
    | 'Choose replacement connection'
    | 'Recheck readiness'
    | 'Inspect incompatibility'
    | 'Republish'
    | 'View live Operation'
    | 'Review earnings'
  href: string
}>

function supplierContinuationForOffering(
  offering: OwnerSupplyOfferingReadback,
): SupplierContinuation {
  const detailHref = `/owner/supply/${encodeURIComponent(offering.offeringRef)}`
  const publicationState = offering.publication?.state
  const credentialNeedsAttention =
    offering.readiness.outcome === 'credential_unavailable'
    || offering.readiness.outcome === 'credential_rejected'
    || offering.actionableReason === 'credential_unavailable'
    || offering.actionableReason === 'credential_rejected'
  const authorityStale = offering.actionableReason === 'authority_stale'
  const boundConnectionRef = offering.authority?.kind === 'provider_connection'
    ? offering.authority.connectionRef
    : undefined

  if (offering.status === 'retired' || publicationState === 'superseded') {
    return { label: 'Review earnings', href: '/owner/supply#earnings' }
  }
  if (publicationState === 'incompatible' || offering.lifecycle.state === 'incompatible') {
    return { label: 'Inspect incompatibility', href: `${detailHref}#incompatibility` }
  }
  if (publicationState === 'withdrawn' || offering.lifecycle.state === 'withdrawn') {
    return { label: 'Republish', href: `${detailHref}#publication-maintenance` }
  }
  if (offering.currentStep === 'describe') {
    return { label: 'Continue description', href: `${detailHref}#description` }
  }
  if (authorityStale) {
    if (boundConnectionRef === undefined) {
      return {
        label: 'Re-admit provider authority',
        href: `${detailHref}#provider`,
      }
    }
    const rebindQuery = `?rebind=${encodeURIComponent(offering.offeringRef)}`
    return {
      label: 'Refresh and re-admit',
      href: `/owner/supply${rebindQuery}#${encodeURIComponent(providerConnectionTargetId(boundConnectionRef))}`,
    }
  }
  if (credentialNeedsAttention) {
    return {
      label: 'Choose replacement connection',
      href: `${detailHref}#credential-recovery`,
    }
  }
  if (offering.currentStep === 'admission') {
    return { label: 'Connect provider', href: `${detailHref}#provider` }
  }
  if (offering.live.available && offering.publication?.operationRef !== undefined) {
    return {
      label: 'View live Operation',
      href: `/operations/${encodeURIComponent(offering.publication.operationRef)}`,
    }
  }
  if (offering.currentStep === 'readiness' || !offering.live.available) {
    return { label: 'Recheck readiness', href: `${detailHref}#readiness` }
  }
  return { label: 'Review earnings', href: '/owner/supply#earnings' }
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

  return <AeFactList facts={facts} density={detail ? 'default' : 'compact'} />
}
