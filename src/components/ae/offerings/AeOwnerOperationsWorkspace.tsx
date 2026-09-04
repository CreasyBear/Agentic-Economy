import { Await, Link, useLocation, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useReverification } from '@clerk/tanstack-react-start'
import type { SortingState } from '@tanstack/react-table'
import { Suspense, useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeWorkspaceGeneral } from '@/components/ae/settings/AeWorkspaceGeneral'
import { AeOwnerProviderConnections } from '@/components/ae/supply/AeOwnerProviderConnections'
import { AeSupplyEarningsCard } from '@/components/ae/supply/AeSupplyEarningsCard'
import { AeStatusCard } from '@/components/ae/status/AeStatusCard'
import { AeCapabilityList } from '@/components/ae/status/AeCapabilityList'
import { AeOwnerOfferingsList, type OwnerOfferingSummary } from './AeOwnerOfferings'
import { projectOwnerOperations, type OwnerOperationsProjectionRow } from './owner-operations-projection'
import { ensureSupplierBusinessServer } from './owner-offering.functions'
import type {
  OwnerOperationsConnectionsResult,
  OwnerOperationsConnectionsDetailResult,
  OwnerOperationsInventoryResult,
  OwnerOperationsIdentityDetailResult,
  OwnerOperationsLifecycleResult,
  OwnerOperationsPayoutResult,
  OwnerOperationsPublicStatusResult,
  OwnerProviderOffboardingResult,
} from './owner-operations.functions'
import {
  cancelOwnerProviderOffboardingServer,
  readOwnerOperationsConnectionsDetailServer,
  readOwnerOperationsIdentityDetailServer,
  resumeOwnerProviderOffboardingServer,
  startOwnerProviderOffboardingServer,
} from './owner-operations.functions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import type { OfferingRef } from '@/modules/common/ids'
import { renameSupplierDisplayNameServer } from '@/lib/server/owner-workspace.functions'
import { readOwnerProviderEarningsServer } from '@/modules/capability-supply/supply-funnel.functions'
import { readOwnerConnectReadinessServer } from '@/modules/money/money.functions'
import type { OwnerProviderEarningsReadback } from '@/modules/capability-supply/supply-funnel.functions'
import type { OwnerConnectReadinessReadback } from '@/modules/money/server'

type WorkspaceProps = Readonly<{
  inventory: OwnerOperationsInventoryResult
  lifecycle?: Promise<OwnerOperationsLifecycleResult>
  connections?: Promise<OwnerOperationsConnectionsResult>
  payouts?: Promise<OwnerOperationsPayoutResult>
  publicStatus?: Promise<OwnerOperationsPublicStatusResult>
  offboarding?: Promise<OwnerProviderOffboardingResult>
}>

export function AeOwnerOperationsWorkspace(props: WorkspaceProps) {
  const router = useRouter()
  const [refreshPending, setRefreshPending] = useState(false)
  const refresh = useCallback(() => {
    if (refreshPending) return
    setRefreshPending(true)
    void router.invalidate()
      .catch((cause) => captureClientExceptionOnClient(cause))
      .finally(() => setRefreshPending(false))
  }, [refreshPending, router])

  const actions = props.inventory.kind === 'available' ? <AddOperationAction /> : undefined
  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Operations"
      description="Publish the exact tools agents can inspect and call."
      currentPath="/owner/offerings"
      {...(actions === undefined ? {} : { actions })}
    >
      {props.inventory.kind === 'not_found' ? (
        <SupplierIdentityForm />
      ) : props.inventory.kind === 'conflict' ? (
        <Alert variant="destructive">
          <AlertTitle>Supplier identity needs attention</AlertTitle>
          <AlertDescription>AE found conflicting supplier ownership and will not select one automatically.</AlertDescription>
        </Alert>
      ) : props.inventory.kind === 'unavailable' ? (
        <AeEmptyState
          title="Operations did not load"
          description="The Operation inventory is temporarily unavailable."
          role="alert"
          action={<Button type="button" variant="secondary" disabled={refreshPending} onClick={refresh}>{refreshPending ? 'Trying again…' : 'Try again'}</Button>}
        />
      ) : (
        <AvailableWorkspace {...props} inventory={props.inventory} refresh={refresh} />
      )}
    </AeOperatorShell>
  )
}

function AvailableWorkspace({
  inventory,
  lifecycle,
  connections,
  payouts,
  publicStatus,
  offboarding,
  refresh,
}: WorkspaceProps & Readonly<{
  inventory: Extract<OwnerOperationsInventoryResult, { kind: 'available' }>
  refresh: () => void
}>) {
  const [inventoryFilter, setInventoryFilter] = useState('')
  const [inventorySorting, setInventorySorting] = useState<SortingState>([])
  const [activeRowActionId, setActiveRowActionId] = useState<string>()
  const location = useLocation()
  const router = useRouter()
  const readConnectionsDetail = useServerFn(readOwnerOperationsConnectionsDetailServer)
  const readIdentityDetail = useServerFn(readOwnerOperationsIdentityDetailServer)
  const readEarnings = useServerFn(readOwnerProviderEarningsServer)
  const readConnect = useServerFn(readOwnerConnectReadinessServer)
  const renameSupplier = useServerFn(renameSupplierDisplayNameServer)
  const [connectionsOpen, setConnectionsOpen] = useState(false)
  const [connectionsPending, setConnectionsPending] = useState(false)
  const [connectionsDetail, setConnectionsDetail] = useState<OwnerOperationsConnectionsDetailResult>()
  const [connectionTargetMissing, setConnectionTargetMissing] = useState(false)
  const [identityOpen, setIdentityOpen] = useState(false)
  const [identityPending, setIdentityPending] = useState(false)
  const [identityDetail, setIdentityDetail] = useState<OwnerOperationsIdentityDetailResult>()
  const [earningsOpen, setEarningsOpen] = useState(false)
  const [earningsPending, setEarningsPending] = useState(false)
  const [earningsUnavailable, setEarningsUnavailable] = useState(false)
  const [earningsDetail, setEarningsDetail] = useState<Readonly<{ earnings: OwnerProviderEarningsReadback; connect: OwnerConnectReadinessReadback }>>()
  const compatibilitySearch = location.search as Record<string, unknown>
  const pendingRows = inventory.operations.map((row): OwnerOperationsProjectionRow => ({
    ...row,
    lifecycleLabel: 'Loading',
    availability: 'unknown',
    continuation: { kind: 'navigate', label: 'Edit Operation', href: `/owner/offerings/${encodeURIComponent(row.offeringRef)}` },
    lifecyclePending: true,
  }))

  const renderList = (rows: readonly OwnerOperationsProjectionRow[]) => (
    <AeOwnerOfferingsList
      offerings={rows.map(toOfferingSummary)}
      projectionState={inventory.projection === 'current' ? 'current' : 'projection_pending'}
      onRetryProjection={refresh}
      filterValue={inventoryFilter}
      onFilterChange={(value) => {
        setInventoryFilter(value)
        setActiveRowActionId(undefined)
      }}
      sorting={inventorySorting}
      onSortingChange={setInventorySorting}
      {...(activeRowActionId === undefined ? {} : { activeRowActionId })}
      onActiveRowActionIdChange={setActiveRowActionId}
      restoreRowActionFocus={activeRowActionId !== undefined}
    />
  )

  const loadConnections = useCallback(() => {
    if (connectionsPending) return
    setConnectionsPending(true)
    void readConnectionsDetail()
      .then(setConnectionsDetail)
      .catch((cause) => {
        captureClientExceptionOnClient(cause)
        setConnectionsDetail({ kind: 'unavailable' })
      })
      .finally(() => setConnectionsPending(false))
  }, [connectionsPending, readConnectionsDetail])

  const openConnections = useCallback(() => {
    setConnectionsOpen(true)
    if (connectionsDetail === undefined) loadConnections()
  }, [connectionsDetail, loadConnections])

  const loadEarnings = useCallback(() => {
    if (earningsPending) return
    setEarningsPending(true)
    setEarningsUnavailable(false)
    void Promise.all([readEarnings(), readConnect()])
      .then(([earnings, connect]) => setEarningsDetail({ earnings, connect }))
      .catch((cause) => {
        captureClientExceptionOnClient(cause)
        setEarningsUnavailable(true)
      })
      .finally(() => setEarningsPending(false))
  }, [earningsPending, readConnect, readEarnings])

  const openEarnings = useCallback(() => {
    setEarningsOpen(true)
    if (earningsDetail === undefined && !earningsUnavailable) loadEarnings()
  }, [earningsDetail, earningsUnavailable, loadEarnings])

  const loadIdentity = useCallback(() => {
    if (identityPending) return
    setIdentityPending(true)
    void readIdentityDetail()
      .then(setIdentityDetail)
      .catch((cause) => {
        captureClientExceptionOnClient(cause)
        setIdentityDetail({ kind: 'unavailable' })
      })
      .finally(() => setIdentityPending(false))
  }, [identityPending, readIdentityDetail])

  const openIdentity = useCallback(() => {
    setIdentityOpen(true)
    if (identityDetail === undefined) loadIdentity()
  }, [identityDetail, loadIdentity])

  useEffect(() => {
    if (location.hash.startsWith('provider-connection-')) openConnections()
    if (location.hash === 'earnings' || compatibilitySearch.connect === 'return' || compatibilitySearch.connect === 'refresh') openEarnings()
    if (location.hash === 'supplier-identity') openIdentity()
  }, [compatibilitySearch.connect, location.hash, openConnections, openEarnings, openIdentity])

  useEffect(() => {
    if (!connectionsOpen || connectionsDetail?.kind !== 'available' || !location.hash.startsWith('provider-connection-')) return
    const target = document.getElementById(location.hash)
    if (target !== null) {
      target.setAttribute('tabindex', '-1')
      target.focus()
      setConnectionTargetMissing(false)
      return
    }
    setConnectionTargetMissing(true)
    focusSection('supplier-connections')
  }, [connectionsDetail, connectionsOpen, location.hash])

  useEffect(() => {
    if (location.hash === 'earnings' && earningsOpen) focusSection('earnings')
  }, [earningsOpen, location.hash])

  return (
    <div className="grid gap-section">
      <AeSection title="Operations" description={`Operations supplied by ${inventory.supplier.name}.`}>
        {lifecycle === undefined ? renderList(pendingRows) : (
          <Suspense fallback={renderList(pendingRows)}>
            <Await promise={lifecycle}>{(result) => {
              const projection = projectOwnerOperations(inventory, result)
              if (projection.kind === 'conflict') {
                const isOwnershipConflict =
                  projection.reason === 'business_mismatch' ||
                  projection.reason === 'multiple_suppliers'

                return (
                  <Alert variant="destructive">
                    <AlertTitle>
                      {isOwnershipConflict
                        ? 'Supplier ownership conflict'
                        : 'Operations need repair'}
                    </AlertTitle>
                    <AlertDescription>
                      {isOwnershipConflict
                        ? 'Lifecycle records do not belong to the current supplier. No Operation action is available.'
                        : 'Duplicate lifecycle records were found. No publication action is available.'}
                    </AlertDescription>
                  </Alert>
                )
              }
              return (
                <div className="grid gap-related">
                  {projection.attentionCount === 0 ? null : (
                    <Alert>
                      <AlertTitle>{projection.attentionCount === 1 ? '1 Operation needs attention' : `${projection.attentionCount} Operations need attention`}</AlertTitle>
                      <AlertDescription>{projection.firstBlocker}</AlertDescription>
                    </Alert>
                  )}
                  {projection.inconsistencyCount === 0 ? null : (
                    <Alert><AlertTitle>Lifecycle update in progress</AlertTitle><AlertDescription>Some lifecycle facts do not yet match the current inventory.</AlertDescription></Alert>
                  )}
                  {renderList(projection.rows)}
                </div>
              )
            }}</Await>
          </Suspense>
        )}
      </AeSection>
      <AeSection id="supplier-connections" title="Supplier readiness" description="Provider connections and current public availability.">
        <div className="grid gap-related md:grid-cols-2">
          <DeferredSection promise={connections} loadingLabel="Loading connections" unavailableTitle="Connections unavailable">
            {(result) => result.kind === 'available' ? (
              <SummaryCard title="Connections" detail={`${result.value.available} of ${result.value.total} available`} action="Manage connections" onAction={openConnections} />
            ) : <SecondarySummary result={result} subject="Connections" notApplicableTitle="No connections configured" unavailableTitle="Connections unavailable" />}
          </DeferredSection>
          <DeferredSection promise={publicStatus} loadingLabel="Loading public status" unavailableTitle="Public status unavailable">
            {(result) => result.kind === 'available' ? (
              <SummaryCard title="Public status" detail={`${result.value.catalog.offerings.length} public Operations`} action="Review public status" onAction={() => focusSection('supplier-status')} />
            ) : <SecondarySummary result={result} subject="Public status" notApplicableTitle="Public status not published" unavailableTitle="Public status unavailable" />}
          </DeferredSection>
        </div>
        {connectionsOpen ? (
          <div className="grid gap-related">
            {connectionTargetMissing ? <Alert variant="destructive"><AlertTitle>Connection target unavailable</AlertTitle><AlertDescription>The requested connection is not in the current supplier readback. No connection was changed.</AlertDescription></Alert> : null}
            {connectionsPending ? <div aria-busy="true"><Skeleton className="h-24 w-full" /></div> : connectionsDetail?.kind === 'available' ? (
              <AeOwnerProviderConnections businessId={connectionsDetail.businessId} connections={connectionsDetail.connections} />
            ) : connectionsDetail?.kind === 'conflict' ? (
              <OwnershipConflict title="Connection ownership conflict" />
            ) : connectionsDetail?.kind === 'not_applicable' ? (
              <AeEmptyState title="No connection controls configured" description="Connect a provider from Operation preparation when one is required." />
            ) : <UnavailableSummary title="Connection controls unavailable" retryLabel="Try connections again" onRetry={loadConnections} />}
          </div>
        ) : null}
        <div id="supplier-status" className="scroll-mt-anchor">
          <DeferredSection promise={publicStatus} loadingLabel="Loading public supplier status" unavailableTitle="Public status unavailable">
            {(result) => result.kind === 'available' ? (
              <div className="grid gap-section">
                <AeStatusCard readback={result.value} />
                <AeCapabilityList catalog={result.value.catalog} />
              </div>
            ) : <SecondarySummary result={result} subject="Public status" notApplicableTitle="Public status not published" unavailableTitle="Public status unavailable" />}
          </DeferredSection>
        </div>
      </AeSection>
      <AeSection id="supplier-identity" title="Supplier identity" description="The public supplier identity that owns these Operations.">
        <SummaryCard title="Supplier details" detail={inventory.supplier.name} action="Manage supplier identity" onAction={openIdentity} />
        {identityOpen ? identityPending ? <div aria-busy="true"><Skeleton className="h-24 w-full" /></div> : identityDetail?.kind === 'available' ? (
          <IdentityManagement
            identity={identityDetail}
            publicStatus={publicStatus}
            onRename={async (input) => {
              const renamed = await renameSupplier({ data: input })
              if (renamed.kind === 'updated' || renamed.kind === 'unchanged') await router.invalidate()
              return renamed
            }}
          />
        ) : identityDetail?.kind === 'conflict' ? (
          <OwnershipConflict title="Supplier identity ownership conflict" />
        ) : identityDetail?.kind === 'not_applicable' ? (
          <AeEmptyState title="Supplier identity not configured" description="Reload Operations to create the current account’s supplier identity." />
        ) : <UnavailableSummary title="Supplier identity controls unavailable" retryLabel="Try supplier identity again" onRetry={loadIdentity} /> : null}
      </AeSection>
      <AeSection id="earnings" title="Earnings and operational evidence" description="Source-recorded supplier earnings and payout readiness.">
        <DeferredSection promise={payouts} loadingLabel="Loading earnings" unavailableTitle="Earnings unavailable">
          {(result) => result.kind === 'available' ? (
            <SummaryCard title="Payout readiness" detail={`${result.value.readyAccounts} ready · ${result.value.needsAttention} need attention`} action="Manage earnings" onAction={openEarnings} />
          ) : <SecondarySummary result={result} subject="Payout readiness" notApplicableTitle="Payout readiness not configured" unavailableTitle="Earnings unavailable" />}
        </DeferredSection>
        {earningsOpen ? earningsPending ? <div aria-busy="true"><Skeleton className="h-24 w-full" /></div> : earningsDetail === undefined ? <UnavailableSummary title="Earnings controls unavailable" retryLabel="Try earnings again" onRetry={loadEarnings} /> : (
          <AeSupplyEarningsCard readback={earningsDetail.earnings} connect={earningsDetail.connect} onStatusRefreshed={() => router.invalidate()} />
        ) : null}
      </AeSection>
      <AeSection id="offboarding" title="Provider offboarding" description="Stop new work, settle outstanding obligations, and retire this Provider safely.">
        <DeferredSection promise={offboarding} loadingLabel="Loading Provider offboarding" unavailableTitle="Provider offboarding unavailable">
          {(result) => <ProviderOffboardingCard initial={result} refreshWorkspace={refresh} />}
        </DeferredSection>
      </AeSection>
    </div>
  )
}

function ProviderOffboardingCard({ initial, refreshWorkspace }: Readonly<{
  initial: OwnerProviderOffboardingResult
  refreshWorkspace: () => void
}>) {
  const startOffboardingRequest = useServerFn(startOwnerProviderOffboardingServer)
  const startOffboarding = useReverification(startOffboardingRequest)
  const resumeOffboardingRequest = useServerFn(resumeOwnerProviderOffboardingServer)
  const resumeOffboarding = useReverification(resumeOffboardingRequest)
  const cancelOffboardingRequest = useServerFn(cancelOwnerProviderOffboardingServer)
  const cancelOffboarding = useReverification(cancelOffboardingRequest)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [result, setResult] = useState(initial)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const startKey = useRef(`provider-offboarding:${globalThis.crypto.randomUUID()}`)

  useEffect(() => setResult(initial), [initial])

  const start = async () => {
    setPending(true)
    setError(undefined)
    try {
      const next = await startOffboarding({ data: { idempotencyKey: startKey.current } })
      setResult(next)
      if (next.kind === 'available') {
        setConfirmOpen(false)
        refreshWorkspace()
      } else if (next.kind === 'refused') {
        setError(offboardingError(next.reason))
      } else {
        setError('Provider offboarding could not be confirmed. Reload status before trying again.')
      }
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('Provider offboarding could not be confirmed. Reload status before trying again.')
    } finally {
      setPending(false)
    }
  }

  const resume = async () => {
    if (result.kind !== 'available') return
    setPending(true)
    setError(undefined)
    try {
      const next = await resumeOffboarding({ data: {
        caseRef: result.status.caseRef,
        expectedRevision: result.status.revision,
        idempotencyKey: `provider-offboarding-resume:${globalThis.crypto.randomUUID()}`,
      } })
      setResult(next)
      if (next.kind === 'available') refreshWorkspace()
      else setError(next.kind === 'refused' ? offboardingError(next.reason) : 'Provider offboarding status is unavailable. Reload before trying again.')
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('Provider offboarding status is unavailable. Reload before trying again.')
    } finally {
      setPending(false)
    }
  }

  const cancel = async () => {
    if (result.kind !== 'available') return
    setPending(true)
    setError(undefined)
    try {
      const next = await cancelOffboarding({ data: {
        caseRef: result.status.caseRef,
        expectedRevision: result.status.revision,
        idempotencyKey: `provider-offboarding-cancel:${globalThis.crypto.randomUUID()}`,
      } })
      setResult(next)
      if (next.kind === 'available') refreshWorkspace()
      else setError(next.kind === 'refused' ? offboardingError(next.reason) : 'Provider offboarding status is unavailable. Reload before trying again.')
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('Provider offboarding status is unavailable. Reload before trying again.')
    } finally {
      setPending(false)
    }
  }

  if (result.kind === 'unavailable') return <UnavailableSummary title="Provider offboarding unavailable" />
  if (result.kind === 'refused') {
    return <Alert variant="destructive"><AlertTitle>Provider cannot be retired</AlertTitle><AlertDescription>{offboardingError(result.reason)}</AlertDescription></Alert>
  }
  if (result.kind === 'not_found') {
    return (
      <div className="grid gap-related rounded-lg border border-border p-related">
        <div><h3 className="font-semibold">Retire this Provider</h3><p className="text-sm text-muted-foreground">AE freezes new work first, then waits for Calls, obligations and payouts before revoking connections.</p></div>
        {error === undefined ? null : <Alert variant="destructive" role="alert"><AlertTitle>Provider was not retired</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <Button ref={triggerRef} type="button" variant="destructive" className="justify-self-start min-h-touch" onClick={() => setConfirmOpen(true)}>Start Provider offboarding</Button>
        <AeConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Start Provider offboarding?"
          description="New work will stop first. Outstanding Calls, obligations and payouts must resolve before AE revokes Provider connections and marks the Provider retired. After the freeze, this process can be resumed but not rolled back."
          confirmLabel="Freeze new work and continue"
          confirmVariant="destructive"
          pending={pending}
          onConfirm={start}
          returnFocusRef={triggerRef}
        />
      </div>
    )
  }

  const { status } = result
  const canResume = status.state === 'Action required'
  const canCancel = status.state === 'Freezing' && !status.routeabilityFrozen
  const isTerminal = status.state === 'Retired' || status.state === 'Cancelled'
  return (
    <div className="grid gap-related rounded-lg border border-border p-related" aria-live="polite">
      <div><h3 className="font-semibold">{status.state}</h3><p className="text-sm text-muted-foreground">{status.routeabilityFrozen ? 'New work is frozen.' : 'AE is preparing to freeze new work.'} Case {status.caseRef}</p></div>
      {status.blockerCodes.length === 0 ? null : (
        <Alert><AlertTitle>Action required</AlertTitle><AlertDescription>{status.blockerCodes.map(offboardingBlocker).join(' ')}</AlertDescription></Alert>
      )}
      {status.state === 'Retired' ? <p className="text-sm text-muted-foreground">Operations are retired, Calls and obligations are clear, and Provider connections are revoked.</p> : null}
      {status.state === 'Cancelled' ? <p className="text-sm text-muted-foreground">Offboarding was cancelled before new work was frozen. The Provider remains active.</p> : null}
      {isTerminal ? null : (
        <div className="flex flex-wrap gap-intra">
          <Button type="button" variant="secondary" className="min-h-touch" disabled={pending} onClick={canResume ? () => void resume() : refreshWorkspace}>{pending ? 'Checking…' : canResume ? 'Resume offboarding' : 'Refresh status'}</Button>
          {canCancel ? <Button type="button" variant="outline" className="min-h-touch" disabled={pending} onClick={() => void cancel()}>Cancel offboarding</Button> : null}
        </div>
      )}
      {error === undefined ? null : <Alert variant="destructive" role="alert"><AlertTitle>Status was not updated</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    </div>
  )
}

function offboardingBlocker(code: string): string {
  if (code === 'calls_remain') return 'Outstanding Calls must finish or be reconciled.'
  if (code === 'obligations_remain') return 'Provider obligations must be resolved.'
  if (code === 'payout_resolution_required') return 'A payout requires attention before retirement can finish.'
  if (code === 'connections_remain' || code === 'provider_cleanup_pending') return 'Provider connection cleanup must be confirmed.'
  if (code === 'routeable_operations_remain') return 'One or more Operations are still accepting new work.'
  if (code === 'retention_policy_unbound') return 'The retained-record policy must be confirmed.'
  return 'AE could not prove the next retirement gate. Review current Operations and try again.'
}

function offboardingError(reason: string): string {
  if (reason === 'retention_policy_unavailable') return 'The retained-record policy is not configured. No Provider state changed.'
  if (reason === 'offboarding_already_active') return 'Provider offboarding is already active. Reload its current status.'
  if (reason === 'revision_conflict') return 'The offboarding case changed. Reload its current status before resuming.'
  if (reason === 'routeability_freeze_accepted') return 'New work is already frozen. Offboarding can now be resumed or corrected, but not cancelled.'
  if (reason === 'authorization_denied') return 'Sign in again and complete the required verification. No Provider state changed.'
  return 'AE could not confirm Provider offboarding. Reload status before trying again.'
}

function DeferredSection<T>({ promise, loadingLabel, unavailableTitle, children }: Readonly<{
  promise: Promise<T> | undefined
  loadingLabel: string
  unavailableTitle: string
  children: (value: T) => ReactNode
}>) {
  if (promise === undefined) return <UnavailableSummary title={unavailableTitle} />
  return (
    <Suspense fallback={<div aria-busy="true" aria-label={loadingLabel} className="grid gap-intra"><Skeleton className="h-5 w-40" /><Skeleton className="h-10 w-full" /></div>}>
      <Await promise={promise}>{children}</Await>
    </Suspense>
  )
}

function SummaryCard({ title, detail, action, onAction }: Readonly<{ title: string; detail: string; action: string; onAction: () => void }>) {
  return <div className="grid gap-related rounded-lg border border-border p-related"><div><h3 className="font-semibold">{title}</h3><p className="text-sm text-muted-foreground">{detail}</p></div><Button type="button" variant="secondary" className="justify-self-start min-h-touch" onClick={onAction}>{action}</Button></div>
}

function UnavailableSummary({ title, retryLabel, onRetry }: Readonly<{
  title: string
  retryLabel?: string
  onRetry?: () => void
}>) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>This section could not be confirmed. The rest of Operations remains available.</p>
        {retryLabel === undefined || onRetry === undefined ? null : (
          <Button type="button" variant="secondary" className="mt-intra min-h-touch" onClick={onRetry}>{retryLabel}</Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

function SecondarySummary({ result, subject, notApplicableTitle, unavailableTitle }: Readonly<{
  result: Readonly<{ kind: 'unavailable' | 'not_applicable' }> | Readonly<{ kind: 'conflict'; reason: string }>
  subject: string
  notApplicableTitle: string
  unavailableTitle: string
}>) {
  if (result.kind === 'conflict') return <OwnershipConflict title={`${subject} ownership conflict`} />
  if (result.kind === 'not_applicable') {
    return <AeEmptyState title={notApplicableTitle} description="Nothing is required here until this supplier uses this part of Operations." />
  }
  return <UnavailableSummary title={unavailableTitle} />
}

function OwnershipConflict({ title }: Readonly<{ title: string }>) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>Records do not belong to the current supplier. Controls remain read-only.</AlertDescription>
    </Alert>
  )
}

function IdentityManagement({ identity, publicStatus, onRename }: Readonly<{
  identity: Extract<OwnerOperationsIdentityDetailResult, { kind: 'available' }>
  publicStatus: Promise<OwnerOperationsPublicStatusResult> | undefined
  onRename: NonNullable<ComponentProps<typeof AeWorkspaceGeneral>['onRename']>
}>) {
  if (publicStatus === undefined) {
    return <AeWorkspaceGeneral result={{ kind: 'unavailable', reason: 'source_unavailable', retryable: true }} identity={identity} onRename={onRename} />
  }
  return (
    <Suspense fallback={<div aria-busy="true"><Skeleton className="h-24 w-full" /></div>}>
      <Await promise={publicStatus}>{(result) => (
        result.kind === 'conflict'
          ? <OwnershipConflict title="Supplier identity ownership conflict" />
          : <AeWorkspaceGeneral
              result={result.kind === 'available'
                ? { kind: 'available', readback: result.value }
                : { kind: 'unavailable', reason: 'source_unavailable', retryable: true }}
              identity={identity}
              onRename={onRename}
            />
      )}</Await>
    </Suspense>
  )
}

function toOfferingSummary(row: OwnerOperationsProjectionRow): OwnerOfferingSummary {
  return {
    offering: {
      offeringRef: row.offeringRef as OfferingRef,
      revision: row.currentRevision,
      name: row.name,
      category: row.category,
      summary: row.summary,
    },
    status: row.status,
    accessPathCount: row.accessPathCount,
    lifecycleLabel: row.lifecycleLabel,
    availability: row.availability,
    ...(row.blocker === undefined ? {} : { blocker: row.blocker }),
    continuation: row.continuation,
    ...(row.lifecyclePending === undefined ? {} : { lifecyclePending: row.lifecyclePending }),
  }
}

export function SupplierIdentityForm() {
  const router = useRouter()
  const ensureSupplierBusiness = useServerFn(ensureSupplierBusinessServer)
  const [supplierName, setSupplierName] = useState('')
  const [supplierWebsite, setSupplierWebsite] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [outcomeUnknown, setOutcomeUnknown] = useState(false)

  const submit = async () => {
    const name = supplierName.trim()
    let website: URL
    try {
      website = new URL(supplierWebsite)
      if (website.protocol !== 'https:') throw new Error('not_https')
    } catch {
      setError('Enter a valid HTTPS supplier website.')
      return
    }
    if (name.length === 0) {
      setError('Enter the supplier name.')
      return
    }
    setPending(true)
    setError(undefined)
    try {
      const created = await ensureSupplierBusiness({ data: { name, slug: name, website: website.origin, providerIdentifier: website.hostname } })
      if (created.kind === 'refused') {
        if (created.code === 'source_unavailable') {
          setOutcomeUnknown(true)
          setError('The supplier outcome could not be confirmed. Reload status before submitting again; your details remain here.')
        } else {
          setError(supplierIdentityError(created.code))
        }
        return
      }
      await router.invalidate()
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setOutcomeUnknown(true)
      setError('The supplier outcome could not be confirmed. Reload status before submitting again; your details remain here.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid max-w-xl gap-related">
      <Alert><AlertTitle>Create your supplier identity</AlertTitle><AlertDescription>This starts an unpublished supplier workspace. Nothing appears in the market until an exact Operation passes verification.</AlertDescription></Alert>
      <FieldGroup>
        <Field data-invalid={error !== undefined || undefined}>
          <FieldLabel htmlFor="supplier-name">Supplier name</FieldLabel>
          <Input id="supplier-name" value={supplierName} disabled={pending} onChange={(event) => { setSupplierName(event.currentTarget.value); setError(undefined) }} />
          <FieldDescription>The name agents will see after an Operation is verified and published.</FieldDescription>
        </Field>
        <Field data-invalid={error !== undefined || undefined}>
          <FieldLabel htmlFor="supplier-website">Supplier website</FieldLabel>
          <Input id="supplier-website" type="url" placeholder="https://api.example.com" value={supplierWebsite} disabled={pending} onChange={(event) => { setSupplierWebsite(event.currentTarget.value); setError(undefined) }} />
          <FieldDescription>Use the HTTPS origin that controls the supplier endpoint.</FieldDescription>
          {error === undefined ? null : <FieldError>{error}</FieldError>}
        </Field>
      </FieldGroup>
      <Button type="button" className="justify-self-start min-h-touch" disabled={pending || outcomeUnknown} aria-busy={pending || undefined} onClick={() => void submit()}>{pending ? 'Creating supplier…' : outcomeUnknown ? 'Outcome not confirmed' : 'Create supplier workspace'}</Button>
      {outcomeUnknown ? <Button type="button" variant="secondary" className="justify-self-start min-h-touch" disabled={pending} onClick={() => { setPending(true); void router.invalidate().then(() => setOutcomeUnknown(false)).catch((cause) => { captureClientExceptionOnClient(cause); setError('Supplier status is still unavailable. No new workspace state is claimed.') }).finally(() => setPending(false)) }}>Reload supplier status</Button> : null}
    </div>
  )
}

function AddOperationAction() {
  return <Button asChild><Link to="/owner/offerings/new">Add Operation</Link></Button>
}

function supplierIdentityError(code: string): string {
  if (code === 'slug_taken') return 'That supplier name is already in use. Choose a more specific name.'
  if (code === 'multiple_businesses') return 'This account has more than one supplier identity. Resolve that conflict before continuing.'
  if (code === 'unauthenticated') return 'Sign in again before creating a supplier workspace.'
  if (code === 'invalid_business') return 'Check the supplier name and HTTPS website.'
  return 'The supplier workspace could not be created. Try again.'
}

function focusSection(id: string): void {
  const section = document.getElementById(id)
  const target = section?.querySelector<HTMLElement>('h2') ?? section
  if (target === null || target === undefined) return
  target.setAttribute('tabindex', '-1')
  target.scrollIntoView({ block: 'start' })
  target.focus()
}
