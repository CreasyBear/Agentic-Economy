import { customCtx, customMutation } from 'convex-helpers/server/customFunctions'
import { mutation as rawMutation, internalMutation as rawInternalMutation } from './_generated/server'
import { usageSourceTriggers } from './lib/capabilityExecution/serviceUsage/sourceVersions'

// Selected source-writing registrations retain their exact args, returns and
// authority handlers. SDK triggers add atomic report invalidation only.
export const mutation = customMutation(rawMutation,customCtx(usageSourceTriggers.wrapDB))
export const internalMutation = customMutation(rawInternalMutation,customCtx(usageSourceTriggers.wrapDB))
