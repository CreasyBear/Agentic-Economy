import { createServerFn } from '@tanstack/react-start'
import {
  savedToolRemoveInputSchema, savedToolSaveInputSchema,
  type SavedToolRemoveResult, type SavedToolSaveResult, type SavedToolsListResult,
} from './saved-tools.contracts'
// Keep server-only source code inside handlers: this module is imported by browser components.

/** Convex derives the account from the signed-in session and rechecks current authority. */
export const listSavedToolsForOwner = createServerFn({ method: 'GET' })
  .handler(async (): Promise<SavedToolsListResult> => {
    const { listSavedToolsOwner } = await import('@/lib/server/saved-tools-api')
    return await listSavedToolsOwner()
  })

export const saveToolForOwner = createServerFn({ method: 'POST' })
  .validator(data => savedToolSaveInputSchema.parse(data))
  .handler(async ({ data }): Promise<SavedToolSaveResult> => {
    const { saveSavedToolOwner } = await import('@/lib/server/saved-tools-api')
    return await saveSavedToolOwner(data)
  })

export const removeToolForOwner = createServerFn({ method: 'POST' })
  .validator(data => savedToolRemoveInputSchema.parse(data))
  .handler(async ({ data }): Promise<SavedToolRemoveResult> => {
    const { removeSavedToolOwner } = await import('@/lib/server/saved-tools-api')
    return await removeSavedToolOwner(data)
  })
