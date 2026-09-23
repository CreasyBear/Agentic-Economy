import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeOwnerProviderConnections } from '@/components/ae/supply/AeOwnerProviderConnections'
import { AeCapabilityList } from '@/components/ae/status/AeCapabilityList'
import { AeStatusCard } from '@/components/ae/status/AeStatusCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import type { OwnerToolsX402ConnectionIntent } from '@/lib/operator/supply-compatibility'
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
  onCloseConnections,
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
  onCloseConnections: () => void
  onRetryConnections: () => void
}>) {
  return (
    <AeSection id="provider-connections" title="Tool availability" description="The connection needed to operate your Tools and their current buyer availability.">
      <div className="grid gap-related">
        <DeferredSection promise={connections} loadingLabel="Loading connections" unavailableTitle="Connections unavailable">
          {(result) => result.kind === 'available' ? (
            <SummaryCard title="Connections" detail={`${result.value.available} of ${result.value.total} available`} action="Manage connections" onAction={onOpenConnections} />
          ) : <SecondarySummary result={result} subject="Connections" notApplicableTitle="No connections configured" unavailableTitle="Connections unavailable" />}
        </DeferredSection>
      </div>
      <Sheet open={connectionsOpen} onOpenChange={(open) => { if (!open) onCloseConnections() }}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Connections</SheetTitle>
            <SheetDescription>The connection needed to operate your Tools.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-related px-gutter pb-gutter">
            {connectionsOpen ? (
              <>
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
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
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
