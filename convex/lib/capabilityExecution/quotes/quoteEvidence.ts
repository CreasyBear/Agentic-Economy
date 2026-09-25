import type { PublishedTool } from '@/modules/capability-supply/public'
import type { JsonValue } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { SpendingPeriods } from '@/modules/money/public'
import type { LiveX402Requirement } from '@/modules/capability-execution/live-x402-requirement'
import type { FormanceQuoteSnapshot } from './quoteValuation'

export function quoteEvidenceMaterial(
  input: Readonly<{
    now: number
    correlationId: string
    authority: Readonly<{
      principal: Readonly<{
        principalId: string
        ownerId: string
        credentialId: string
      }>
      grantRef: string
      grantGeneration: number
      policyDigest: string
    }>
    operation: PublishedTool
    toolRef: string
    currentDigest: string
    normalizedInput: Record<string, JsonValue>
    inputDigest: string
    pricing: Readonly<{
      price: { units: string }
      sourceRequirement?: { units: string }
      rateEvidence?: { evidenceDigest: string }
      config: unknown
    }>
    liveX402Requirement?: LiveX402Requirement | undefined
    grantReadback: Readonly<{
      budget: Readonly<{
        budgetPolicyRef: string
        generation: number
      }>
    }>
    maximumPerCallUnits: string
    formance: FormanceQuoteSnapshot
    buyerSale: Readonly<{ revenueUnits: string; taxUnits: string }>
    spendingPeriods?: SpendingPeriods | undefined
    treasury?: FormanceQuoteSnapshot['treasury'] | undefined
    commercialPolicyDigest: string
    expiresAt: number
  }>,
): Readonly<{ evidenceMaterial: Record<string, unknown>; evidenceDigest: string; quoteRef: string }> {
  const evidenceMaterial = {
    format: 'ae.operation-commitment:v1',
    principalId: input.authority.principal.principalId,
    accountRef: input.authority.principal.ownerId,
    credentialId: input.authority.principal.credentialId,
    grantRef: input.authority.grantRef,
    grantGeneration: input.authority.grantGeneration,
    grantPolicyDigest: input.authority.policyDigest,
    operationRef: input.toolRef,
    operationRevision: input.operation.identity.publicationRevision,
    operationMaterialDigest: input.operation.materialDigest,
    currentOperationDigest: input.currentDigest,
    inputDigest: input.inputDigest,
    pricingDigest: input.operation.priceDigest,
    decisionAudUnits: input.pricing.price.units,
    ...(input.pricing.sourceRequirement === undefined ? {} : { sourceUsdcUnits: input.pricing.sourceRequirement.units }),
    ...(input.liveX402Requirement === undefined ? {} : {
      x402RequirementDigest: input.liveX402Requirement.requirementDigest,
      x402RequirementObservedAt: input.liveX402Requirement.observedAt,
      x402PaymentRequiredJson: input.liveX402Requirement.paymentRequiredJson,
    }),
    ...(input.pricing.rateEvidence === undefined ? {} : { rateEvidenceDigest: input.pricing.rateEvidence.evidenceDigest }),
    budgetPolicyRef: input.grantReadback.budget.budgetPolicyRef,
    budgetGeneration: input.grantReadback.budget.generation,
    maximumSpendPerInvocationUnits: input.maximumPerCallUnits,
    formanceSchemaVersion: input.formance.formanceSchemaVersion,
    legalCustomerRef: input.formance.legalCustomerRef,
    legalCustomerGeneration: input.formance.legalCustomerGeneration,
    buyerRevenueUnits: input.buyerSale.revenueUnits,
    buyerTaxUnits: input.buyerSale.taxUnits,
    accountAvailableUnits: input.formance.accountAvailableUnits,
    budgetAvailableUnits: input.formance.budgetAvailableUnits,
    legalExposureAvailableUnits: input.formance.legalExposureAvailableUnits,
    ...(input.spendingPeriods === undefined ? {} : {
      spendingPeriods: input.spendingPeriods,
      dailyPeriodAvailableUnits: input.formance.dailyPeriodAvailableUnits,
      monthlyPeriodAvailableUnits: input.formance.monthlyPeriodAvailableUnits,
    }),
    ...(input.treasury === undefined ? {} : {
      treasuryCustodyRef: input.treasury.custodyRef,
      treasuryCustodyGeneration: input.treasury.custodyGeneration,
      treasuryEvidenceRef: input.treasury.evidenceRef,
      treasurySpendableUnits: input.treasury.availableUnits,
    }),
    commercialPolicyDigest: input.commercialPolicyDigest,
    expiresAt: input.expiresAt,
  }
  const evidenceDigest = canonicalDigest(evidenceMaterial as never)
  const quoteRef = `operation-commitment:v1:${canonicalDigest({
    ...evidenceMaterial,
    createdAt: input.now,
    correlationId: input.correlationId,
  }).slice(7)}`
  return { evidenceMaterial, evidenceDigest, quoteRef }
}
