import { SettingsGroup, SettingsPage } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import type { OwnerProviderConnection } from '@/modules/capability-supply/supply-funnel.functions'
import type { OwnerToolsX402ConnectionIntent } from '@/lib/operator/supply-compatibility'
import { AeProviderConnectionList } from './AeProviderConnectionList'
import { AeProviderConnectionForm } from './AeProviderConnectionForm'
import { useOwnerProviderConnectionsState } from './useOwnerProviderConnectionsState'

export function AeOwnerProviderConnections({
  businessId,
  connections,
  readOnly = false,
  x402Handoff,
}: Readonly<{
  businessId?: string
  connections: readonly OwnerProviderConnection[]
  readOnly?: boolean
  x402Handoff?: OwnerToolsX402ConnectionIntent
}>) {
  const vm = useOwnerProviderConnectionsState({
    connections,
    readOnly,
    ...(businessId === undefined ? {} : { businessId }),
    ...(x402Handoff === undefined ? {} : { x402Handoff }),
  })

  return (
    <div
      id="provider-connections"
      tabIndex={-1}
      data-programmatic-focus={vm.programmaticFocusId === 'provider-connections' ? '' : undefined}
      onPointerDown={vm.clearProgrammaticFocus}
      className="min-w-0 scroll-mt-6 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[programmatic-focus]:focus:outline-2 data-[programmatic-focus]:focus:outline-offset-2 data-[programmatic-focus]:focus:outline-ring"
    >
      <SettingsPage
        title="Provider connections"
        description="Connect a hosted x402 endpoint so Agentic Economy can route paid calls without collecting an API key or wallet secret. Select the connection as a Tool's access authority."
      >
        <SettingsGroup title="Connections" description="Inspect authority and health for each endpoint. Tool readiness is checked separately.">
        <AeProviderConnectionList
          connections={connections}
          {...(vm.programmaticFocusId === undefined ? {} : { programmaticFocusId: vm.programmaticFocusId })}
          onClearProgrammaticFocus={vm.clearProgrammaticFocus}
          readOnly={readOnly}
          {...(vm.busy === undefined ? {} : { busy: vm.busy })}
          refreshRequired={vm.refreshRequired}
          {...(vm.rebindOfferingRef === undefined ? {} : { rebindOfferingRef: vm.rebindOfferingRef })}
          {...(vm.rebindConnectionRef === undefined ? {} : { rebindConnectionRef: vm.rebindConnectionRef })}
          {...(vm.refreshedForRebind === undefined ? {} : { refreshedForRebind: vm.refreshedForRebind })}
          rebindLinkRef={vm.rebindLinkRef}
          missingConnectionActionLabel={vm.missingConnectionActionLabel}
          onBeginConnection={vm.beginConnection}
          onCheckConnection={(connection) => void vm.checkConnection(connection)}
          onBeginReauthorization={vm.beginReauthorization}
          onRequestRevoke={vm.requestRevoke}
          {...(vm.revokeTarget === undefined ? {} : { revokeTarget: vm.revokeTarget })}
          revokePending={vm.revokePending}
          revokeTriggerRef={vm.revokeTriggerRef}
          onRevokeOpenChange={vm.closeRevokeDialog}
          onConfirmRevoke={() => void vm.confirmRevoke()}
        />
        </SettingsGroup>
        <SettingsGroup title="Connect an endpoint" description="Inspect the live payment lane and prove control of its payee before connecting.">
        <AeProviderConnectionForm
          canConnect={vm.canConnect}
          readOnly={readOnly}
          resourceUrl={vm.resourceUrl}
          method={vm.method}
          environment={vm.environment}
          {...(vm.inspection === undefined ? {} : { inspection: vm.inspection })}
          {...(vm.claimSignature === undefined ? {} : { claimSignature: vm.claimSignature })}
          {...(vm.busy === undefined ? {} : { busy: vm.busy })}
          refreshRequired={vm.refreshRequired}
          reauthorizing={vm.reauthorizing}
          fieldsLocked={vm.fieldsLocked}
          resourceUrlInputRef={vm.resourceUrlInputRef}
          onResourceUrlChange={vm.changeResourceUrl}
          onMethodChange={vm.changeMethod}
          onSubmit={vm.submitConnection}
          onInspect={() => void vm.inspectConnection()}
          onProvePayeeControl={() => void vm.provePayeeControl()}
          onCancelReauthorization={vm.cancelReauthorization}
          {...(vm.notice === undefined ? {} : { notice: vm.notice })}
          onRefresh={() => void vm.refresh()}
        />
        </SettingsGroup>
      </SettingsPage>
    </div>
  )
}
