import { Link, useLocation, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import type { SortingState } from '@tanstack/react-table'
import { useCallback, useEffect, useState } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { renameProviderDisplayNameServer } from '@/lib/server/owner-workspace.functions'
import { parseOwnerToolsCompatibilitySearch, parseOwnerToolsX402ConnectionSearch } from '@/lib/operator/supply-compatibility'
import { readOwnerProviderEarningsServer } from '@/modules/capability-supply/supply-funnel.functions'
import type { OwnerProviderEarningsReadback } from '@/modules/capability-supply/supply-funnel.functions'
import { readOwnerConnectReadinessServer } from '@/modules/money/money.functions'
import type { OwnerConnectReadinessReadback } from '@/modules/money/server'
import { AeOwnerOfferingsList } from './AeOwnerOfferings'
import { ProviderIdentityForm } from './ProviderIdentityForm'
import { focusSection, toOfferingSummary, type ProviderWorkspaceProjectionRow } from './provider-workspace-projection'
import { ProviderWorkspaceEarningsSection } from './ProviderWorkspaceEarningsSection'
import { ProviderWorkspaceIdentitySection } from './ProviderWorkspaceIdentitySection'
import { ProviderWorkspaceOffboardingSection } from './ProviderWorkspaceOffboardingSection'
import { ProviderWorkspaceReadinessSection } from './ProviderWorkspaceReadinessSection'
import { ProviderWorkspaceToolsSection } from './ProviderWorkspaceToolsSection'
import type {
  ProviderWorkspaceConnectionsResult,
  ProviderWorkspaceConnectionsDetailResult,
  ProviderWorkspaceInventoryResult,
  ProviderWorkspaceIdentityDetailResult,
  ProviderWorkspaceLifecycleResult,
  ProviderWorkspacePayoutResult,
  ProviderWorkspacePublicStatusResult,
  OwnerProviderOffboardingResult,
} from './provider-workspace.functions'
import {
  readProviderWorkspaceConnectionsDetailServer,
  readProviderWorkspaceIdentityDetailServer,
} from './provider-workspace.functions'

export { ProviderIdentityForm } from './ProviderIdentityForm'

type WorkspaceProps = Readonly<{
  inventory: ProviderWorkspaceInventoryResult
  lifecycle?: Promise<ProviderWorkspaceLifecycleResult>
  connections?: Promise<ProviderWorkspaceConnectionsResult>
  payouts?: Promise<ProviderWorkspacePayoutResult>
  publicStatus?: Promise<ProviderWorkspacePublicStatusResult>
  offboarding?: Promise<OwnerProviderOffboardingResult>
}>

export function AeProviderWorkspace(props: WorkspaceProps) {
  const router = useRouter()
  const [refreshPending, setRefreshPending] = useState(false)
  const refresh = useCallback(() => {
    if (refreshPending) return
    setRefreshPending(true)
    void router.invalidate()
      .catch((cause) => captureClientExceptionOnClient(cause))
      .finally(() => setRefreshPending(false))
  }, [refreshPending, router])

  const actions = props.inventory.kind === 'available' ? <AddToolAction /> : undefined
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Operations"
      description="Publish the exact tools agents can inspect and call."
      currentPath="/owner/offerings"
      {...(actions === undefined ? {} : { actions })}
    >
      {props.inventory.kind === 'not_found' ? (
        <ProviderIdentityForm />
      ) : props.inventory.kind === 'conflict' ? (
        <Alert variant="destructive">
          <AlertTitle>Provider identity needs attention</AlertTitle>
          <AlertDescription>AE found conflicting provider ownership and will not select one automatically.</AlertDescription>
        </Alert>
      ) : props.inventory.kind === 'unavailable' ? (
        <AeEmptyState
          title="Tools did not load"
          description="The Tool inventory is temporarily unavailable."
          role="alert"
          action={<Button type="button" variant="secondary" disabled={refreshPending} onClick={refresh}>{refreshPending ? 'Trying again…' : 'Try again'}</Button>}
        />
      ) : (
        <AvailableWorkspace {...props} inventory={props.inventory} refresh={refresh} />
      )}
    </AeOperatorPage>
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
  inventory: Extract<ProviderWorkspaceInventoryResult, { kind: 'available' }>
  refresh: () => void
}>) {
  const [inventoryFilter, setInventoryFilter] = useState('')
  const [inventorySorting, setInventorySorting] = useState<SortingState>([])
  const [activeRowActionId, setActiveRowActionId] = useState<string>()
  const location = useLocation()
  const router = useRouter()
  const readConnectionsDetail = useServerFn(readProviderWorkspaceConnectionsDetailServer)
  const readIdentityDetail = useServerFn(readProviderWorkspaceIdentityDetailServer)
  const readEarnings = useServerFn(readOwnerProviderEarningsServer)
  const readConnect = useServerFn(readOwnerConnectReadinessServer)
  const renameProvider = useServerFn(renameProviderDisplayNameServer)
  const [connectionsOpen, setConnectionsOpen] = useState(false)
  const [connectionsPending, setConnectionsPending] = useState(false)
  const [connectionsDetail, setConnectionsDetail] = useState<ProviderWorkspaceConnectionsDetailResult>()
  const [connectionTargetMissing, setConnectionTargetMissing] = useState(false)
  const [identityOpen, setIdentityOpen] = useState(false)
  const [identityPending, setIdentityPending] = useState(false)
  const [identityDetail, setIdentityDetail] = useState<ProviderWorkspaceIdentityDetailResult>()
  const [earningsOpen, setEarningsOpen] = useState(false)
  const [earningsPending, setEarningsPending] = useState(false)
  const [earningsUnavailable, setEarningsUnavailable] = useState(false)
  const [earningsDetail, setEarningsDetail] = useState<Readonly<{ earnings: OwnerProviderEarningsReadback; connect: OwnerConnectReadinessReadback }>>()
  const compatibilitySearch = location.search as Record<string, unknown>
  const validatedCompatibilitySearch = parseOwnerToolsCompatibilitySearch(compatibilitySearch)
  const x402Handoff = parseOwnerToolsX402ConnectionSearch(compatibilitySearch)
  const hasX402Handoff = x402Handoff !== undefined
  const compatibilityConnect = validatedCompatibilitySearch.connect
  const compatibilityCursor = validatedCompatibilitySearch.cursor

  const renderList = (rows: readonly ProviderWorkspaceProjectionRow[]) => (
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
    if (hasX402Handoff) openConnections()
    if (location.hash === 'earnings' || compatibilityConnect === 'return' || compatibilityConnect === 'refresh') openEarnings()
    if (location.hash === 'provider-identity') openIdentity()
  }, [compatibilityConnect, hasX402Handoff, location.hash, openConnections, openEarnings, openIdentity])

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
    focusSection('provider-connections')
  }, [connectionsDetail, connectionsOpen, location.hash])

  useEffect(() => {
    if (location.hash === 'earnings' && earningsOpen) focusSection('earnings')
  }, [earningsOpen, location.hash])

  return (
    <div className="grid gap-section">
      <ProviderWorkspaceToolsSection
        inventory={inventory}
        {...(lifecycle === undefined ? {} : { lifecycle })}
        {...(compatibilityCursor === undefined ? {} : { compatibilityCursor })}
        renderList={renderList}
      />
      <ProviderWorkspaceReadinessSection
        {...(connections === undefined ? {} : { connections })}
        {...(publicStatus === undefined ? {} : { publicStatus })}
        connectionsOpen={connectionsOpen}
        connectionsPending={connectionsPending}
        {...(connectionsDetail === undefined ? {} : { connectionsDetail })}
        connectionTargetMissing={connectionTargetMissing}
        {...(x402Handoff === undefined ? {} : { x402Handoff })}
        onOpenConnections={openConnections}
        onRetryConnections={loadConnections}
      />
      <ProviderWorkspaceIdentitySection
        providerName={inventory.provider.name}
        identityOpen={identityOpen}
        identityPending={identityPending}
        {...(identityDetail === undefined ? {} : { identityDetail })}
        {...(publicStatus === undefined ? {} : { publicStatus })}
        onOpenIdentity={openIdentity}
        onRetryIdentity={loadIdentity}
        onRename={async (input) => {
          const renamed = await renameProvider({ data: input })
          if (renamed.kind === 'updated' || renamed.kind === 'unchanged') await router.invalidate()
          return renamed
        }}
      />
      <ProviderWorkspaceEarningsSection
        {...(payouts === undefined ? {} : { payouts })}
        earningsOpen={earningsOpen}
        earningsPending={earningsPending}
        {...(earningsDetail === undefined ? {} : { earningsDetail })}
        onOpenEarnings={openEarnings}
        onRetryEarnings={loadEarnings}
        onStatusRefreshed={() => void router.invalidate()}
      />
      <ProviderWorkspaceOffboardingSection {...(offboarding === undefined ? {} : { offboarding })} refreshWorkspace={refresh} />
    </div>
  )
}

function AddToolAction() {
  return <Button asChild><Link to="/owner/offerings/new">Add Tool</Link></Button>
}
