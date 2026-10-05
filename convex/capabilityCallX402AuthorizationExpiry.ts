import { internalMutation } from './usageTrackedMutation'
import {
  queueExpiredX402AuthorizationArgs,
  queueExpiredX402AuthorizationHandler,
  queueExpiredX402AuthorizationResult,
} from './lib/capabilityExecution/x402AuthorizationExpiry/queueExpired'

export const queueExpiredX402Authorization = internalMutation({
  args: queueExpiredX402AuthorizationArgs,
  returns: queueExpiredX402AuthorizationResult,
  handler: queueExpiredX402AuthorizationHandler,
})
