'use client'

import { Button } from '@/components/arc/button/button'
import { EmptyState as ArcEmptyState } from '@/components/arc/empty-state/empty-state'

import type { AeEmptyStateProps } from './empty-state.contracts'
import styles from './empty-state.module.css'
import { useAeEmptyState } from './useAeEmptyState'

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
}: AeEmptyStateProps) {
  const { onActionWellClick, onRecipeSelect } = useAeEmptyState(actionFeedback)
  const className = compact ? `arc-market ${styles.root} ${styles.compact}` : `arc-market ${styles.root}`

  return (
    <ArcEmptyState
      title={title}
      description={description}
      action={(
        <div className={styles.actionArea} onClick={onActionWellClick}>
          {financialReassurance === undefined ? (
            <div className="min-h-5" aria-hidden="true" />
          ) : (
            <p className={`min-h-5 font-mono text-sm tabular-nums text-muted-foreground ${styles.reassurance}`}>
              {financialReassurance}
            </p>
          )}
          <div className={styles.actions}>
            {recipes?.map((recipe) => (
              <Button
                key={recipe.id}
                type="button"
                variant="secondary"
                size="sm"
                data-empty-recipe=""
                onClick={() => onRecipeSelect(recipe)}
              >
                {recipe.label}
              </Button>
            ))}
            {action}
          </div>
        </div>
      )}
      role={role ?? 'status'}
      icon={icon}
      className={className}
      titleAs={titleAs}
    />
  )
}
