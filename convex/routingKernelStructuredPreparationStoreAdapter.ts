import type { StructuredQuotePreparationStore } from '@/modules/routing-kernel/structured-quote-preparation-store'

import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'

type Context = Pick<ActionCtx, 'runQuery' | 'runMutation'>

export function createConvexStructuredQuotePreparationStore(ctx: Context): StructuredQuotePreparationStore {
  return Object.freeze({
    putCandidateSet: async (candidateSet) => await ctx.runMutation(internal.routingKernelStructuredPreparation.putCandidateSet, {
      candidateSet: {
        ...candidateSet,
        candidates: candidateSet.candidates.map((candidate) => {
          const { commercialRelationship, ...candidateWithoutRelationship } = candidate
          return {
            ...candidateWithoutRelationship,
            ...(commercialRelationship === undefined ? {} : { commercialRelationship: {
              ...commercialRelationship, evidenceRefs: [...commercialRelationship.evidenceRefs],
            } }),
          }
        }),
      },
    }),
    getCandidateSet: async (preparationRequestId) => await ctx.runQuery(
      internal.routingKernelStructuredPreparation.getCandidateSet, { preparationRequestId },
    ) ?? undefined,
    getCandidateSetByDigest: async (candidateSetDigest) => await ctx.runQuery(
      internal.routingKernelStructuredPreparation.getCandidateSetByDigest, { candidateSetDigest },
    ) ?? undefined,
    claimQuoteAttempt: async (command) => await ctx.runMutation(internal.routingKernelStructuredPreparation.claimQuoteAttempt, {
      command: { ...command, recipient: { ...command.recipient }, fieldNames: [...command.fieldNames] },
    }),
    getQuoteAttempt: async (quoteAttemptId) => await ctx.runQuery(
      internal.routingKernelStructuredPreparation.getQuoteAttempt, { quoteAttemptId },
    ) ?? undefined,
    markDispatched: async (input) => await ctx.runMutation(internal.routingKernelStructuredPreparation.markDispatched, input),
    resolveQuoteAttempt: async (resolution) => await ctx.runMutation(
      internal.routingKernelStructuredPreparation.resolveQuoteAttempt,
      {
        resolution: resolution.disposition === 'quoted'
          ? {
              ...resolution,
              offer: {
                ...resolution.offer, expectedCost: { ...resolution.offer.expectedCost }, maximumCost: { ...resolution.offer.maximumCost },
                executionDataFields: [...resolution.offer.executionDataFields], materialTerms: [...resolution.offer.materialTerms],
                offerOutputs: resolution.offer.offerOutputs.map((output) => ({ ...output })),
                priceComponents: resolution.offer.priceComponents.map((component) => ({ ...component })),
                cancellation: { ...resolution.offer.cancellation },
              },
            }
          : { ...resolution },
      },
    ),
    recordCandidateCoverage: async (coverage) => await ctx.runMutation(
      internal.routingKernelStructuredPreparation.recordCandidateCoverage, { coverage },
    ),
    listCandidateCoverage: async (candidateSetDigest) => await ctx.runQuery(
      internal.routingKernelStructuredPreparation.listCandidateCoverage, { candidateSetDigest },
    ),
    getProviderOffer: async (providerOfferId) => await ctx.runQuery(
      internal.routingKernelStructuredPreparation.getProviderOffer, { providerOfferId },
    ) ?? undefined,
    getProviderOfferByDigest: async (offerDigest) => await ctx.runQuery(
      internal.routingKernelStructuredPreparation.getProviderOfferByDigest, { offerDigest },
    ) ?? undefined,
    resolveProviderOfferAffinity: async (input) => await ctx.runQuery(
      internal.routingKernelStructuredPreparation.resolveProviderOfferAffinity, { input },
    ),
  })
}
