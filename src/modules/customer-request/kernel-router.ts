import type { NeutralRoutingKernel, RouteQuote } from '@/modules/routing-kernel/application'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { CustomerRequestActionRouter, PreparedRouteCandidate, PreparedRouteCandidateSet } from './preparation'

export type CustomerRequestBindingPresentation = Readonly<{
  bindingId: string
  nodeId: string
  businessName: string
  cancellation: Readonly<{ kind: 'supported' | 'conditional' | 'unsupported'; summary: string }>
}>

export type CustomerRequestBindingPresentationDirectory = Readonly<{
  resolve: (bindingIds: readonly string[]) => Promise<readonly CustomerRequestBindingPresentation[]>
}>

export function createKernelCustomerRequestActionRouter(
  kernel: NeutralRoutingKernel,
  directory: CustomerRequestBindingPresentationDirectory,
): CustomerRequestActionRouter {
  return Object.freeze({
    route: async (input) => {
      const hasStructuredPreparationDisclosure = Object.values(input.contract.input)
        .some((field) => field.disclosure?.phase === 'preparation')
      if (hasStructuredPreparationDisclosure) {
        if (input.releasePreparationData === undefined) {
          return { kind: 'no_route' as const, reason: 'preparation_authority_required' }
        }
        const protectedFieldNames = Object.entries(input.contract.input)
          .filter(([, field]) => field.disclosure?.phase === 'preparation')
          .map(([field]) => field)
          .sort()
        const purpose = input.contract.preparation?.purpose
        if (purpose === undefined || protectedFieldNames.some((field) => !input.contract.input[field]?.disclosure?.purposes.includes(purpose))) {
          return { kind: 'no_route' as const, reason: 'preparation_purpose_not_composable' }
        }
        const prepared = await kernel.operations.prepareStructuredQuotes({
          preparationRequestId: input.routingRequestId,
          customerRequestId: input.request.requestId,
          planRevisionId: input.planRevisionId,
          actionId: input.action.actionId,
          generation: input.preparationGeneration,
          networkId: input.request.routing.networkId,
          caller: { principalId: input.request.principalId, agentId: input.request.delegatedAgentId },
          capabilityContractId: input.action.capabilityContractId,
          capabilityContractVersion: capabilityVersion(input.action.capabilityContractId),
          currency: input.request.routing.currency,
          maximumSpendMinor: input.request.routing.maximumSpendMinor,
          purpose,
          protectedFieldNames,
          allowedExecutionDataFields: Object.entries(input.contract.input)
            .filter(([, field]) => field.disclosure?.phase === 'execution')
            .map(([field]) => field)
            .sort(),
          requiredOfferOutputs: Object.entries(input.contract.output)
            .filter(([, field]) => field.required && field.decisionRelevance === 'option_selection'
              && field.valueType !== 'provider_offer_ref')
            .map(([field, definition]) => ({
              field, valueType: definition.valueType as 'string' | 'integer' | 'boolean' | 'url' | 'money_minor',
            }))
            .sort((left, right) => left.field.localeCompare(right.field)),
          resolveCandidatePresentation: async ({ bindingId, nodeId }) => {
            const [presentation] = await directory.resolve([bindingId])
            if (presentation === undefined || presentation.nodeId !== nodeId) return undefined
            return {
              recipientName: presentation.businessName,
              presentationEvidenceDigest: customerPresentationDigest(presentation),
            }
          },
          ...(input.reconcilePreparationData === undefined ? {} : {
            reconcileCandidateRelease: input.reconcilePreparationData,
          }),
          releaseForCandidate: async (release) => {
            const result = await input.releasePreparationData!({
              releaseKey: release.releaseKey,
              recipient: {
                nodeId: release.recipient.nodeId,
                bindingId: release.recipient.bindingId,
                name: release.recipient.name,
                kind: 'candidate_provider',
              },
              purpose: release.purpose,
              purposeLabel: input.contract.preparation!.customerLabel,
              fields: release.fields,
              release: release.release,
            })
            return result.kind === 'released'
              ? result
              : result.kind === 'uncertain'
                ? { kind: result.kind, allocationId: result.allocationId, nextAction: result.nextAction }
                : { kind: result.kind, reason: result.reason, nextAction: result.nextAction }
          },
        })
        if (prepared.kind === 'insufficient_options') return { kind: 'no_route' as const, reason: prepared.reason }
        if (prepared.kind === 'preparation_pending') return {
          kind: 'preparation_pending' as const, inspectionRef: customerReference('options', prepared.candidateSetDigest),
        }
        return {
          kind: 'candidate_set' as const,
          candidateSet: await projectStructuredCandidates(prepared, input.contract),
        }
      }
      const routed = await kernel.operations.route({
        routingRequestId: input.routingRequestId,
        networkId: input.request.routing.networkId,
        caller: { principalId: input.request.principalId, agentId: input.request.delegatedAgentId },
        query: input.action.capabilityContractId,
        constraints: {
          currency: input.request.routing.currency,
          maximumSpendMinor: input.request.routing.maximumSpendMinor,
          optimizeFor: input.request.routing.optimizeFor,
        },
      })
      if (routed.kind !== 'quoted') return routed
      if (routed.quote.selectedGraph.capabilityContractId !== input.action.capabilityContractId) {
        return { kind: 'no_route' as const, reason: 'capability_contract_mismatch' }
      }
      return {
        kind: 'quoted' as const,
        quote: await projectKernelQuote(routed.quote, directory),
      }
    },
  })
}

function customerPresentationDigest(presentation: CustomerRequestBindingPresentation): string {
  return canonicalDigest({
    bindingId: presentation.bindingId, nodeId: presentation.nodeId, businessName: presentation.businessName,
  })
}

async function projectStructuredCandidates(
  prepared: Extract<Awaited<ReturnType<NeutralRoutingKernel['operations']['prepareStructuredQuotes']>>, { kind: 'candidates_prepared' }>,
  contract: Parameters<CustomerRequestActionRouter['route']>[0]['contract'],
): Promise<PreparedRouteCandidateSet> {
  const presentations = new Map(prepared.frozenCandidates.map((candidate) => [candidate.bindingId, candidate.recipientName]))
  return {
    inspectionRef: customerReference('options', prepared.candidateSetDigest),
    candidates: prepared.candidates.map((candidate) => {
      const businessName = presentations.get(candidate.offer.issuerBindingId)
      if (businessName === undefined) throw new Error('prepared_route_business_identity_missing')
      return {
        optionRef: customerReference('option', candidate.offer.offerDigest),
        business: { name: businessName },
        expectedCost: candidate.expectedCost,
        maximumCost: candidate.maximumCost,
        expectedLatencyMs: candidate.expectedLatencyMs,
        priceComponents: candidate.offer.priceComponents,
        comparableOutputs: candidate.offer.offerOutputs.map((output) => ({
          label: contract.output[output.field]?.customerLabel ?? output.field, value: output.value,
        })),
        materialTerms: candidate.disclosures,
        cancellation: candidate.offer.cancellation,
        expiresAt: candidate.offer.expiresAt,
        inspectionRef: customerReference('evidence', candidate.offer.offerDigest),
      }
    }),
    attempts: prepared.coverage.map((item) => ({
      business: { name: presentations.get(item.bindingId) ?? 'Previously connected business' },
      status: customerAttemptStatus(item.disposition),
      explanation: customerCoverageExplanation(item.disposition),
    })),
  }
}

function customerCoverageExplanation(disposition: Parameters<typeof customerAttemptStatus>[0]): string {
  if (disposition === 'eligible_not_contacted') return 'This business was eligible but was not contacted.'
  if (disposition === 'registration_stale') return 'This business changed its connection before information was shared.'
  if (disposition === 'incident_frozen') return 'This business was unavailable before information was shared.'
  if (disposition === 'release_refused') return 'The approved information could not be shared with this business.'
  if (disposition === 'allocated') return 'Information is allocated for this business but has not been sent.'
  if (disposition === 'dispatch_attempted') return 'AE attempted to contact this business; receipt or response is not yet confirmed.'
  if (disposition === 'option_received') return 'This business returned a usable option.'
  if (disposition === 'provider_refused') return 'This business could not provide an option for this request.'
  return 'AE is checking whether this business received the request or returned an option.'
}

function customerReference(kind: 'options' | 'option' | 'evidence', internalDigest: string): string {
  return `${kind}_${internalDigest.replace(/^sha256:/, '')}`
}

function customerAttemptStatus(disposition: 'eligible_not_contacted' | 'registration_stale' | 'incident_frozen' | 'release_refused' | 'allocated' | 'dispatch_attempted' | 'option_received' | 'provider_refused' | 'uncertain') {
  if (disposition === 'eligible_not_contacted') return 'not_contacted' as const
  if (disposition === 'allocated') return 'contact_pending' as const
  if (disposition === 'dispatch_attempted') return 'contacted' as const
  if (disposition === 'option_received') return 'option_received' as const
  if (disposition !== 'uncertain') return 'unavailable' as const
  return 'uncertain' as const
}

function capabilityVersion(capabilityContractId: string): string {
  return /:v(\d+)$/.exec(capabilityContractId)?.[1] ?? 'unversioned'
}

async function projectKernelQuote(
  quote: RouteQuote,
  directory: CustomerRequestBindingPresentationDirectory,
) {
  const bindingIds = [...new Set([
    ...quote.selectedGraph.steps.map((step) => step.bindingId),
    ...quote.alternatives.flatMap((alternative) => alternative.steps.map((step) => step.bindingId)),
  ])]
  const presentations = new Map((await directory.resolve(bindingIds)).map((item) => [item.bindingId, item]))
  if (presentations.size !== bindingIds.length) throw new Error('prepared_route_business_identity_missing')
  const selectedPresentation = requiredPresentation(presentations, quote.selectedGraph.bindingId)
  const selected: PreparedRouteCandidate = {
    business: business(selectedPresentation),
    expectedCost: quote.selectedGraph.expectedCost,
    maximumCost: quote.selectedGraph.maximumCost,
    expectedLatencyMs: quote.selectedGraph.expectedLatencyMs,
    executionDataFields: quote.selectedGraph.dataFields,
    materialTerms: quote.selectedGraph.disclosures.map((value, index) => ({ key: `provider_disclosure_${index + 1}`, label: 'Provider disclosure', value })),
    cancellation: selectedPresentation.cancellation,
  }
  return {
    quoteId: quote.quoteId,
    quoteDigest: quote.quoteDigest,
    capabilityContractId: quote.selectedGraph.capabilityContractId,
    selected,
    fallbacks: quote.selectedGraph.steps.flatMap((step) => step.role === 'fallback' ? [{
      candidate: {
        business: business(requiredPresentation(presentations, step.bindingId)),
        expectedCost: step.expectedCost,
        maximumCost: step.maximumCost,
        expectedLatencyMs: step.expectedLatencyMs,
        executionDataFields: step.dataFields,
      },
      trigger: 'effect_not_committed' as const,
    }] : []),
    alternatives: quote.alternatives.map((alternative): PreparedRouteCandidate => ({
      business: business(requiredPresentation(presentations, alternative.bindingId)),
      expectedCost: alternative.expectedCost,
      maximumCost: alternative.maximumCost,
      expectedLatencyMs: alternative.expectedLatencyMs,
      executionDataFields: alternative.dataFields,
    })),
    preparationDisclosures: [],
    optimizeFor: quote.organicDecision.optimizeFor,
    commercialInfluence: 'none' as const,
    expiresAt: quote.expiresAt,
  }
}

function requiredPresentation(
  presentations: ReadonlyMap<string, CustomerRequestBindingPresentation>,
  bindingId: string,
): CustomerRequestBindingPresentation {
  const presentation = presentations.get(bindingId)
  if (presentation === undefined) throw new Error('prepared_route_business_identity_missing')
  return presentation
}

function business(presentation: CustomerRequestBindingPresentation) {
  return { nodeId: presentation.nodeId, bindingId: presentation.bindingId, name: presentation.businessName }
}
