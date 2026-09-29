import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeCapabilityList } from '@/components/ae/status/AeCapabilityList'
import { AeStatusCard } from '@/components/ae/status/AeStatusCard'
import type { OwnerToolsX402ConnectionIntent } from '@/lib/operator/supply-compatibility'
import { DeferredSection, SecondarySummary } from './ProviderWorkspaceSharedUi'
import type {
  ProviderWorkspaceConnectionsResult,
  ProviderWorkspacePublicStatusResult,
} from './provider-workspace.functions'

export function ProviderWorkspaceReadinessSection({
  connections,
  publicStatus,
  x402Handoff,
  rebindOfferingRef,
  connectionHash,
}: Readonly<{
  connections?: Promise<ProviderWorkspaceConnectionsResult>
  publicStatus?: Promise<ProviderWorkspacePublicStatusResult>
  x402Handoff?: OwnerToolsX402ConnectionIntent
  rebindOfferingRef?: string
  connectionHash?: string
}>) {
  const search = x402Handoff ?? (rebindOfferingRef === undefined ? undefined : { rebind: rebindOfferingRef })
  const connectionHref = `/owner/settings/integrations${search === undefined ? '' : `?${new URLSearchParams(Object.entries(search)).toString()}`}${connectionHash ?? ''}`
  return (
    <AeSection id="provider-connections" title="Tool availability" description="The connection needed to operate your Tools and their current buyer availability.">
      <div className="grid gap-related">
        <DeferredSection promise={connections} loadingLabel="Loading connections" unavailableTitle="Connections unavailable">
          {(result) => result.kind === 'available' ? (
            <div className="grid gap-related rounded-card border border-border p-related">
              <div><h3 className="font-medium">Connections</h3><p className="text-sm text-muted-foreground">{result.value.available} of {result.value.total} available</p></div>
            </div>
          ) : <SecondarySummary result={result} subject="Connections" notApplicableTitle="No connections configured" unavailableTitle="Connections unavailable" />}
        </DeferredSection>
        <a href={connectionHref} className="min-h-touch justify-self-start text-sm font-medium underline underline-offset-4 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring">
          Manage connections
        </a>
      </div>
      <div id="provider-status" className="scroll-mt-anchor">
        <DeferredSection promise={publicStatus} loadingLabel="Loading public provider status" unavailableTitle="Public status unavailable">
          {(result) => result.kind === 'available' ? (
            <div className="grid gap-section">
              <AeStatusCard readback={result.value} />
              <AeCapabilityList catalog={result.value.catalog} />
            </div>
          ) : result.kind === 'not_applicable' ? (
            <AeEmptyState title="No public Tools yet" description="Draft Tools remain private. Finish and publish a Tool when you are ready." />
          ) : <SecondarySummary result={result} subject="Public status" notApplicableTitle="No public Tools yet" unavailableTitle="Public status unavailable" />}
        </DeferredSection>
      </div>
    </AeSection>
  )
}
