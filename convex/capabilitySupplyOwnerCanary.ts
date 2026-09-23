import { v } from 'convex/values'

import { internalMutation, internalQuery } from './_generated/server'
import {
  requestSellerOnboardingCanaryForAdmittedPublicationHandler,
  requestSellerOnboardingCanaryHandler,
} from './lib/capabilitySupply/ownerCanaryAdmission'
import { readSellerOnboardingCanaryEvidenceHandler } from './lib/capabilitySupply/ownerCanaryEvidence'
import {
  requestSellerOnboardingCanaryArgs,
  requestSellerOnboardingCanaryResult,
  sellerOnboardingCanaryEvidenceValue,
} from './lib/capabilitySupply/ownerCanaryValues'

export const requestSellerOnboardingCanary = internalMutation({
  args: requestSellerOnboardingCanaryArgs,
  returns: requestSellerOnboardingCanaryResult,
  handler: requestSellerOnboardingCanaryHandler,
})

export const requestSellerOnboardingCanaryForAdmittedPublication = internalMutation({
  args: {
    publicationRef: v.string(),
    publicationRevision: v.number(),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: requestSellerOnboardingCanaryResult,
  handler: requestSellerOnboardingCanaryForAdmittedPublicationHandler,
})

export const readSellerOnboardingCanaryEvidence = internalQuery({
  args: { canaryRef: v.string() },
  returns: sellerOnboardingCanaryEvidenceValue,
  handler: readSellerOnboardingCanaryEvidenceHandler,
})
