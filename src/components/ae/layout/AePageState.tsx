import type { ReactNode } from 'react'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { Skeleton } from '@/components/ui/skeleton'

type AePageStateTone = 'neutral' | 'warning' | 'danger'

type AePageStateProps = {
  title: string
  description: string
  tone?: AePageStateTone
  action?: ReactNode
}

function pageStateEyebrow(tone: AePageStateTone): string | undefined {
  switch (tone) {
    case 'danger':
      return 'Error'
    case 'warning':
      return 'Notice'
    case 'neutral':
      return undefined
    default: {
      const exhaustive: never = tone
      return exhaustive
    }
  }
}

/**
 * One shared shell for route-level empty, unavailable, and error states on
 * public surfaces. The title is a real `<h1>` and the container carries the
 * semantic role (`status` for empty/unavailable, `alert` for failures).
 */
export function AePageState({ title, description, tone = 'neutral', action }: AePageStateProps) {
  const eyebrow = pageStateEyebrow(tone)

  return (
    <AePublicPage
      kind="tool"
      title={title}
      description={description}
      introRole={tone === 'danger' ? 'alert' : 'status'}
      {...(eyebrow === undefined ? {} : { eyebrow })}
      {...(action === undefined ? {} : { actions: action })}
    />
  )
}

type AePageSkeletonProps = {
  title: string
  description?: string
  /**
   * Content shape of the skeleton. Defaults to a list of three rows, which is
   * the dominant public pattern (catalogue rows, supplier listings, results).
   */
  shape?: 'list' | 'detail' | 'market'
}

/**
 * Content-shaped page skeleton per `states.md`: the loading state mirrors the
 * layout it is replacing so nothing jumps when data arrives.
 */
export function AePageSkeleton({ title, description, shape = 'list' }: AePageSkeletonProps) {
  return (
    <AePublicPage>
      <div className="ae-rail grid gap-section py-section" aria-busy="true" aria-label={title}>
        <div className="grid gap-intra">
          {description === undefined ? null : (
            <p className="text-sm text-muted-foreground" role="status">
              {description}
            </p>
          )}
          <Skeleton className="h-10 w-full max-w-2xl" />
        </div>
        {shape === 'detail' ? <DetailSkeleton /> : shape === 'market' ? <MarketSkeleton /> : <ListSkeleton />}
      </div>
    </AePublicPage>
  )
}

function ListSkeleton() {
  return (
    <div className="grid gap-related" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-28 w-full" />
      ))}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="grid gap-section lg:grid-cols-[minmax(0,1fr)_20rem]" aria-hidden="true">
      <div className="grid content-start gap-section">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  )
}

function MarketSkeleton() {
  return (
    <div className="grid gap-related" aria-hidden="true">
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-related sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-touch w-full" />
        ))}
      </div>
      <div className="grid gap-related">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    </div>
  )
}
