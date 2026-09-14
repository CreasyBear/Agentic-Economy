import { CheckIcon } from 'lucide-react'

import { AeInlineState } from '@/components/ae/feedback/AeInlineState'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SupplySourceInput } from '@/modules/capability-supply/source-preview'
import { SupplyCandidateSection } from './SupplyCandidateSection'
import { SupplyPublicationFlow } from './SupplyPublicationFlow'
import { SupplyRemoteSelectionSection } from './SupplyRemoteSelectionSection'
import { SupplySourceTypeSection } from './SupplySourceTypeSection'
import { pricingInput, publicationPriceSummary } from './supply-source-native-start-presentation'
import { useSupplyNativeStartState, type SupplyNativeStartProps } from './useSupplyNativeStartState'

type SupplyStage = 'source' | 'tool' | 'terms' | 'review'

export function AeSupplySourceNativeStart(props: SupplyNativeStartProps) {
  const vm = useSupplyNativeStartState(props)
  const stage: SupplyStage = vm.selected === undefined
    ? vm.preview === undefined ? 'source' : 'tool'
    : vm.reviewing ? 'review' : 'terms'

  return (
    <div className="grid gap-section">
      <SupplyProgress current={stage} />
      <SupplyFlowFeedback error={vm.error} requiredAction={vm.requiredAction} success={vm.success} publicationLocked={vm.publicationLocked} />

      {stage === 'source' ? (
        <SupplySourceTypeSection
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
          onDefinitionUrlChange={(next) => {
            vm.setDefinitionUrl(next)
            vm.resetDiscoveryOnSourceEdit()
          }}
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
          onResourceUrlChange={(next) => {
            vm.setResourceUrl(next)
            vm.resetDiscoveryOnSourceEdit()
          }}
          onX402MethodChange={(next) => {
            vm.setX402Method(next)
            vm.resetDiscoveryOnSourceEdit()
          }}
          onFieldError={vm.setError}
          onDiscover={() => void vm.findTools()}
        />
      ) : null}

      {stage !== 'source' || vm.remoteSelection === undefined ? null : (
        <SupplyRemoteSelectionSection
          remotes={vm.remoteSelection.remotes}
          value={vm.selectedRemoteRef}
          disabled={vm.pending !== undefined}
          onChange={vm.setSelectedRemoteRef}
          onContinue={() => void vm.findTools(vm.selectedRemoteRef)}
        />
      )}

      {stage !== 'tool' || vm.preview === undefined ? null : (
        <div className="grid gap-related">
          <CompletedStageSummary step="Source" detail={sourceSummary(vm.source)} disabled={vm.pending !== undefined} onEdit={vm.editSource} />
          <SupplyCandidateSection
            candidates={vm.preview.candidates}
            selectedRef={vm.selectedRef}
            onSelect={(value) => {
              const candidate = vm.preview?.candidates.find(({ candidateRef }) => candidateRef === value)
              if (candidate !== undefined && candidate.disposition.kind === 'supported') void vm.selectCandidate(candidate)
            }}
          />
        </div>
      )}

      {vm.selected === undefined || (stage !== 'terms' && stage !== 'review') ? null : (
        <div className="grid gap-section">
          <div className="sticky top-20 z-10 grid gap-intra rounded-xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:grid-cols-2">
            <CompletedStageSummary step="Source" detail={sourceSummary(vm.source)} disabled={vm.pending !== undefined || vm.publicationLocked} onEdit={vm.editSource} />
            <CompletedStageSummary step="Tool" detail={vm.selected.title} disabled={vm.pending !== undefined || vm.publicationLocked} onEdit={vm.editTool} />
            {stage === 'review' ? <CompletedStageSummary step="Terms" detail={termsSummary(vm)} disabled={vm.pending !== undefined || vm.publicationLocked} onEdit={vm.editTerms} /> : null}
          </div>
          <SupplyPublicationFlow
            reviewing={stage === 'review'}
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
            disabled={vm.pending !== undefined || vm.publicationLocked}
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
            onContinueToReview={vm.continueToReview}
            onEditTerms={vm.editTerms}
            onSubmit={() => void vm.submit()}
          />
        </div>
      )}
      {vm.pending === 'select' ? <div role="status" aria-live="polite"><AeInlineState state="saving" description="Saving the selected Tool so you can return later." /></div> : null}
    </div>
  )
}

const stages: readonly SupplyStage[] = ['source', 'tool', 'terms', 'review']

function SupplyProgress({ current }: Readonly<{ current: SupplyStage }>) {
  const currentIndex = stages.indexOf(current)
  return (
    <nav aria-label="Add Tool progress">
      <ol className="grid grid-cols-4 gap-2">
        {stages.map((stage, index) => {
          const complete = index < currentIndex
          const active = index === currentIndex
          return (
            <li key={stage} aria-current={active ? 'step' : undefined} className={cn('grid min-w-0 gap-1 border-t-2 pt-2 text-xs capitalize', active ? 'border-foreground font-medium text-foreground' : complete ? 'border-brand text-foreground' : 'border-border text-muted-foreground')}>
              <span className="flex items-center gap-1.5">
                <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[0.625rem]', complete && 'border-brand bg-brand text-brand-foreground', active && 'border-foreground')}>
                  {complete ? <CheckIcon aria-hidden="true" className="size-3" /> : index + 1}
                </span>
                <span className="truncate">{stage}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function CompletedStageSummary({ step, detail, disabled, onEdit }: Readonly<{ step: string; detail: string; disabled: boolean; onEdit: () => void }>) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-3 py-2">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-xs font-medium text-muted-foreground">{step} complete</span>
        <span className="truncate text-sm text-foreground" title={detail}>{detail}</span>
      </span>
      <Button type="button" size="sm" variant="ghost" className="min-h-touch shrink-0" disabled={disabled} onClick={onEdit}>Edit {step}</Button>
    </div>
  )
}

function SupplyFlowFeedback({ error, requiredAction, success, publicationLocked }: Readonly<{
  error?: string
  requiredAction?: ReturnType<typeof useSupplyNativeStartState>['requiredAction']
  success?: string
  publicationLocked: boolean
}>) {
  return (
    <>
      {error === undefined ? null : <Alert variant="destructive" role="alert"><AlertTitle>Action required</AlertTitle><AlertDescription><p>{error}</p>{publicationLocked ? <Button asChild variant="outline" className="mt-4 min-h-touch"><a href="/owner/operations">Open Tools</a></Button> : null}</AlertDescription></Alert>}
      {requiredAction === undefined ? null : (
        <Alert role="status">
          <AlertTitle>{requiredAction.title}</AlertTitle>
          <AlertDescription>
            <p>{requiredAction.description}</p>
            {requiredAction.cta === null ? null : <Button asChild variant="secondary" className="mt-4 min-h-touch"><a href={requiredAction.cta}>{requiredAction.ctaLabel}</a></Button>}
          </AlertDescription>
        </Alert>
      )}
      {success === undefined ? null : (
        <Alert>
          <AlertTitle>Submitted</AlertTitle>
          <AlertDescription className="grid gap-related">
            <p>{success}</p>
            <Button asChild variant="secondary" className="w-fit min-h-touch"><a href="/owner/operations">Open Tools</a></Button>
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}

function sourceSummary(source: SupplySourceInput | undefined): string {
  if (source === undefined) return 'Source details unavailable'
  const label = source.kind === 'openapi' ? 'OpenAPI' : source.kind === 'mcp' ? 'MCP' : source.kind === 'agent_plugin' ? 'Agent Plugin' : 'x402'
  const location = source.kind === 'openapi'
    ? source.definitionUrl
    : source.kind === 'mcp'
      ? source.serverUrl ?? source.registryName ?? 'Selected MCP source'
      : source.kind === 'x402'
        ? source.resourceUrl
        : 'Uploaded manifests'
  return `${label} · ${location} · ${source.environment === 'sandbox' ? 'Sandbox' : 'Production'}`
}

function termsSummary(vm: ReturnType<typeof useSupplyNativeStartState>): string {
  const price = publicationPriceSummary(pricingInput(vm.pricingKind, vm.price))
  return `${vm.category || 'Category needed'} · ${price}`
}
