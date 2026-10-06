import { Await } from '@tanstack/react-router'
import { Suspense, type ComponentProps } from 'react'

import { AeEmptyState } from '@/components/ae/shared/arc/empty-state/AeEmptyState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeWorkspaceGeneral } from '@/components/ae/settings/AeWorkspaceGeneral'
import buttonStyles from '@/components/arc/button/button.module.css'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import { appDestination } from '@/lib/navigation/app-navigation'
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
      {identityOpen ? identityPending ? <Skeleton label="Loading provider identity" lines={3} className="h-24 w-full" /> : identityDetail?.kind === 'available' ? (
        <IdentityManagement
          identity={identityDetail}
          publicStatus={publicStatus}
          onRename={onRename}
        />
      ) : identityDetail?.kind === 'conflict' ? (
        <OwnershipConflict title="Provider identity ownership conflict" />
      ) : identityDetail?.kind === 'not_applicable' ? (
        <AeEmptyState title="Provider identity not configured" description="Reload the Tools page to create the current account’s provider identity." />
      ) : <UnavailableSummary title="Provider identity controls unavailable" retryLabel="Try provider identity again" onRetry={onRetryIdentity} /> : null}
      <a
        href={appDestination('settings').to}
        className={['arc-market', buttonStyles.button, buttonStyles.secondary, buttonStyles.md, 'w-fit'].join(' ')}
      >
        Open Settings
      </a>
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
    <Suspense fallback={<Skeleton label="Loading provider identity" lines={3} className="h-24 w-full" />}>
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
