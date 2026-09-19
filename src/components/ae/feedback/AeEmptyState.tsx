import { Inbox } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const TACTILE =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export type AeEmptyStateRecipe = Readonly<{
  readonly id: string
  readonly label: string
  readonly onSelect: () => void
}>

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
}) {
  const resolvedRole = role ?? 'status'

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
      className={cn(
        'grid place-content-center justify-items-center gap-related py-page text-center',
        compact ? undefined : 'min-h-64',
      )}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-16 items-center justify-center rounded-md border border-border text-muted-foreground [&_svg]:size-8"
      >
        {icon ?? <Inbox aria-hidden="true" />}
      </span>
      <div className="grid max-w-md gap-intra">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="text-pretty text-sm text-muted-foreground">{description}</p>
      </div>
      {financialReassurance === undefined ? (
        <div className="min-h-5" aria-hidden="true" />
      ) : (
        <p className="min-h-5 font-mono text-sm tabular-nums text-muted-foreground">
          {financialReassurance}
        </p>
      )}
      <div
        className="flex min-h-touch flex-wrap items-center justify-center gap-intra"
        onClick={handleActionWellClick}
      >
        {recipes?.map((recipe) => (
          <Button
            key={recipe.id}
            type="button"
            variant="outline"
            size="sm"
            data-empty-recipe=""
            className={TACTILE}
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
