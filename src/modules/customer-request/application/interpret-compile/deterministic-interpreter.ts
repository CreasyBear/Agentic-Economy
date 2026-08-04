import {
  DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
  type CustomerRequestSemanticInterpreter,
  type ResolvedCapabilitySelection,
  type ServerCapabilityDescriptor,
} from '@/modules/customer-request/semantic-interpreter'
import { detectRequiredFacts } from '@/modules/demand/public'

/**
 * Each selection compiles to one step of a single route; alternatives come from several
 * businesses bound to the same capability, never from several capabilities. A token match cannot
 * establish that a customer wants two capabilities performed in sequence, so it proposes exactly
 * the one best-scoring capability rather than assembling a plan nobody asked for.
 */
const MAXIMUM_SELECTIONS = 1

/** Below this length a token carries no capability signal ("me", "my", "to"). */
const MINIMUM_TOKEN_LENGTH = 3

/** Suffix stripping stops here so short words ("gas", "rate") are never truncated into noise. */
const MINIMUM_STEM_LENGTH = 4

const STEM_SUFFIXES = ['ings', 'ing', 'ers', 'er', 'es', 's'] as const

/**
 * Answers from the request text alone: no network, no model, no provider account. It exists so a
 * provider outage cannot turn the front door into a dead end. It is deliberately weaker than a
 * model — when nothing matches it proposes nothing at all, because a confidently wrong capability
 * costs the customer more than an unanswered question.
 */
export function createDeterministicCustomerRequestInterpreter(): CustomerRequestSemanticInterpreter {
  return Object.freeze({
    interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
    propose: async ({ customerJob, capabilities }) => {
      const selections: readonly ResolvedCapabilitySelection[] = rankCapabilities(customerJob, capabilities)
        .slice(0, MAXIMUM_SELECTIONS)
        .map((ranked) => Object.freeze({
          operationRef: ranked.descriptor.operationRef,
          selectionKey: ranked.descriptor.selectionKey,
          contractRef: ranked.descriptor.contractRef,
          // A token match cannot produce a value that a registered input schema would accept, so
          // it asserts none and lets the compiler ask the customer for what the contract needs.
          facts: Object.freeze([]),
        }))
      // Nothing was canonicalised: this is the customer's own wording with surrounding space gone.
      const canonicalCustomerJob = customerJob.trim()
      return Object.freeze({
        kind: 'capability_candidates' as const,
        selections: Object.freeze(selections),
        ...(canonicalCustomerJob.length === 0 ? {} : { canonicalCustomerJob }),
        interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
      })
    },
  })
}

type RankedCapability = Readonly<{ descriptor: ServerCapabilityDescriptor; score: number }>

function rankCapabilities(
  customerJob: string,
  capabilities: readonly ServerCapabilityDescriptor[],
): readonly RankedCapability[] {
  const requested = requestedStems(customerJob)
  if (requested.length === 0 || capabilities.length === 0) return []
  const supplied = capabilities.map((descriptor) => ({
    descriptor,
    stems: new Set(capabilityTokens(`${descriptor.name} ${descriptor.description}`).map(stemOf)),
  }))
  // Descriptor frequency down-weights words every capability shares ("service", "request", the
  // registry's own boilerplate) so discriminating words decide the ranking. This reads the supply
  // actually on offer instead of a hand-written stopword list that would drift away from it.
  const frequencies = new Map(requested.map((stem) => [
    stem,
    supplied.filter((candidate) => candidate.stems.has(stem)).length,
  ]))
  return supplied
    .map((candidate) => ({
      descriptor: candidate.descriptor,
      score: requested.reduce((total, stem) => candidate.stems.has(stem)
        ? total + Math.log(1 + supplied.length / (frequencies.get(stem) ?? supplied.length))
        : total, 0),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score
      || left.descriptor.selectionKey.localeCompare(right.descriptor.selectionKey))
}

function requestedStems(customerJob: string): readonly string[] {
  const stems = new Set<string>()
  for (const token of capabilityTokens(customerJob)) {
    // `detectRequiredFacts` always reports `service_detail`; anything beyond it means the demand
    // module recognises this token as one of its requirement triggers ("tonight", "near",
    // "cheapest"). Those words say when, where or how much — not what — so letting them score
    // against capability text would hand the decision to an availability word. Asking the demand
    // module one token at a time reuses its trigger lists instead of restating them here.
    if (detectRequiredFacts(token).length > 1) continue
    stems.add(stemOf(token))
  }
  return [...stems]
}

/**
 * Request text and capability text must be reduced identically; any divergence between the two
 * sides silently stops every comparison from matching.
 */
function capabilityTokens(value: string): readonly string[] {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .split(' ')
    .filter((token) => token.length >= MINIMUM_TOKEN_LENGTH)
}

function stemOf(token: string): string {
  for (const suffix of STEM_SUFFIXES) {
    if (token.length - suffix.length >= MINIMUM_STEM_LENGTH && token.endsWith(suffix)) {
      return token.slice(0, token.length - suffix.length)
    }
  }
  return token
}
