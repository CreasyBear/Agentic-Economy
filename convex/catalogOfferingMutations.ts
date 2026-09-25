import { internalMutation } from './_generated/server'
import { promoteAdmittedSellerCanaryArgs, promoteAdmittedSellerCanaryResult } from './lib/catalog/sellerCanary/contracts'
import { promoteAdmittedSellerCanaryHandler } from './lib/catalog/sellerCanary/promote'

export const promoteAdmittedSellerCanary = internalMutation({
  args: promoteAdmittedSellerCanaryArgs,
  returns: promoteAdmittedSellerCanaryResult,
  handler: promoteAdmittedSellerCanaryHandler,
})
