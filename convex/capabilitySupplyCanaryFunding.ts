import { internalMutation, internalQuery } from './_generated/server'
import {
  PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC,
  PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC,
  PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
} from './lib/capabilitySupply/canaryFunding/constants'
import {
  PRODUCTION_SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
  PRODUCTION_SELLER_ONBOARDING_CANARY_RATE_POLICY_REF,
  SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
  SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
  SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID,
  SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID,
  SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
  SELLER_ONBOARDING_CANARY_RATE_POLICY_REF,
  sellerOnboardingCanaryPlatformGrantExpectation,
  type SellerOnboardingCanaryPlatformGrantExpectation,
} from './lib/capabilitySupply/canaryFunding/identity'
import {
  provisionProductionSellerOnboardingCanaryFundingHandler,
  provisionSellerOnboardingCanaryFundingHandler,
} from './lib/capabilitySupply/canaryFunding/provision'
import {
  readExactSellerOnboardingCanaryPlatformGrantHandler,
  readProductionSellerOnboardingCanaryFundingReadinessHandler,
  readSellerOnboardingCanaryFundingReadinessHandler,
} from './lib/capabilitySupply/canaryFunding/reads'
import {
  exactPlatformGrantArgs,
  exactPlatformGrantResult,
  productionProvisionArgs,
  productionProvisionResult,
  productionReadinessArgs,
  productionReadinessResult,
  provisionResult,
  readinessResult,
  sandboxProvisionArgs,
  sandboxReadinessArgs,
} from './lib/capabilitySupply/canaryFunding/contracts'

export type {
  SellerOnboardingCanaryCdpPreflightCode,
  SellerOnboardingCanaryCdpPreflightResult,
} from './capabilitySupplyCanaryFundingPreflight'

export const SELLER_ONBOARDING_CANARY_CDP_PREFLIGHT_ACTION =
  'capabilitySupplyCanaryFundingPreflight:readSellerOnboardingCanaryCdpReadiness' as const

export {
  SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC,
  SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC,
  PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_PER_CALL_ATOMIC,
  PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_DAILY_ATOMIC,
  PRODUCTION_SELLER_ONBOARDING_CANARY_MAXIMUM_MONTHLY_ATOMIC,
  SELLER_ONBOARDING_CANARY_PLATFORM_GRANT_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
  SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
  SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID,
  SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID,
  SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
  SELLER_ONBOARDING_CANARY_RATE_POLICY_REF,
  SELLER_ONBOARDING_CANARY_GRANT_GENERATION,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_APPLICATION_REF,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_PRINCIPAL_ID,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_OWNER_ID,
  PRODUCTION_SELLER_ONBOARDING_CANARY_PLATFORM_CREDENTIAL_ID,
  PRODUCTION_SELLER_ONBOARDING_CANARY_BUDGET_POLICY_REF,
  PRODUCTION_SELLER_ONBOARDING_CANARY_RATE_POLICY_REF,
  sellerOnboardingCanaryPlatformGrantExpectation,
}

export type { SellerOnboardingCanaryPlatformGrantExpectation }

export { readExactSellerOnboardingCanaryPlatformGrantHandler }

export const readExactSellerOnboardingCanaryPlatformGrant = internalQuery({
  args: exactPlatformGrantArgs,
  returns: exactPlatformGrantResult,
  handler: readExactSellerOnboardingCanaryPlatformGrantHandler,
})

export const provisionProductionSellerOnboardingCanaryFunding = internalMutation({
  args: productionProvisionArgs,
  returns: productionProvisionResult,
  handler: provisionProductionSellerOnboardingCanaryFundingHandler,
})

export const provisionSellerOnboardingCanaryFunding = internalMutation({
  args: sandboxProvisionArgs,
  returns: provisionResult,
  handler: provisionSellerOnboardingCanaryFundingHandler,
})

export const readSellerOnboardingCanaryFundingReadiness = internalQuery({
  args: sandboxReadinessArgs,
  returns: readinessResult,
  handler: readSellerOnboardingCanaryFundingReadinessHandler,
})

export const readProductionSellerOnboardingCanaryFundingReadiness = internalQuery({
  args: productionReadinessArgs,
  returns: productionReadinessResult,
  handler: readProductionSellerOnboardingCanaryFundingReadinessHandler,
})
