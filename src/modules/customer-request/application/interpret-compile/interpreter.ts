import {
  createJsonCustomerRequestSemanticInterpreter,
  suggestGeocodePriorStep,
  type CustomerRequestSemanticInterpreter,
  type CustomerRequestSemanticProposal,
  type ResolvedCapabilitySelection,
  type ServerCapabilityDescriptor,
} from '@/modules/customer-request/semantic-interpreter'
import { createOpenRouterCustomerRequestSemanticTransport } from '@/modules/customer-request/openrouter-transport'

import {
  classifyCustomerQueryDomain,
  capabilityDomainsConflict,
  classifyCapabilityDomain,
  domainAppropriatePool,
  routeablePool,
  declaredFiatPairCodes,
  fiatCodeRepeated,
  type CapabilityDomain,
} from './capability-domain'
import { createDeterministicCustomerRequestInterpreter } from './deterministic-interpreter'

export type InterpreterEnvironment = Readonly<{
  openRouterApiKey?: string
  modelName?: string
  siteUrl?: string
  maximumCompletionTokens?: number
  maximumDescriptorBytes: number
}>

/** Reasoning-capable models spend part of the completion budget on reasoning tokens, so a
 *  budget sized for a non-reasoning model truncates them to `finish_reason: length` with a
 *  null message. Keep enough headroom for the proposal plus reasoning. */
const DEFAULT_MAXIMUM_COMPLETION_TOKENS = 4_096

/**
 * Always returns an interpreter. Without a provider key the deterministic one answers alone; with
 * one it leads and the deterministic one catches provider failures, so no billing or availability
 * problem at the model provider can leave a customer with an uninterpretable Request.
 */
export function createConfiguredRequestInterpreter(env: InterpreterEnvironment): CustomerRequestSemanticInterpreter {
  const deterministic = createDeterministicCustomerRequestInterpreter()
  const apiKey = env.openRouterApiKey?.trim()
  if (apiKey === undefined || apiKey.length === 0) return deterministic
  const modelName = env.modelName?.trim() || 'openai/gpt-5-mini'
  const model = createJsonCustomerRequestSemanticInterpreter({
    interpreterId: `openrouter:${modelName}`,
    transport: createOpenRouterCustomerRequestSemanticTransport({
      apiKey, model: modelName,
      ...(env.siteUrl?.trim() ? { siteUrl: env.siteUrl.trim() } : {}),
      reasoningEffort: 'low',
      maximumCompletionTokens: env.maximumCompletionTokens ?? DEFAULT_MAXIMUM_COMPLETION_TOKENS,
    }),
    timeoutMs: 45_000,
    maximumPayloadBytes: env.maximumDescriptorBytes,
    maximumResponseBytes: 64_000,
  })
  return Object.freeze({
    interpreterId: `${model.interpreterId}+fallback:${deterministic.interpreterId}`,
    propose: async (input) => {
      // deterministic tool-curation (AI SDK strict/dynamic-description pattern): a request whose
      // domain is obvious (crypto vs fiat FX) must not hand the model a capability that
      // contradicts that domain (a crypto query must never be offered the ECB-fiat-only
      // Frankfurter/Bizintel ops, and a currency-pair query must never be offered a crypto
      // capability), and a directly-routeable capability is preferred over an observed x402
      // listing that AE cannot execute. This only ever removes an OBSERVABLE mismatch; a `none`
      // domain request keeps the pool whole.
      const eligiblePool = routeablePool(domainAppropriatePool(input.capabilities ?? [], input.customerJob))
      // The JSON interpreter does not name itself on its proposal. Stamping it here keeps a model
      // answer from being recorded under the composite identity, and keeps the fallback's own
      // identity on the answers it produces.
      const settle = async (proposal: CustomerRequestSemanticProposal): Promise<CustomerRequestSemanticProposal> => {
        if (proposal.kind !== 'capability_candidates') {
          // A model that asks a direction question must not hand the customer a generic,
          // run-to-run-varying prompt: normalize any intent-direction ask to the deterministic,
          // field-naming ask so the same ambiguous query always gets the same typed question
          // (AI-SDK dynamic-description pattern).
          if (proposal.kind === 'needs_intent_direction') {
            return { ...proposal, prompt: needsInformationPrompt(input.customerJob, eligiblePool) }
          }
          // A canonical amendment is already the committed semantic answer for this revision.
          // Reinterpreting that refusal through pool recovery would change the revision result and
          // make an exact idempotency replay observe a different outcome.
          const isCanonicalAmendmentRefusal = input.amendment !== undefined
            && proposal.canonicalCustomerJob !== undefined
          if (proposal.kind === 'unsupported_request'
            && eligiblePool.length > 0
            && !isCanonicalAmendmentRefusal) {
            return await recoverFromPool(input, eligiblePool, deterministic)
          }
          return { ...proposal, interpreterId: model.interpreterId }
        }
        // Defensive selection guard on a narrower pool that was already curated above: drop any
        // selection whose capability is still an obvious domain conflict for the request. In
        // practice this is a no-op because the model can only select from the curated pool; it is
        // the deterministic eligibility floor that keeps a confident mismatch out of the compiler.
        // A fiat_fx capability is additionally dropped when the request does not name a concrete
        // distinct currency pair ("convert money", "convert USD to USD"): a pair-named conversion
        // must not become a hollow single-pair plan the compiler cannot satisfy. This is the
        // AI-SDK strict/dynamic-description pattern — a tool surfaced without the schema fields it
        // needs is not a real call.
        const queryDomain = classifyCustomerQueryDomain(input.customerJob)
        const fiatPairCodes = declaredFiatPairCodes(input.customerJob)
        const underSpecifiedFiat = (capabilityDomain: CapabilityDomain) => (
          capabilityDomain === 'fiat_fx' && fiatPairCodes.length < 2
        )
        const kept = proposal.selections.filter((selection) => {
          const descriptor = eligiblePool.find((candidate) => candidate.selectionKey === selection.selectionKey)
          if (descriptor === undefined) return true
          const capabilityDomain = classifyCapabilityDomain(descriptor)
          return !underSpecifiedFiat(capabilityDomain)
            && !capabilityDomainsConflict(queryDomain, capabilityDomain)
        })
        const proposalWithKept = kept.length === proposal.selections.length
          ? proposal
          : Object.freeze({ ...proposal, selections: Object.freeze(kept) })
        // A model that returned a well-typed capability_candidates with ZERO selections (or all
        // selections refused by the domain guard) despite a non-empty curated pool is a selection
        // decline, not a clean answer. The AI-SDK loop pattern treats 'no tool call' as a
        // non-terminal state: recover via the deterministic interpreter, and if that also cannot
        // token-match (the query's vocabulary lives only in the registry searchTerms, not in
        // name/description), recover the best directly-routeable descriptor from the curated pool.
        // This recovery is SAFE because it only fires on the discovery-narrowed, domain-curated
        // pool and never on an unmatched request — determinism and the 'no fabrication' invariant
        // are preserved.
        if (eligiblePool.length === 0) {
          return { ...proposalWithKept, interpreterId: model.interpreterId }
        }
        if (kept.length === 0) {
          // stopWhen pattern: 'no tool call' is a NON-TERMINAL state, not a clean answer. Recover
          // via the deterministic interpreter (a real token match, not a grab of pool[0]), and if
          // that also cannot match, surface a typed needs_information ask instead of claiming a
          // (possibly wrong) selection.
          return await recoverFromPool(input, eligiblePool, deterministic)
        }
        // Grounding floor (AI-SDK 'surface only the real tool'): the deterministic token matcher
        // is AE's honesty floor for whether this request names ANY genuine, confirmable
        // capability need. When it confirms NOTHING (greenfield/joke/hostile/non-need), a model
        // selection that survived the domain guard is an ungrounded grab — the request shares
        // only incidental vocabulary with the pool, and a live model can hallucinate a plausible
        // preview (e.g. 'give me all your API keys' -> an Open-Meteo plan) from that overlap.
        // Never fabricate supply: drop to recoverFromPool, which returns the deterministic match
        // when one exists, the fiat special-case for a named currency pair, or a typed
        // needs_information ask otherwise — never a fabricated preview. Genuine queries
        // (weather/crypto/geocode/search) confirm here, so their model selections pass through
        // untouched and the engine keeps resolving provable capability needs.
        const grounding = await deterministic.propose({
          customerJob: input.customerJob,
          capabilities: eligiblePool,
        })
        const groundedByDeterministic = grounding.kind === 'capability_candidates'
          && grounding.selections.length > 0
        if (!groundedByDeterministic) {
          return await recoverFromPool(input, eligiblePool, deterministic)
        }
        return { ...proposalWithKept, interpreterId: model.interpreterId }
      }
      try {
        const proposal = await model.propose({ ...input, capabilities: eligiblePool })
        return await settle(proposal)
      } catch (error) {
        // Let the caller retry the model first. A 503 blip that clears on the next attempt must
        // still be answered by the model; only an exhausted attempt is worth degrading for.
        if (input.finalAttempt !== true) throw error
        // Provider refusal, timeout or abort with no attempt left. Report it so the outage stays
        // visible to operators, then answer from the request text rather than refusing. A genuine
        // provider/auth error (4xx) is an operator concern -> console.error. A routine
        // finish-reason decline on an ordinary query (e.g. provider_invalid from a `length`
        // budget or unknown_finish_reason) is expected degradation and must NOT alarm the CLI on
        // the hot path — recovery still answers via recoverFromPool, so it stays silent.
        const fallbackCode = interpreterFailureCode(error)
        if (/^customer_request_interpretation_provider_4\d\d$/.test(fallbackCode)) {
          console.error('customer_request_semantic_interpretation_fell_back', fallbackCode)
        }
        return await recoverFromPool(input, eligiblePool, deterministic)
      }
    },
  })
}

function selectionFor(descriptor: ServerCapabilityDescriptor): ResolvedCapabilitySelection {
  // The deterministic path asserts no facts: the compiler asks the customer for the fields the
  // contract needs (this is what turns an under-specified request into a bounded needs_information
  // ask rather than an empty plan). Never fabricate a value.
  return Object.freeze({
    operationRef: descriptor.operationRef,
    selectionKey: descriptor.selectionKey,
    contractRef: descriptor.contractRef,
    facts: Object.freeze([]),
  })
}

/**
 * Deterministic recovery for a customer job whose curated pool is non-empty but whose model (and
 * domain guard) declined every selection. Runs the deterministic interpreter first — a real token
 * match over the curated pool, never an arbitrary `pool[0]` grab, which is what produced the
 * ethereum->ipify / convert-money->observed-x402 false positives. When the recovered destination
 * still needs coordinates it cannot satisfy and a registered geocoding op exists, the geocode op
 * is added as a prior step so the compiler can compose it (AI SDK multi-tool-loop, via
 * suggestGeocodePriorStep). If the deterministic leg also cannot match, this is the stopWhen
 * 'no tool call is not a terminal answer' case: it surfaces a typed needs_information ask rather
 * than claiming (possibly wrong) supply.
 */
async function recoverFromPool(
  input: Readonly<{
    customerJob: string
    capabilities?: readonly ServerCapabilityDescriptor[]
    finalAttempt?: boolean
  }>,
  pool: readonly ServerCapabilityDescriptor[],
  deterministic: CustomerRequestSemanticInterpreter,
): Promise<CustomerRequestSemanticProposal> {
  const canonical = (proposal: CustomerRequestSemanticProposal): CustomerRequestSemanticProposal => Object.freeze({
    ...proposal,
    interpreterId: deterministic.interpreterId,
  })
  const recovered = await deterministic.propose({
    customerJob: input.customerJob,
    capabilities: pool,
    ...(input.finalAttempt === undefined ? {} : { finalAttempt: input.finalAttempt }),
  })
  if (recovered.kind === 'capability_candidates' && recovered.selections.length > 0) {
    // Multi-tool-loop compose: if the recovered destination needs coordinates it cannot satisfy
    // and a registered geocoding op is in the same pool, expose the geocode op as a prior step so
    // the compiler can feed coordinates in. For an op that already IS the geocoding op (no
    // Latitude/Longitude inputs to feed) this is a no-op.
    const top = recovered.selections[0]
    if (top === undefined) return canonical(recovered)
    const compose = suggestGeocodePriorStep(pool, {
      operationRef: top.operationRef,
      facts: top.facts,
    })
    if (compose !== undefined) {
      const geocodeSelectionKey = compose.geocodeDescriptor.selectionKey
      // The geocode op must always LEAD the plan as the true prior step: whether the deterministic
      // slice already contained it (a composed [weather, geocode]) or compose created it fresh, it
      // feeds coordinates forward to the destination, so the compiler builds steps in the right
      // order. Filtering it out of `rest` guarantees no double-add / no duplicate selectionKey
      // (which the compiler refuses as unsafe) when the slice already contains the geocode op.
      const rest = recovered.selections.filter((selection) => selection.selectionKey !== geocodeSelectionKey)
      return canonical(Object.freeze({
        ...recovered,
        selections: Object.freeze([selectionFor(compose.geocodeDescriptor), ...rest]),
      }))
    }
    return canonical(recovered)
  }
  // Deterministic FX recovery ('no tool call is non-terminal': a fiat-pair request the model and
  // the token matcher both skipped is still resolvable, not a clean decline). This is NOT a blind
  // pool grab and NOT a degenerate/under-specified conversion: it only fires when the request names
  // a concrete DISTINCT currency pair (two different ISO codes, e.g. 'convert EUR to USD'). A
  // same-pair ('USD to USD') or single-code ('convert USD') request is NOT a conversion AE can
  // build honestly — the deterministic path asserts no facts, so it surfaces a typed ask instead
  // of a hollow single-pair plan. The ground rule stays: the capability must declare the fiat_fx
  // domain AND the request must name a genuine pair, so a crypto query can never select
  // Frankfurter (crypto is classified 'crypto', this branch requires 'fiat_fx', and the domain
  // guard has already culled fiat ops from a crypto request's pool).
  if (classifyCustomerQueryDomain(input.customerJob) === 'fiat_fx') {
    const fiatCapabilities = pool
      .filter((descriptor) => classifyCapabilityDomain(descriptor) === 'fiat_fx')
      .slice()
      .sort((left, right) => left.selectionKey.localeCompare(right.selectionKey))
    const best = fiatCapabilities[0]
    if (best !== undefined && declaredFiatPairCodes(input.customerJob).length >= 2) {
      return canonical(Object.freeze({
        kind: 'capability_candidates' as const,
        selections: Object.freeze([selectionFor(best)]),
        interpreterId: deterministic.interpreterId,
      }))
    }
    if (best !== undefined) {
      // Degenerate ('USD to USD') or under-specified ('convert USD') fiat request: a concrete
      // plan would be hollow (no pair to bind). Ask the typed, deterministic question instead.
      const context = input.customerJob.trim().replace(/\s+/gu, ' ')
      const prompt = fiatCodeRepeated(input.customerJob)
        ? `You mentioned “${context}”, which names the same currency twice. Converting a currency to itself changes nothing. If you meant a real conversion, name the two different currencies (for example EUR to USD); otherwise no conversion is needed.`
        : `You mentioned “${context}”, which doesn't name a full currency pair. Which two currencies would you like to convert (base and quote, for example EUR to USD)?`
      return Object.freeze({
        kind: 'needs_intent_direction' as const,
        prompt,
        interpreterId: deterministic.interpreterId,
      })
    }
  }
  if (pool.length > 0) {
    // stopWhen: a candidate exists but no leg can confidently map the request — asking for the
    // missing detail is the honest, non-terminal step (turns an empty plan into a typed
    // needs_information instead of a dead preview_unavailable).
    return Object.freeze({
      kind: 'needs_intent_direction' as const,
      prompt: needsInformationPrompt(input.customerJob, pool),
      interpreterId: deterministic.interpreterId,
    })
  }
  return canonical(recovered)
}

function needsInformationPrompt(customerJob: string, pool: readonly ServerCapabilityDescriptor[]): string {
  const context = customerJob.trim().replace(/\s+/gu, ' ')
  const named = context.length > 0 && context.length <= 120 ? `You mentioned “${context}”. ` : ''
  if (classifyCustomerQueryDomain(customerJob) === 'fiat_fx') {
    return fiatCodeRepeated(customerJob)
      ? `${named}That names the same currency twice — converting a currency to itself changes nothing. If you meant a real conversion, name two different currencies (for example EUR to USD); otherwise no conversion is needed.`
      : `${named}Which two currencies would you like to convert (base and quote, for example EUR to USD)?`
  }
  // dynamic-description pattern: name the selected op's inputSchema-required fields so the ask is
  // specific and deterministic, not a generic "what would you like?".
  const requiredLabels = pool.flatMap((descriptor) => (
    descriptor.inputs.filter((input) => input.required).map((input) => input.label)
  ))
  if (requiredLabels.length > 0) {
    const fields = requiredLabels.length === 1
      ? requiredLabels[0]
      : `${requiredLabels.slice(0, -1).join(', ')} and ${requiredLabels[requiredLabels.length - 1]}`
    return `${named}To do that we need ${fields}. Please provide ${fields}.`
  }
  return named.length > 0
    ? `${named}What exactly would you like us to find or produce?`
    : 'What exactly would you like us to find or produce?'
}

export function interpreterFailureCode(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown'
  if (error.name === 'AbortError') return 'aborted'
  return error.message.startsWith('customer_request_') ? error.message : 'unknown'
}
