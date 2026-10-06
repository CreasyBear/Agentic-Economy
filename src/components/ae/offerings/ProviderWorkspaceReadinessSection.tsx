import { AeEmptyState } from '@/components/ae/shared/empty-state/AeEmptyState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeCapabilityList } from '@/components/ae/status/AeCapabilityList'
import { AeStatusCard } from '@/components/ae/status/AeStatusCard'
import type { OwnerToolsX402ConnectionIntent } from '@/lib/operator/supply-compatibility'
import { DeferredSection, SecondarySummary } from './ProviderWorkspaceSharedUi'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
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
      <div className="arc-market arc-provider-workspace-readiness">
        <DeferredSection promise={connections} loadingLabel="Loading connections" unavailableTitle="Connections unavailable">
          {(result) => result.kind === 'available' ? (
            <div className="arc-provider-workspace-metric">
              <h3>Connections</h3><p>{result.value.available} of {result.value.total} available</p>
            </div>
          ) : <SecondarySummary result={result} subject="Connections" notApplicableTitle="No connections configured" unavailableTitle="Connections unavailable" />}
        </DeferredSection>
        <a href={connectionHref} className={[actionLinkClassName('secondary', 'md'), 'arc-provider-workspace-manage'].join(' ')}>
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
