import { Await } from '@tanstack/react-router'
import { Suspense, type ReactNode } from 'react'

import { AeEmptyState } from '@/components/ae/shared/arc/empty-state/AeEmptyState'
import { Skeleton as ArcSkeleton } from '@/components/arc/skeleton/skeleton'
import { AeAlert } from '@/components/ae/shared/arc/alert/AeAlert'
import { Button } from '@/components/arc/button/button'
import './ProviderWorkspaceComposition.css'

export function DeferredSection<T>({ promise, loadingLabel, unavailableTitle, children }: Readonly<{
  promise: Promise<T> | undefined
  loadingLabel: string
  unavailableTitle: string
  children: (value: T) => ReactNode
}>) {
  if (promise === undefined) return <UnavailableSummary title={unavailableTitle} />
  return (
    <Suspense fallback={<div role="status" aria-busy="true" aria-label={loadingLabel} className="grid gap-intra">
      <div className="h-5 w-40"><div aria-hidden="true"><ArcSkeleton lines={1} /></div></div>
      <div className="h-10 w-full overflow-hidden"><div aria-hidden="true"><ArcSkeleton lines={2} /></div></div>
    </div>}>
      <Await promise={promise}>{children}</Await>
    </Suspense>
  )
}

export function SummaryCard({ title, detail, action, onAction }: Readonly<{ title: string; detail: string; action: string; onAction: () => void }>) {
  return <div className="arc-market arc-provider-workspace-summary"><div><h3>{title}</h3><p>{detail}</p></div><Button type="button" variant="secondary" size="md" onClick={onAction}>{action}</Button></div>
}

export function UnavailableSummary({ title, retryLabel, onRetry }: Readonly<{
  title: string
  retryLabel?: string
  onRetry?: () => void
}>) {
  return (
    <AeAlert role="alert" tone="info" title={title} className="arc-market">
        <p>This section could not be confirmed. The rest of the Tools page remains available.</p>
        {retryLabel === undefined || onRetry === undefined ? null : (
          <Button type="button" variant="secondary" size="md" className="mt-4" onClick={onRetry}>{retryLabel}</Button>
        )}
      </AeAlert>
  )
}

export function SecondarySummary({ result, subject, notApplicableTitle, unavailableTitle }: Readonly<{
  result: Readonly<{ kind: 'unavailable' | 'not_applicable' }> | Readonly<{ kind: 'conflict'; reason: string }>
  subject: string
  notApplicableTitle: string
  unavailableTitle: string
}>) {
  if (result.kind === 'conflict') return <OwnershipConflict title={`${subject} ownership conflict`} />
  if (result.kind === 'not_applicable') {
    return <AeEmptyState title={notApplicableTitle} description="Nothing is required here until this provider uses this part of the Tools page." />
  }
  return <UnavailableSummary title={unavailableTitle} />
}

export function OwnershipConflict({ title }: Readonly<{ title: string }>) {
  return (
    <AeAlert tone="danger" title={title} className="arc-market">Records do not belong to the current provider. Controls remain read-only.</AeAlert>
  )
}
