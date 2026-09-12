import { AeSection } from '@/components/ae/layout/AeSection'
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
      className="scroll-mt-6 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <AeSection
        title="Provider connections"
        description="Connect a hosted x402 endpoint so Agentic Economy can route paid calls without collecting an API key or wallet secret. Then open a Tool and select this connection as its access authority."
      >
        <AeProviderConnectionList
          connections={connections}
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
      </AeSection>
    </div>
  )
}
