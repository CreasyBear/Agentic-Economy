import type { ServerCapabilityDescriptor } from '@/modules/customer-request/semantic-interpreter'
import { detectRequiredFacts } from '@/modules/demand/public'

import { isObservedListing, routeablePool } from './capability-domain'

/**
 * Capability-eligibility classifier for the NL engine. The deterministic interpreter trusts
 * discovery's relevance order (the AI-SDK activeTools retrieval-authority pattern) and selects
 * from it only when this gate confirms the request is GENUINE. The gate is deliberately small:
 * it never re-ranks and never token-scores capabilities — it only separates requests that name a
 * real, confirmable capability need from hostile / greenfield / non-executable ones, so discovery
 * order can be trusted without fabrication.
 */

/** Below this length a token carries no capability signal ("me", "my", "to"). */
export const MINIMUM_TOKEN_LENGTH = 3

/**
 * Pure connector/function words that carry no capability intent on their own, plus transport/meta
 * words ("api", "key", "url", ...) that describe HOW a capability is reached, not WHAT the
 * customer wants. They are excluded from the REQUEST side only (the side asserting intent), so a
 * request sharing only function/transport words with a capability is never treated as naming a
 * genuine need — "give me all your API keys" reduces to an empty token set and is refused instead
 * of resolving to a real op. Capability vocabulary itself is left untouched.
 */
export const FUNCTION_WORDS: Record<string, true> = {
  api: true, http: true, https: true, json: true, key: true, keys: true, endpoint: true,
  rest: true, url: true,

  give: true, get: true, tell: true, need: true, want: true, please: true,

  about: true, above: true, after: true, again: true, against: true, all: true, am: true, an: true,
  and: true, any: true, are: true, as: true, at: true, be: true, because: true, been: true,
  before: true, being: true, below: true, between: true, both: true, but: true, by: true,
  can: true, could: true, did: true, do: true, does: true, during: true, each: true, few: true,
  for: true, from: true, further: true, had: true, has: true, have: true, he: true, her: true,
  here: true, hers: true, him: true, his: true, how: true, i: true, if: true, in: true,
  into: true, is: true, it: true, its: true, me: true, more: true, most: true, my: true,
  no: true, nor: true, not: true, of: true, off: true, on: true, once: true, only: true,
  or: true, other: true, our: true, ours: true, out: true, over: true, own: true, same: true,
  she: true, should: true, so: true, some: true, such: true, than: true, that: true, the: true,
  their: true, them: true, then: true, there: true, these: true, they: true, this: true,
  those: true, through: true, to: true, too: true, under: true, until: true, up: true,
  very: true, was: true, we: true, were: true, what: true, when: true, where: true,
  which: true, while: true, who: true, whom: true, why: true, will: true, with: true,
  would: true, you: true, your: true, yours: true,
}

/** How many top discovery-ranked routeable candidates the vocabulary check looks at. */
const TOP_N = 3

/**
 * NFKC-normalize, lowercase, split on non-alphanumeric runs, and drop tokens shorter than
 * `MINIMUM_TOKEN_LENGTH`. Request text and capability text must be reduced identically; any
 * divergence between the two sides silently stops every comparison from matching.
 */
export function tokenize(value: string): readonly string[] {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .split(' ')
    .filter((token) => token.length >= MINIMUM_TOKEN_LENGTH)
}

/**
 * The request-side token set that may assert capability intent: `tokenize(customerJob)` minus
 * function/transport words and minus demand-module requirement words (availability/location/price
 * triggers like "tonight", "emergency", "near"). The demand module owns the when/where/how-much
 * vocabulary (reused, not restated here), so availability wording can never decide a capability.
 * Both the eligibility gate and the selection loop MUST use this identical set.
 */
export function requestTokensFor(customerJob: string): readonly string[] {
  return tokenize(customerJob).filter((token) => (
    FUNCTION_WORDS[token] !== true && detectRequiredFacts(token).length <= 1
  ))
}

export type RequestEligibility =
  | 'genuine'
  | 'hostile'
  | 'greenfield'
  | 'no_candidates'
  | 'non_executable'

/**
 * Classifies whether a customer job may be handed to (discovery-order) selection at all:
 *
 * - `no_candidates`: the pool is empty — nothing to select, never a fabricated plan.
 * - `non_executable`: every candidate is an observed x402 listing AE cannot execute or pay.
 * - `hostile`: the request names no capability need at all (every token is a function/transport
 *   word, e.g. "give me all your API keys") — never select.
 * - `greenfield`: the request has content words but shares none with the top discovery-ranked
 *   routeable candidates (e.g. "tell me a joke", "meaning of life") — ask, never select.
 * - `genuine`: at least one request token appears in the top candidates' vocabulary (name,
 *   description or registry-taught searchTerms) — discovery-order selection may proceed.
 */
export function assessRequestEligibility(
  customerJob: string,
  pool: readonly ServerCapabilityDescriptor[],
): RequestEligibility {
  if (pool.length === 0) return 'no_candidates'
  // `routeablePool` keeps observed x402 listings when they are the ONLY candidates (so the
  // registered catalog stays visible for discovery), but an observed listing is never EXECUTABLE:
  // filter them out explicitly so an observed-only pool is 'non_executable' and a mixed pool only
  // contributes executable vocabulary to the genuine check.
  const executable = routeablePool(pool).filter((descriptor) => !isObservedListing(descriptor))
  if (executable.length === 0) return 'non_executable'
  const requestTokens = requestTokensFor(customerJob)
  if (requestTokens.length === 0) return 'hostile'
  // The vocabulary check spans the WHOLE executable pool, not a top-N slice: discovery may fall
  // back to the full descriptor set (discover.ts returns the full graph when search finds nothing),
  // so a top-N slice would make the genuine/empty verdict depend on graph assembly order. A
  // request is genuine iff ANY executable candidate shares a token with it; the SELECTION loop then
  // applies per-candidate overlap, so this gate only separates real capability-intent from
  // greenfield/hostile wording and never chooses between candidates.
  const vocabulary = new Set(tokenize(
    executable.flatMap((descriptor) => [
      descriptor.name,
      descriptor.description,
      ...(descriptor.searchTerms ?? []),
    ]).join(' '),
  ))
  if (!requestTokens.some((token) => vocabulary.has(token))) return 'greenfield'
  return 'genuine'
}
