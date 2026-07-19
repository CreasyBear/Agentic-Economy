export type ExposureOffsetRuleIdentity = Readonly<{
  evidenceRuleRef: string
  source: string
  version: string
}>

export type ExposureOffsetRuleMaterial = Readonly<{
  authorityUseRef: string
  offsetAuthorityUseRef: string
  mandateRef: string
  mandateVersion: number
  mandateGeneration: number
  principalRef: string
  providerRef: string
  exposureAction: Readonly<{ id: string; version: string }>
  offsetAction: Readonly<{ id: string; version: string }>
  exposureSubjectRef: string
  exposureResultRef: string
  exposureEvidenceRef: string
  offsetSubjectRef: string
  offsetResultRef: string
  offsetEvidenceRef: string
  amountMinor: number
  currency: string
  evidenceRuleRef: string
  evidenceRuleSource: string
  evidenceRuleVersion: string
  offsetGeneration: 1
  recordedAt: string
}>

export type ExposureOffsetRuleResolver = Readonly<{
  identity: ExposureOffsetRuleIdentity
  resolve: (material: ExposureOffsetRuleMaterial) => boolean
}>

declare const trustedExposureOffsetRules: unique symbol

export type TrustedExposureOffsetRuleCapability = Readonly<{
  [trustedExposureOffsetRules]: true
}>

const trustedCapabilities = new WeakSet<object>()
const resolversByCapability = new WeakMap<object, ReadonlyMap<string, ExposureOffsetRuleResolver>>()

/**
 * Source-composition seam. Deliberately absent from the action-invocation public
 * index: invocation callers cannot mint or submit this capability.
 */
export function sealSourceOwnedExposureOffsetRules(
  resolvers: readonly ExposureOffsetRuleResolver[],
): TrustedExposureOffsetRuleCapability {
  const indexed = new Map<string, ExposureOffsetRuleResolver>()
  for (const resolver of resolvers) {
    const key = ruleKey(resolver.identity)
    if (
      resolver.identity.evidenceRuleRef.length === 0
      || resolver.identity.source.length === 0
      || resolver.identity.version.length === 0
      || indexed.has(key)
    ) throw new Error('exposure_offset_rule_registration_refused')
    indexed.set(key, resolver)
  }
  const capability = Object.freeze({}) as TrustedExposureOffsetRuleCapability
  trustedCapabilities.add(capability)
  resolversByCapability.set(capability, indexed)
  return capability
}

export function resolveTrustedExposureOffsetRule(
  capability: TrustedExposureOffsetRuleCapability | undefined,
  identity: ExposureOffsetRuleIdentity,
  material: ExposureOffsetRuleMaterial,
) {
  if (capability === undefined || !trustedCapabilities.has(capability)) return false
  return resolversByCapability.get(capability)?.get(ruleKey(identity))?.resolve(material) === true
}

function ruleKey(identity: ExposureOffsetRuleIdentity) {
  return `${identity.evidenceRuleRef}\u0000${identity.source}\u0000${identity.version}`
}
