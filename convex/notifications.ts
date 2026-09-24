import { mutation, query } from './_generated/server'
import {
  readPreferencesArgs,
  readPreferencesHandler,
  readPreferencesResult,
  updatePreferencesArgs,
  updatePreferencesHandler,
  updatePreferencesResult,
} from './lib/principalAccount/notifications/preferences'

export const readPreferences = query({
  args: readPreferencesArgs,
  returns: readPreferencesResult,
  handler: readPreferencesHandler,
})

export const updatePreferences = mutation({
  args: updatePreferencesArgs,
  returns: updatePreferencesResult,
  handler: updatePreferencesHandler,
})
