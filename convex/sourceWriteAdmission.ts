import { internalMutation } from './_generated/server'
import {
  cleanupExpiredSourceWriteNoncesArgs,
  cleanupExpiredSourceWriteNoncesResult,
  cleanupExpiredSourceWriteNoncesHandler,
} from './lib/security/sourceWrite/cleanup'

export const cleanupExpiredSourceWriteNonces = internalMutation({
  args: cleanupExpiredSourceWriteNoncesArgs,
  returns: cleanupExpiredSourceWriteNoncesResult,
  handler: cleanupExpiredSourceWriteNoncesHandler,
})
