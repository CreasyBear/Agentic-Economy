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

export class ExposureOffsetRuleRegistry {
  readonly #resolvers = new Map<string, ExposureOffsetRuleResolver>()

  constructor(resolvers: readonly ExposureOffsetRuleResolver[] = []) {
    for (const resolver of resolvers) this.register(resolver)
  }

  register(resolver: ExposureOffsetRuleResolver) {
    const key = ruleKey(resolver.identity)
    if (
      resolver.identity.evidenceRuleRef.length === 0
      || resolver.identity.source.length === 0
      || resolver.identity.version.length === 0
      || this.#resolvers.has(key)
    ) throw new Error('exposure_offset_rule_registration_refused')
    this.#resolvers.set(key, resolver)
  }

  resolve(identity: ExposureOffsetRuleIdentity) {
    return this.#resolvers.get(ruleKey(identity))
  }
}

function ruleKey(identity: ExposureOffsetRuleIdentity) {
  return `${identity.evidenceRuleRef}\u0000${identity.source}\u0000${identity.version}`
}
