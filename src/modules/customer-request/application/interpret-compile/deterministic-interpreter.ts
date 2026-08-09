import {
  DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
  type CustomerRequestSemanticInterpreter,
  type ResolvedCapabilitySelection,
  type ServerCapabilityDescriptor,
} from '@/modules/customer-request/semantic-interpreter'

import {
  classifyCustomerQueryDomain,
  capabilityDomainsConflict,
  classifyCapabilityDomain,
  declaredFiatPairCodes,
  isObservedListing,
  type CapabilityDomain,
} from './capability-domain'
import { assessRequestEligibility, requestTokensFor, tokenize } from './eligibility'

/**
 * Bounded number of capabilities a recovery may compose into one plan. A discovery-order match
 * alone cannot establish that a customer wants many capabilities performed in sequence, but a
 * KNOWN, guarded multi-step need (e.g. geocode a place then fetch its weather) is a real plan the
 * recovery can build honestly. ``buildDeterministicSelections`` applies the cross-capability
 * domain guard per candidate, so every extra selection is a genuine, domain-appropriate match —
 * never a fabricated one — and the cap stays small (2) to avoid assembling a plan nobody asked for.
 */
const MAXIMUM_SELECTIONS = 2

/**
 * Answers from the request text alone: no network, no model, no provider account. It exists so a
 * provider outage cannot turn the front door into a dead end. It is deliberately weaker than a
 * model — when the eligibility gate does not confirm the request as GENUINE it proposes nothing at
 * all, because a confidently wrong capability costs the customer more than an unanswered question.
 *
 * Selection is discovery-order-trust (the AI-SDK activeTools retrieval-authority pattern): the
 * caller passes the discovery-ranked eligible pool and this interpreter picks from, but never
 * re-ranks, that order. The hand-rolled token matcher (rankCapabilities / requestedStems /
 * stemming / the exactly-one-distinct-identity gate) that used to live here was removed — discovery
 * already ranks by the registry-taught searchTerms, so re-deriving a weaker rank over the same
 * vocabulary only failed multi-binding (crypto/fx) and content-keyword (search/page-content)
 * requests.
 */
export function createDeterministicCustomerRequestInterpreter(): CustomerRequestSemanticInterpreter {
  return Object.freeze({
    interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
    propose: async ({ customerJob, capabilities }) => {
      const selections = buildDeterministicSelections(customerJob, capabilities)
      // Nothing was canonicalised: this is the customer's own wording with surrounding space gone.
      const canonicalCustomerJob = customerJob.trim()
      return Object.freeze({
        kind: 'capability_candidates' as const,
        selections,
        ...(canonicalCustomerJob.length === 0 ? {} : { canonicalCustomerJob }),
        interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
      })
    },
  })
}

/**
 * Builds a bounded, domain-coherent selection set from the DISCOVERY-ORDERED pool, with three
 * honesty floors: (1) the eligibility gate must confirm the request is GENUINE (hostile /
 * greenfield / no_candidates / non_executable requests propose nothing); (2) at most one binding
 * per capability identity is kept — several businesses bound to the same vocabulary are
 * ALTERNATIVES, never compose steps, so this still proposes exactly one of them (the AI-SDK
 * ``activeTools`` one-tool-many-providers model); (3) the cross-capability domain guard rejects a
 * candidate whose declared domain contradicts the request's domain or another already-selected
 * capability's domain, so a multi-step recovery never mixes crypto with an ECB-fiat-only op.
 * STOP-WHEN honesty: ``no tool call is not a terminal answer`` — a candidate that survives the cap
 * is a real, domain-appropriate match; anything that does not (ambiguous, under-specified, or
 * domain-conflicting) is simply not selected and the caller surfaces a typed ask instead.
 */
function buildDeterministicSelections(
  customerJob: string,
  capabilities: readonly ServerCapabilityDescriptor[],
): readonly ResolvedCapabilitySelection[] {
  if (assessRequestEligibility(customerJob, capabilities) !== 'genuine') return []
  const queryDomain = classifyCustomerQueryDomain(customerJob)
  const requestTokens = requestTokensFor(customerJob)
  const uncovered = new Set(requestTokens)
  const selections: ResolvedCapabilitySelection[] = []
  const seenIdentity = new Set<string>()
  const selectedDomains: CapabilityDomain[] = []
  for (const descriptor of capabilities) {
    if (selections.length >= MAXIMUM_SELECTIONS) break
    // An observed x402 listing is never selected by the deterministic path: it is registered for
    // discovery only, and the no-key path reaches this loop without the composite interpreter's
    // routeable curation.
    if (isObservedListing(descriptor)) continue
    // Several bindings of one capability share a vocabulary identity; they are alternatives, not
    // compose steps, so keep only the best-ranked of them (the first in discovery order).
    const identity = [descriptor.name, descriptor.description, ...(descriptor.searchTerms ?? [])].join('\u0000')
    if (seenIdentity.has(identity)) continue
    seenIdentity.add(identity)
    const capabilityDomain = classifyCapabilityDomain(descriptor)
    // The cross-capability guard applied to the DISCOVERY-ORDERED candidates before the cap:
    // never select a capability that contradicts the request's own domain, and never combine two
    // capabilities whose declared domains contradict each other (a crypto op and an ECB-fiat-only
    // op must never appear in one plan).
    if (capabilityDomainsConflict(queryDomain, capabilityDomain)) continue
    if (selectedDomains.some((domain) => capabilityDomainsConflict(domain, capabilityDomain))) continue
    // Per-candidate vocabulary overlap (greedy uncovered-token rule): a candidate is selected only
    // when it covers ≥1 request token NOT already covered by a previously-selected candidate.
    // This prevents alternatives sharing the same request vocabulary (e.g. Exa + Tavily + SerpAPI
    // for a "search the web" query) from co-selecting, while allowing a genuine multi-step compose
    // (geocode then forecast) where each candidate covers different request tokens.
    const candidateTokens = tokenize([
      descriptor.name,
      descriptor.description,
      ...(descriptor.searchTerms ?? []),
    ].join(' '))
    const covered = candidateTokens.filter((token) => uncovered.has(token))
    if (covered.length === 0) continue
    // Fiat-degenerate guard: a fiat_fx capability is never selected when the request does not
    // name a concrete DISTINCT currency pair (two different ISO codes). A same-pair ("USD to USD")
    // or single-code ("convert USD") request is not a conversion the engine can build honestly.
    if (capabilityDomain === 'fiat_fx' && declaredFiatPairCodes(customerJob).length < 2) continue
    selectedDomains.push(capabilityDomain)
    for (const token of covered) uncovered.delete(token)
    selections.push(Object.freeze({
      operationRef: descriptor.operationRef,
      selectionKey: descriptor.selectionKey,
      contractRef: descriptor.contractRef,
      // A deterministic selection cannot produce a value that a registered input schema would
      // accept, so it asserts none and lets the compiler ask the customer for what the contract
      // needs.
      facts: Object.freeze([]),
    }))
  }
  return Object.freeze(selections)
}
