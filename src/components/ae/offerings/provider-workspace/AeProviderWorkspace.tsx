import { useLocation } from '@tanstack/react-router'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeOwnerOfferingsList } from '@/components/ae/offerings/AeOwnerOfferings'
import { toOfferingSummary, type ProviderWorkspaceProjectionRow } from '@/components/ae/offerings/provider-workspace-projection'
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
  const inventory = useProviderWorkspaceInventory()
  const sheets = useProviderWorkspaceSheets({ enabled: inventoryAvailable })

  const toolCount =
    props.inventory.kind === 'available' ? props.inventory.tools.length : 0
  const actions = inventoryAvailable
    ? <AddToolAction variant={toolCount === 0 ? 'outline' : 'default'} />
    : undefined
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Tools"
      description="Manage the Tools buyers can find and call."
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

  const renderList = (rows: readonly ProviderWorkspaceProjectionRow[]) => (
    <AeOwnerOfferingsList
      offerings={rows.map(toOfferingSummary)}
      projectionState={inventory.projection === 'current' ? 'current' : 'projection_pending'}
      onRetryProjection={inventoryHook.refresh}
      hideEmptyState={inventory.tools.length === 0}
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
      {inventory.tools.length === 0 && (
        <AeSupplierOnboardingWizard currentStep="first_tool" providerName={inventory.provider.name} />
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
        {...(sheets.x402Handoff === undefined ? {} : { x402Handoff: sheets.x402Handoff })}
        {...(sheets.compatibilityRebind === undefined ? {} : { rebindOfferingRef: sheets.compatibilityRebind })}
        {...(location.hash.startsWith('provider-connection-') ? { connectionHash: `#${location.hash}` } : {})}
      />
      <ProviderWorkspaceEarningsSection
        earningsOpen={sheets.earningsOpen}
        earningsPending={sheets.earningsPending}
        earningsUnavailable={sheets.earningsUnavailable}
        {...(sheets.earningsDetail === undefined ? {} : { earningsDetail: sheets.earningsDetail })}
        onOpenEarnings={sheets.openEarnings}
        onCloseEarnings={sheets.closeEarnings}
        onRetryEarnings={sheets.loadEarnings}
      />
      <details className="rounded-card border border-border p-4" open={location.hash === 'provider-identity' || undefined}>
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
