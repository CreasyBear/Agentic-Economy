import type { MouseEvent, ReactNode } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/arc/button/button'
import { INBOX_PATHS, INBOX_VIEW } from '@/components/arc/empty-states/empty-states-art'
import './EmptyStateComposition.css'

export const TACTILE =
  'enabled:active:scale-[0.98] transition-transform duration-fast ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export type AeEmptyStateRecipe = Readonly<{
  readonly id: string
  readonly label: string
  readonly onSelect: () => void
}>

// Requires authoritative copy/actions. Ensures the empty state never invents activity or success.
// Existing callback/toast behavior stays caller-owned; Arc's sample scene switch/timers are omitted.

export function AeEmptyState({
  title,
  description,
  action,
  role,
  icon,
  recipes,
  financialReassurance,
  actionFeedback,
  compact = false,
  titleAs = 'h2',
}: {
  title: string
  description: string
  action?: ReactNode
  role?: 'status' | 'alert'
  icon?: ReactNode
  recipes?: readonly AeEmptyStateRecipe[]
  financialReassurance?: string
  actionFeedback?: string
  compact?: boolean
  titleAs?: 'h2' | 'p'
}) {
  const resolvedRole = role ?? 'status'
  const TitleTag = titleAs

  function runRecipe(recipe: AeEmptyStateRecipe) {
    recipe.onSelect()
    if (actionFeedback !== undefined) {
      toast.success(actionFeedback)
    }
  }

  function handleActionWellClick(event: MouseEvent<HTMLDivElement>) {
    if (actionFeedback === undefined) {
      return
    }
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }
    if (target.closest('[data-empty-recipe]') !== null) {
      return
    }
    if (target.closest('button,a,[role="button"]') === null) {
      return
    }
    toast.success(actionFeedback)
  }

  return (
    <div
      role={resolvedRole}
      className="arc-market arc-empty-state"
      data-compact={compact || undefined}
    >
      {icon === undefined ? (
        <div className="arc-empty-stage" aria-hidden="true">
          <svg className="arc-empty-art" viewBox={`0 0 ${INBOX_VIEW.width} ${INBOX_VIEW.height}`} focusable="false">
            {INBOX_PATHS.map((path, index) => <path key={index} className="arc-empty-shape"
              data-kind={path.kind} data-tone={path.tone} d={path.d} opacity={path.opacity} strokeDasharray={path.dash} />)}
          </svg>
        </div>
      ) : <span className="arc-empty-icon" aria-hidden="true">{icon}</span>}
      <div className="arc-empty-copy">
        <TitleTag className="arc-empty-title">{title}</TitleTag>
        <p className="arc-empty-description">{description}</p>
      </div>
      {financialReassurance === undefined ? (
        <div className="min-h-5" aria-hidden="true" />
      ) : (
        <p className="min-h-5 font-mono text-sm tabular-nums text-muted-foreground">
          {financialReassurance}
        </p>
      )}
      <div
        className="arc-empty-actions"
        onClick={handleActionWellClick}
      >
        {recipes?.map((recipe) => (
          <Button
            key={recipe.id}
            type="button"
            variant="secondary"
            size="sm"
            data-empty-recipe=""
            onClick={() => runRecipe(recipe)}
          >
            {recipe.label}
          </Button>
        ))}
        {action}
      </div>
    </div>
  )
}
