import type { PreparationDisclosureStore } from './preparation-authority'
import type { StructuredQuotePreparationStore } from '@/modules/routing-kernel/structured-quote-preparation-store'

export type PreparedOptionInspection = Readonly<{
  kind: 'option_evidence'
  business: Readonly<{ name: string }>
  price: Readonly<{
    currency: string
    expectedAmountMinor: number
    maximumAmountMinor: number
    components: readonly Readonly<{ label: string; amountMinor: number }>[]
  }>
  comparableOutputs: readonly Readonly<{ label: string; value: string | number | boolean }>[]
  materialTerms: readonly string[]
  cancellation: Readonly<{ kind: 'supported' | 'conditional' | 'unsupported'; summary: string }>
  dataUse: Readonly<{
    categories: readonly string[]
    purpose: string
    status: 'released' | 'uncertain'
  }>
  issuedAt: number
  expiresAt: number
}>

export async function resolvePreparedOptionInspection(
  input: Readonly<{ inspectionRef: string; requestId: string; planRevisionId: string; actionId: string }>,
  dependencies: Readonly<{
    structuredStore: StructuredQuotePreparationStore
    disclosureStore: PreparationDisclosureStore
    outputLabels: Readonly<Record<string, string>>
  }>,
): Promise<PreparedOptionInspection | Readonly<{ kind: 'not_found' }>> {
  const match = /^evidence_([a-f0-9]{64})$/.exec(input.inspectionRef)
  if (match?.[1] === undefined) return { kind: 'not_found' }
  const offer = await dependencies.structuredStore.getProviderOfferByDigest(`sha256:${match[1]}`)
  if (offer === undefined) return { kind: 'not_found' }
  const candidateSet = await dependencies.structuredStore.getCandidateSetByDigest(offer.candidateSetDigest)
  if (candidateSet === undefined || candidateSet.customerRequestId !== input.requestId
    || candidateSet.planRevisionId !== input.planRevisionId || candidateSet.actionId !== input.actionId) return { kind: 'not_found' }
  const candidate = candidateSet.candidates.find((item) => item.bindingId === offer.issuerBindingId)
  const attempt = await dependencies.structuredStore.getQuoteAttempt(offer.quoteAttemptId)
  if (candidate === undefined || attempt?.disposition !== 'quoted' || attempt.offer.offerDigest !== offer.offerDigest) return { kind: 'not_found' }
  const allocation = await dependencies.disclosureStore.get(attempt.command.allocationId)
  if (allocation === undefined || allocation.requestId !== input.requestId || allocation.planRevisionId !== input.planRevisionId
    || allocation.actionId !== input.actionId || (allocation.disposition !== 'released' && allocation.disposition !== 'uncertain')) {
    return { kind: 'not_found' }
  }
  return Object.freeze({
    kind: 'option_evidence', business: { name: candidate.recipientName },
    price: {
      currency: offer.expectedCost.currency, expectedAmountMinor: offer.expectedCost.amountMinor,
      maximumAmountMinor: offer.maximumCost.amountMinor, components: offer.priceComponents.map((component) => ({ ...component })),
    },
    comparableOutputs: offer.offerOutputs.map((output) => ({
      label: dependencies.outputLabels[output.field] ?? 'Registered comparison detail', value: output.value,
    })),
    materialTerms: [...offer.materialTerms], cancellation: { ...offer.cancellation },
    dataUse: {
      categories: allocation.fieldCategories.map((category) => category.label), purpose: allocation.purposeLabel,
      status: allocation.disposition,
    },
    issuedAt: offer.issuedAt, expiresAt: offer.expiresAt,
  })
}
