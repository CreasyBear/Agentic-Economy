import { useLocation } from '@tanstack/react-router'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeOwnerOfferingsList } from '@/components/ae/offerings/AeOwnerOfferings'
import { toOfferingSummary, type ProviderWorkspaceProjectionRow } from '@/components/ae/offerings/provider-workspace-projection'
import { AeConnectReturnPoller } from '@/components/ae/supply/AeConnectReturnPoller'
import { AeSupplierOnboardingWizard } from '@/components/ae/supply/supplier-onboarding-wizard/AeSupplierOnboardingWizard'
import { ProviderWorkspaceEarningsSection } from '@/components/ae/offerings/ProviderWorkspaceEarningsSection'
import { ProviderWorkspaceIdentitySection } from '@/components/ae/offerings/ProviderWorkspaceIdentitySection'
import { ProviderWorkspaceOffboardingSection } from '@/components/ae/offerings/ProviderWorkspaceOffboardingSection'
import { ProviderWorkspaceReadinessSection } from '@/components/ae/offerings/ProviderWorkspaceReadinessSection'
import { ProviderWorkspaceToolsSection } from '@/components/ae/offerings/ProviderWorkspaceToolsSection'
import { AddToolAction } from './components/AddToolAction'
import { WorkspaceInventoryGate } from './components/WorkspaceInventoryGate'
import type { AeProviderWorkspaceProps } from './provider-workspace.contracts'
import { useProviderWorkspaceInventory } from './useProviderWorkspaceInventory'
import { useProviderWorkspaceSheets } from './useProviderWorkspaceSheets'

export function AeProviderWorkspace(props: AeProviderWorkspaceProps) {
  const inventoryAvailable = props.inventory.kind === 'available'
  const inventory = useProviderWorkspaceInventory({
    inventory: props.inventory,
    payouts: props.payouts,
  })
  const sheets = useProviderWorkspaceSheets({ enabled: inventoryAvailable })

  const actions = inventoryAvailable ? <AddToolAction /> : undefined
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Tools"
      description="Publish the exact tools agents can inspect and call."
      currentPath="/owner/operations"
      {...(actions === undefined ? {} : { actions })}
    >
      {props.inventory.kind === 'not_found' ? (
        <WorkspaceInventoryGate kind="not_found" onSaveProfile={inventory.onSaveProfile} />
      ) : props.inventory.kind === 'conflict' ? (
        <WorkspaceInventoryGate kind="conflict" />
      ) : props.inventory.kind === 'unavailable' ? (
        <WorkspaceInventoryGate kind="unavailable" refreshPending={inventory.refreshPending} onRefresh={inventory.refresh} />
      ) : (
        <AvailableWorkspaceBody {...props} inventory={props.inventory} inventoryHook={inventory} sheets={sheets} />
      )}
    </AeOperatorPage>
  )
}

function AvailableWorkspaceBody({
  inventory,
  lifecycle,
  connections,
  payouts,
  publicStatus,
  offboarding,
  inventoryHook,
  sheets,
}: AeProviderWorkspaceProps & Readonly<{
  inventory: Extract<AeProviderWorkspaceProps['inventory'], { kind: 'available' }>
  inventoryHook: ReturnType<typeof useProviderWorkspaceInventory>
  sheets: ReturnType<typeof useProviderWorkspaceSheets>
}>) {
  const location = useLocation()
  const payoutsConfiguredForWizard = sheets.connectPayoutsReady || inventoryHook.payoutSummaryReady

  const renderList = (rows: readonly ProviderWorkspaceProjectionRow[]) => (
    <AeOwnerOfferingsList
      offerings={rows.map(toOfferingSummary)}
      projectionState={inventory.projection === 'current' ? 'current' : 'projection_pending'}
      onRetryProjection={inventoryHook.refresh}
      filterValue={inventoryHook.inventoryFilter}
      onFilterChange={(value) => {
        inventoryHook.setInventoryFilter(value)
        inventoryHook.setActiveRowActionId(undefined)
      }}
      sorting={inventoryHook.inventorySorting}
      onSortingChange={inventoryHook.setInventorySorting}
      {...(inventoryHook.activeRowActionId === undefined ? {} : { activeRowActionId: inventoryHook.activeRowActionId })}
      onActiveRowActionIdChange={inventoryHook.setActiveRowActionId}
      restoreRowActionFocus={inventoryHook.activeRowActionId !== undefined}
    />
  )

  return (
    <div className="grid gap-section">
      {(sheets.compatibilityConnect === 'return' || sheets.compatibilityConnect === 'refresh') && (
        <AeConnectReturnPoller
          {...(sheets.earningsDetail?.connect === undefined ? {} : { initialReadiness: sheets.earningsDetail.connect })}
          onPollReadiness={sheets.readConnect}
          onReadinessAchieved={sheets.onReadinessAchieved}
          onResumeVerification={sheets.onResumeVerification}
        />
      )}
      {inventory.tools.length === 0 && (
        <div className="mb-2">
          <AeSupplierOnboardingWizard
            currentStep={payoutsConfiguredForWizard ? 'first_tool' : 'payouts'}
            providerName={inventory.provider.name}
            payoutsConfigured={payoutsConfiguredForWizard}
            onConnectPayouts={() => {
              sheets.openEarnings()
            }}
          />
        </div>
      )}
      <ProviderWorkspaceToolsSection
        inventory={inventory}
        {...(lifecycle === undefined ? {} : { lifecycle })}
        {...(sheets.compatibilityCursor === undefined ? {} : { compatibilityCursor: sheets.compatibilityCursor })}
        renderList={renderList}
      />
      <ProviderWorkspaceReadinessSection
        {...(connections === undefined ? {} : { connections })}
        {...(publicStatus === undefined ? {} : { publicStatus })}
        connectionsOpen={sheets.connectionsOpen}
        connectionsPending={sheets.connectionsPending}
        {...(sheets.connectionsDetail === undefined ? {} : { connectionsDetail: sheets.connectionsDetail })}
        connectionTargetMissing={sheets.connectionTargetMissing}
        {...(sheets.x402Handoff === undefined ? {} : { x402Handoff: sheets.x402Handoff })}
        onOpenConnections={sheets.openConnections}
        onRetryConnections={sheets.loadConnections}
      />
      <ProviderWorkspaceEarningsSection
        {...(payouts === undefined ? {} : { payouts })}
        earningsOpen={sheets.earningsOpen}
        earningsPending={sheets.earningsPending}
        {...(sheets.earningsDetail === undefined ? {} : { earningsDetail: sheets.earningsDetail })}
        onOpenEarnings={sheets.openEarnings}
        onRetryEarnings={sheets.loadEarnings}
        onStatusRefreshed={sheets.onStatusRefreshed}
      />
      <details className="rounded-lg border border-border p-4" open={location.hash === 'provider-identity' || undefined}>
        <summary className="cursor-pointer font-medium">Provider settings and administration</summary>
        <div className="mt-6 grid gap-section">
          <ProviderWorkspaceIdentitySection
            providerName={inventory.provider.name}
            identityOpen={sheets.identityOpen}
            identityPending={sheets.identityPending}
            {...(sheets.identityDetail === undefined ? {} : { identityDetail: sheets.identityDetail })}
            {...(publicStatus === undefined ? {} : { publicStatus })}
            onOpenIdentity={sheets.openIdentity}
            onRetryIdentity={sheets.loadIdentity}
            onRename={sheets.onRename}
          />
          <ProviderWorkspaceOffboardingSection {...(offboarding === undefined ? {} : { offboarding })} refreshWorkspace={inventoryHook.refresh} />
        </div>
      </details>
    </div>
  )
}
