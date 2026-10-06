import { Await } from '@tanstack/react-router'
import { Suspense, type ReactNode } from 'react'

import { AeSection } from '@/components/ae/layout/AeSection'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import './ProviderWorkspaceComposition.css'
import { projectProviderWorkspace, type ProviderWorkspaceProjectionRow } from './provider-workspace-projection'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import type {
  ProviderWorkspaceInventoryResult,
  ProviderWorkspaceLifecycleResult,
} from './provider-workspace.functions'

export function ProviderWorkspaceToolsSection({ inventory, lifecycle, compatibilityCursor, renderList }: Readonly<{
  inventory: Extract<ProviderWorkspaceInventoryResult, { kind: 'available' }>
  lifecycle?: Promise<ProviderWorkspaceLifecycleResult>
  compatibilityCursor?: string
  renderList: (rows: readonly ProviderWorkspaceProjectionRow[]) => ReactNode
}>) {
  const pendingRows = inventory.tools.map((row): ProviderWorkspaceProjectionRow => ({
    ...row,
    lifecycleLabel: 'Loading',
    availability: 'unknown',
    // Well 8 Lane C: a live reviewed-tier Tool resolves by its canonical
    // slug; one with no current publication yet (draft/unready/incompatible)
    // has none, so it falls back to its offeringRef - the route resolves
    // both, each for a different lifecycle phase.
    continuation: {
      kind: 'navigate', label: 'View status',
      href: `/owner/operations/${encodeURIComponent(row.slug ?? row.offeringRef)}`,
    },
    lifecyclePending: true,
  }))

  return (
    <AeSection title="Tools" description={`Tools supplied by ${inventory.provider.name}.`}>
      {inventory.diagnostics?.map((diagnostic) => (
        <AeAlert role="alert" tone="info" title="Tool status needs repair" key={diagnostic.offeringRef}>{diagnostic.offeringRef}: lifecycle status could not be read. Other Tools remain available.</AeAlert>
      ))}
      {lifecycle === undefined ? renderList(pendingRows) : (
        <Suspense fallback={renderList(pendingRows)}>
          <Await promise={lifecycle}>{(result) => {
            const projection = projectProviderWorkspace(inventory, result)
            if (projection.kind === 'conflict') {
              const isOwnershipConflict =
                projection.reason === 'business_mismatch' ||
                projection.reason === 'multiple_providers'

              return (
                <AeAlert tone="danger" title={isOwnershipConflict
                      ? 'Provider ownership conflict'
                      : 'Tools need repair'}>
                    {isOwnershipConflict
                      ? 'Lifecycle records do not belong to the current provider. No Tool action is available.'
                      : 'Duplicate lifecycle records were found. No publication action is available.'}
                  </AeAlert>
              )
            }
            return (
              <div className="arc-provider-workspace-tool-results">
                {projection.attentionCount === 0 ? null : (
                  <AeAlert role="alert" tone="info" title={projection.attentionCount === 1 ? '1 Tool needs attention' : `${projection.attentionCount} Tools need attention`}>{projection.firstBlocker}</AeAlert>
                )}
                {projection.inconsistencyCount === 0 ? null : (
                  <AeAlert role="alert" tone="info" title="Lifecycle update in progress">Some lifecycle facts do not yet match the current inventory.</AeAlert>
                )}
                {renderList(projection.rows)}
              </div>
            )
          }}</Await>
        </Suspense>
      )}
      {inventory.isDone && compatibilityCursor === undefined ? null : (
        <nav aria-label="Tool pages" className="arc-provider-workspace-tool-pages">
          {compatibilityCursor === undefined ? null : (
            <a
              href="/owner/operations"
              className={actionLinkClassName('secondary', 'md')}
            >
              First 50 Tools
            </a>
          )}
          {inventory.isDone ? null : (
            <a
              href={`/owner/operations?cursor=${encodeURIComponent(inventory.continueCursor)}`}
              className={actionLinkClassName('secondary', 'md')}
            >
              Next 50 Tools
            </a>
          )}
        </nav>
      )}
    </AeSection>
  )
}
