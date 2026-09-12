import { Await } from '@tanstack/react-router'
import { Suspense, type ComponentProps } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeWorkspaceGeneral } from '@/components/ae/settings/AeWorkspaceGeneral'
import { Skeleton } from '@/components/ui/skeleton'
import { OwnershipConflict, SummaryCard, UnavailableSummary } from './ProviderWorkspaceSharedUi'
import type {
  ProviderWorkspaceIdentityDetailResult,
  ProviderWorkspacePublicStatusResult,
} from './provider-workspace.functions'

export function ProviderWorkspaceIdentitySection({
  providerName,
  identityOpen,
  identityPending,
  identityDetail,
  publicStatus,
  onOpenIdentity,
  onRetryIdentity,
  onRename,
}: Readonly<{
  providerName: string
  identityOpen: boolean
  identityPending: boolean
  identityDetail?: ProviderWorkspaceIdentityDetailResult
  publicStatus?: Promise<ProviderWorkspacePublicStatusResult>
  onOpenIdentity: () => void
  onRetryIdentity: () => void
  onRename: NonNullable<ComponentProps<typeof AeWorkspaceGeneral>['onRename']>
}>) {
  return (
    <AeSection id="provider-identity" title="Provider identity" description="The public provider identity that owns these Tools.">
      <SummaryCard title="Provider details" detail={providerName} action="Manage provider identity" onAction={onOpenIdentity} />
      {identityOpen ? identityPending ? <div aria-busy="true"><Skeleton className="h-24 w-full" /></div> : identityDetail?.kind === 'available' ? (
        <IdentityManagement
          identity={identityDetail}
          publicStatus={publicStatus}
          onRename={onRename}
        />
      ) : identityDetail?.kind === 'conflict' ? (
        <OwnershipConflict title="Provider identity ownership conflict" />
      ) : identityDetail?.kind === 'not_applicable' ? (
        <AeEmptyState title="Provider identity not configured" description="Reload Tools to create the current account’s provider identity." />
      ) : <UnavailableSummary title="Provider identity controls unavailable" retryLabel="Try provider identity again" onRetry={onRetryIdentity} /> : null}
    </AeSection>
  )
}

function IdentityManagement({ identity, publicStatus, onRename }: Readonly<{
  identity: Extract<ProviderWorkspaceIdentityDetailResult, { kind: 'available' }>
  publicStatus: Promise<ProviderWorkspacePublicStatusResult> | undefined
  onRename: NonNullable<ComponentProps<typeof AeWorkspaceGeneral>['onRename']>
}>) {
  if (publicStatus === undefined) {
    return <AeWorkspaceGeneral result={{ kind: 'unavailable', reason: 'source_unavailable', retryable: true }} identity={identity} onRename={onRename} />
  }
  return (
    <Suspense fallback={<div aria-busy="true"><Skeleton className="h-24 w-full" /></div>}>
      <Await promise={publicStatus}>{(result) => (
        result.kind === 'conflict'
          ? <OwnershipConflict title="Provider identity ownership conflict" />
          : <AeWorkspaceGeneral
              result={result.kind === 'available'
                ? { kind: 'available', readback: result.value }
                : { kind: 'unavailable', reason: 'source_unavailable', retryable: true }}
              identity={identity}
              onRename={onRename}
            />
      )}</Await>
    </Suspense>
  )
}
