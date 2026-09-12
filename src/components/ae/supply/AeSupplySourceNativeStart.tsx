import { AeInlineState } from '@/components/ae/feedback/AeInlineState'
import { SupplyCandidateSection } from './SupplyCandidateSection'
import { SupplyPublicationSection } from './SupplyPublicationSection'
import { SupplyRemoteSelectionSection } from './SupplyRemoteSelectionSection'
import { SupplySourceTypeSection } from './SupplySourceTypeSection'
import { useSupplyNativeStartState, type SupplyNativeStartProps } from './useSupplyNativeStartState'

export function AeSupplySourceNativeStart(props: SupplyNativeStartProps) {
  const vm = useSupplyNativeStartState(props)

  return (
    <div className="grid gap-section">
      <SupplySourceTypeSection
        {...vm.error === undefined ? {} : { error: vm.error }}
        {...vm.requiredAction === undefined ? {} : { requiredAction: vm.requiredAction }}
        {...vm.success === undefined ? {} : { success: vm.success }}
        sourceKind={vm.sourceKind}
        environment={vm.environment}
        definitionUrl={vm.definitionUrl}
        mcpLocator={vm.mcpLocator}
        serverUrl={vm.serverUrl}
        registryName={vm.registryName}
        pluginJson={vm.pluginJson}
        mcpJson={vm.mcpJson}
        resourceUrl={vm.resourceUrl}
        x402Method={vm.x402Method}
        disabled={vm.pending !== undefined}
        discovering={vm.pending === 'preview'}
        onSourceKindChange={vm.changeSourceKind}
        onEnvironmentChange={(next) => {
          vm.setEnvironment(next)
          vm.resetDiscoveryOnSourceEdit()
        }}
        onDefinitionUrlChange={vm.setDefinitionUrl}
        onMcpLocatorChange={(next) => {
          vm.setMcpLocator(next)
          vm.resetDiscoveryOnSourceEdit()
        }}
        onServerUrlChange={(next) => {
          vm.setServerUrl(next)
          vm.resetDiscoveryOnSourceEdit()
        }}
        onRegistryNameChange={(next) => {
          vm.setRegistryName(next)
          vm.resetDiscoveryOnSourceEdit()
        }}
        onPluginJsonChange={(next) => {
          vm.setPluginJson(next)
          vm.resetDiscoveryOnSourceEdit()
        }}
        onMcpJsonChange={(next) => {
          vm.setMcpJson(next)
          vm.resetDiscoveryOnSourceEdit()
        }}
        onResourceUrlChange={vm.setResourceUrl}
        onX402MethodChange={vm.setX402Method}
        onFieldError={vm.setError}
        onDiscover={() => void vm.findTools()}
      />

      {vm.remoteSelection === undefined ? null : (
        <SupplyRemoteSelectionSection
          remotes={vm.remoteSelection.remotes}
          value={vm.selectedRemoteRef}
          disabled={vm.pending !== undefined}
          onChange={vm.setSelectedRemoteRef}
          onContinue={() => void vm.findTools(vm.selectedRemoteRef)}
        />
      )}

      {vm.preview === undefined ? null : (
        <SupplyCandidateSection
          candidates={vm.preview.candidates}
          selectedRef={vm.selectedRef}
          onSelect={(value) => {
            const candidate = vm.preview?.candidates.find(({ candidateRef }) => candidateRef === value)
            if (candidate !== undefined && candidate.disposition.kind === 'supported') void vm.selectCandidate(candidate)
          }}
        />
      )}

      {vm.selected === undefined ? null : (
        <SupplyPublicationSection
          name={vm.name}
          description={vm.description}
          category={vm.category}
          serviceArea={vm.serviceArea}
          availability={vm.availability}
          selected={vm.selected}
          pricingKind={vm.pricingKind}
          price={vm.price}
          connectionRef={vm.connectionRef}
          eligibleConnections={vm.eligibleConnections}
          connecting={vm.pending === 'connect'}
          externalEffect={vm.externalEffect}
          dataRelease={vm.dataRelease}
          financialExposure={vm.financialExposure}
          dataClassification={vm.dataClassification}
          attestation={vm.attestation}
          saving={vm.pending === 'publish'}
          submitDisabled={vm.pending !== undefined || vm.success !== undefined}
          onNameChange={vm.setName}
          onDescriptionChange={vm.setDescription}
          onCategoryChange={vm.setCategory}
          onServiceAreaChange={vm.setServiceArea}
          onAvailabilityChange={vm.setAvailability}
          onPricingKindChange={vm.setPricingKind}
          onPriceChange={vm.setPrice}
          onConnectionRefChange={vm.setConnectionRef}
          onConnect={() => void vm.connectSelectedSource()}
          onExternalEffectChange={vm.setExternalEffect}
          onDataReleaseChange={vm.setDataRelease}
          onFinancialExposureChange={vm.setFinancialExposure}
          onDataClassificationChange={vm.setDataClassification}
          onAttestationChange={(key, checked) => vm.setAttestation((current) => ({ ...current, [key]: checked }))}
          onSubmit={() => void vm.submit()}
        />
      )}
      {vm.pending === 'select' ? <div role="status" aria-live="polite"><AeInlineState state="saving" description="Saving the selected Tool so you can return later." /></div> : null}
    </div>
  )
}
