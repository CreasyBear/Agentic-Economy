import { internalMutation } from './_generated/server'
import {
  armInteractiveCredentialExpiryArgs,
  armInteractiveCredentialExpiryResult,
  expireInteractiveCredentialArgs,
  expireInteractiveCredentialResult,
} from './lib/principalAccount/interactiveCredential/contracts'
import { armInteractiveCredentialExpiryHandler } from './lib/principalAccount/interactiveCredential/arm'
import { expireInteractiveCredentialHandler } from './lib/principalAccount/interactiveCredential/expire'

export const armInteractiveCredentialExpiry = internalMutation({
  args: armInteractiveCredentialExpiryArgs,
  returns: armInteractiveCredentialExpiryResult,
  handler: armInteractiveCredentialExpiryHandler,
})

export const expireInteractiveCredential = internalMutation({
  args: expireInteractiveCredentialArgs,
  returns: expireInteractiveCredentialResult,
  handler: expireInteractiveCredentialHandler,
})
