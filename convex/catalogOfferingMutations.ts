import { internalMutation } from './_generated/server'
import {
  promoteAdmittedSellerCanaryArgs,
  promoteAdmittedSellerCanaryHandler,
  promoteAdmittedSellerCanaryResult,
} from './lib/catalog/sellerCanary'

export const promoteAdmittedSellerCanary = internalMutation({
  args: promoteAdmittedSellerCanaryArgs,
  returns: promoteAdmittedSellerCanaryResult,
  handler: promoteAdmittedSellerCanaryHandler,
})
