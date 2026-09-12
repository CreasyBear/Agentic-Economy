import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeOwnerProviderConnections } from '@/components/ae/supply/AeOwnerProviderConnections'
import { AeCapabilityList } from '@/components/ae/status/AeCapabilityList'
import { AeStatusCard } from '@/components/ae/status/AeStatusCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import type { OwnerToolsX402ConnectionIntent } from '@/lib/operator/supply-compatibility'
import { focusSection } from './provider-workspace-projection'
import { DeferredSection, OwnershipConflict, SecondarySummary, SummaryCard, UnavailableSummary } from './ProviderWorkspaceSharedUi'
import type {
  ProviderWorkspaceConnectionsDetailResult,
  ProviderWorkspaceConnectionsResult,
  ProviderWorkspacePublicStatusResult,
} from './provider-workspace.functions'

export function ProviderWorkspaceReadinessSection({
  connections,
  publicStatus,
  connectionsOpen,
  connectionsPending,
  connectionsDetail,
  connectionTargetMissing,
  x402Handoff,
  onOpenConnections,
  onRetryConnections,
}: Readonly<{
  connections?: Promise<ProviderWorkspaceConnectionsResult>
  publicStatus?: Promise<ProviderWorkspacePublicStatusResult>
  connectionsOpen: boolean
  connectionsPending: boolean
  connectionsDetail?: ProviderWorkspaceConnectionsDetailResult
  connectionTargetMissing: boolean
  x402Handoff?: OwnerToolsX402ConnectionIntent
  onOpenConnections: () => void
  onRetryConnections: () => void
}>) {
  return (
    <AeSection id="provider-connections" title="Provider readiness" description="Provider connections and current public availability.">
      <div className="grid gap-related md:grid-cols-2">
        <DeferredSection promise={connections} loadingLabel="Loading connections" unavailableTitle="Connections unavailable">
          {(result) => result.kind === 'available' ? (
            <SummaryCard title="Connections" detail={`${result.value.available} of ${result.value.total} available`} action="Manage connections" onAction={onOpenConnections} />
          ) : <SecondarySummary result={result} subject="Connections" notApplicableTitle="No connections configured" unavailableTitle="Connections unavailable" />}
        </DeferredSection>
        <DeferredSection promise={publicStatus} loadingLabel="Loading public status" unavailableTitle="Public status unavailable">
          {(result) => result.kind === 'available' ? (
            <SummaryCard title="Public status" detail={`${result.value.catalog.offerings.length} public Tools`} action="Review public status" onAction={() => focusSection('provider-status')} />
          ) : <SecondarySummary result={result} subject="Public status" notApplicableTitle="Public status not published" unavailableTitle="Public status unavailable" />}
        </DeferredSection>
      </div>
      {connectionsOpen ? (
        <div className="grid gap-related">
          {connectionTargetMissing ? <Alert variant="destructive"><AlertTitle>Connection target unavailable</AlertTitle><AlertDescription>The requested connection is not in the current provider readback. No connection was changed.</AlertDescription></Alert> : null}
          {connectionsPending ? <div aria-busy="true"><Skeleton className="h-24 w-full" /></div> : connectionsDetail?.kind === 'available' ? (
            <AeOwnerProviderConnections
              businessId={connectionsDetail.businessId}
              connections={connectionsDetail.connections}
              {...(x402Handoff === undefined ? {} : { x402Handoff })}
            />
          ) : connectionsDetail?.kind === 'conflict' ? (
            <OwnershipConflict title="Connection ownership conflict" />
          ) : connectionsDetail?.kind === 'not_applicable' ? (
            <AeEmptyState title="No connection controls configured" description="Connect a provider from Tool preparation when one is required." />
          ) : <UnavailableSummary title="Connection controls unavailable" retryLabel="Try connections again" onRetry={onRetryConnections} />}
        </div>
      ) : null}
      <div id="provider-status" className="scroll-mt-anchor">
        <DeferredSection promise={publicStatus} loadingLabel="Loading public provider status" unavailableTitle="Public status unavailable">
          {(result) => result.kind === 'available' ? (
            <div className="grid gap-section">
              <AeStatusCard readback={result.value} />
              <AeCapabilityList catalog={result.value.catalog} />
            </div>
          ) : <SecondarySummary result={result} subject="Public status" notApplicableTitle="Public status not published" unavailableTitle="Public status unavailable" />}
        </DeferredSection>
      </div>
    </AeSection>
  )
}
