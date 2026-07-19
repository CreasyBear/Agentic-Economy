import {
  sealSourceOwnedExposureOffsetRules,
  type ExposureOffsetRuleResolver,
} from '@/modules/action-invocation/exposure-offset-rules'

export function createTrustedExposureOffsetRuleTestCapability(
  resolvers: readonly ExposureOffsetRuleResolver[],
) {
  return sealSourceOwnedExposureOffsetRules(resolvers)
}
