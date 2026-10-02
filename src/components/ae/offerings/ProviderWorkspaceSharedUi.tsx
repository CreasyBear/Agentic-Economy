import { Await } from '@tanstack/react-router'
import { Suspense, type ReactNode } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/arc/button/button'
import { Skeleton } from '@/components/ui/skeleton'
import './ProviderWorkspaceComposition.css'

export function DeferredSection<T>({ promise, loadingLabel, unavailableTitle, children }: Readonly<{
  promise: Promise<T> | undefined
  loadingLabel: string
  unavailableTitle: string
  children: (value: T) => ReactNode
}>) {
  if (promise === undefined) return <UnavailableSummary title={unavailableTitle} />
  return (
    <Suspense fallback={<div aria-busy="true" aria-label={loadingLabel} className="grid gap-intra"><Skeleton className="h-5 w-40" /><Skeleton className="h-10 w-full" /></div>}>
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
    <Alert className="arc-market">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>This section could not be confirmed. The rest of the Tools page remains available.</p>
        {retryLabel === undefined || onRetry === undefined ? null : (
          <Button type="button" variant="secondary" size="md" className="mt-4" onClick={onRetry}>{retryLabel}</Button>
        )}
      </AlertDescription>
    </Alert>
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
    <Alert variant="destructive" className="arc-market">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>Records do not belong to the current provider. Controls remain read-only.</AlertDescription>
    </Alert>
  )
}
