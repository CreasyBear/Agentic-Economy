'use client'

import { useCallback } from 'react'
import type { MouseEvent } from 'react'
import { toast } from 'sonner'

import type { AeEmptyStateRecipe } from './empty-state.contracts'

export function useAeEmptyState(actionFeedback: string | undefined) {
  const onRecipeSelect = useCallback((recipe: AeEmptyStateRecipe) => {
    recipe.onSelect()
    if (actionFeedback !== undefined) {
      toast.success(actionFeedback)
    }
  }, [actionFeedback])

  const onActionWellClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
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
  }, [actionFeedback])

  return { onActionWellClick, onRecipeSelect }
}
