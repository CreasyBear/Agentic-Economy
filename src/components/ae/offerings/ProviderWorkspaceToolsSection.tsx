import { Await } from '@tanstack/react-router'
import { Suspense, type ReactNode } from 'react'

import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { projectProviderWorkspace, type ProviderWorkspaceProjectionRow } from './provider-workspace-projection'
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
      {lifecycle === undefined ? renderList(pendingRows) : (
        <Suspense fallback={renderList(pendingRows)}>
          <Await promise={lifecycle}>{(result) => {
            const projection = projectProviderWorkspace(inventory, result)
            if (projection.kind === 'conflict') {
              const isOwnershipConflict =
                projection.reason === 'business_mismatch' ||
                projection.reason === 'multiple_providers'

              return (
                <Alert variant="destructive">
                  <AlertTitle>
                    {isOwnershipConflict
                      ? 'Provider ownership conflict'
                      : 'Tools need repair'}
                  </AlertTitle>
                  <AlertDescription>
                    {isOwnershipConflict
                      ? 'Lifecycle records do not belong to the current provider. No Tool action is available.'
                      : 'Duplicate lifecycle records were found. No publication action is available.'}
                  </AlertDescription>
                </Alert>
              )
            }
            return (
              <div className="grid gap-related">
                {projection.attentionCount === 0 ? null : (
                  <Alert>
                    <AlertTitle>{projection.attentionCount === 1 ? '1 Tool needs attention' : `${projection.attentionCount} Tools need attention`}</AlertTitle>
                    <AlertDescription>{projection.firstBlocker}</AlertDescription>
                  </Alert>
                )}
                {projection.inconsistencyCount === 0 ? null : (
                  <Alert><AlertTitle>Lifecycle update in progress</AlertTitle><AlertDescription>Some lifecycle facts do not yet match the current inventory.</AlertDescription></Alert>
                )}
                {renderList(projection.rows)}
              </div>
            )
          }}</Await>
        </Suspense>
      )}
      {inventory.isDone && compatibilityCursor === undefined ? null : (
        <nav aria-label="Tool pages" className="flex flex-wrap gap-intra">
          {compatibilityCursor === undefined ? null : (
            <Button asChild variant="secondary" className="min-h-touch">
              <a href="/owner/operations">First 50 Tools</a>
            </Button>
          )}
          {inventory.isDone ? null : (
            <Button asChild variant="secondary" className="min-h-touch">
              <a href={`/owner/operations?cursor=${encodeURIComponent(inventory.continueCursor)}`}>Next 50 Tools</a>
            </Button>
          )}
        </nav>
      )}
    </AeSection>
  )
}
