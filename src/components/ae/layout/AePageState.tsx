import type { ReactNode } from 'react'
import { FileQuestionIcon } from 'lucide-react'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import {
  getAeUiStatePresentation,
  type AeUiState,
  type AeUiStateTone,
} from '@/lib/ui/ui-state'
import './RouteLoadingComposition.css'
import './RouteRecoveryComposition.css'

type AePageStateProps = ({
  state: AeUiState
  title?: string
  description?: string
} | {
  state?: never
  title: string
  description: string
}) & {
  tone?: AeUiStateTone
  action?: ReactNode
  focusTitle?: boolean
}

function pageStateEyebrow(tone: AeUiStateTone): string | undefined {
  switch (tone) {
    case 'danger':
      return 'Error'
    case 'warning':
      return 'Notice'
    case 'positive':
      return 'Complete'
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
export function AePageState({ state, title, description, tone, action, focusTitle }: AePageStateProps) {
  const presentation = state === undefined ? undefined : getAeUiStatePresentation(state)
  const resolvedTitle = title ?? presentation?.title
  const resolvedDescription = description ?? presentation?.description
  const resolvedTone = tone ?? presentation?.tone ?? 'neutral'
  const role = presentation?.role ?? (resolvedTone === 'danger' ? 'alert' : 'status')
  if (resolvedTitle === undefined || resolvedDescription === undefined) {
    throw new Error('ae_page_state_copy_required')
  }
  const eyebrow = pageStateEyebrow(resolvedTone)

  return (
    <AePublicPage>
      <div className="arc-market arc-route-state" role={role} data-tone={resolvedTone}>
        <div className="arc-route-state-stage" aria-hidden="true"><FileQuestionIcon /></div>
        <AePageHeader
          title={resolvedTitle}
          description={resolvedDescription}
          {...(eyebrow === undefined ? {} : { eyebrow })}
          {...(action === undefined ? {} : { actions: action })}
          {...(focusTitle === true ? { focusTitle: true } : {})}
        />
      </div>
    </AePublicPage>
  )
}

type AePageSkeletonProps = {
  title: string
  description?: string
  /**
   * Content shape of the skeleton. Defaults to a list of three rows, which is
   * the dominant public pattern (catalogue rows, provider listings, results).
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
      <div className="arc-market arc-route-loading arc-public-loading ae-rail" aria-busy="true" aria-label={title}>
        <div className="arc-loading-intro">
          {description === undefined ? null : (
            <p className="text-sm text-muted-foreground" role="status">
              {description}
            </p>
          )}
          <span className="arc-loading-line arc-loading-heading" aria-hidden="true" />
        </div>
        {shape === 'detail' ? <DetailSkeleton /> : shape === 'market' ? <MarketSkeleton /> : <ListSkeleton />}
      </div>
    </AePublicPage>
  )
}

function ListSkeleton() {
  return (
    <div className="arc-loading-rows" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="arc-loading-record">
          <span className="arc-loading-line arc-loading-label" />
          <span className="arc-loading-line" />
        </div>
      ))}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="arc-loading-detail" aria-hidden="true">
      <div className="arc-loading-stack">
        <div className="arc-loading-pane"><span className="arc-loading-line arc-loading-heading" /><span className="arc-loading-line" /></div>
        <div className="arc-loading-well" />
        <div className="arc-loading-pane"><span className="arc-loading-line arc-loading-label" /><span className="arc-loading-line" /></div>
      </div>
      <div className="arc-loading-pane"><span className="arc-loading-line arc-loading-label" /><span className="arc-loading-line" /><span className="arc-loading-line arc-loading-field" /></div>
    </div>
  )
}

function MarketSkeleton() {
  return (
    <div className="arc-loading-stack" aria-hidden="true">
      <span className="arc-loading-line arc-loading-field" />
      <div className="arc-loading-metrics">
        {Array.from({ length: 3 }, (_, index) => (
          <span key={index} className="arc-loading-line arc-loading-field" />
        ))}
      </div>
      <div className="arc-loading-rows">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="arc-loading-record"><span className="arc-loading-line arc-loading-label" /><span className="arc-loading-line" /></div>
        ))}
      </div>
    </div>
  )
}
