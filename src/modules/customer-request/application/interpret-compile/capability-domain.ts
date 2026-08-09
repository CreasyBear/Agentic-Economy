import type { ServerCapabilityDescriptor } from '@/modules/customer-request/semantic-interpreter'

/**
 * Conservative capability-domain curation for the model -> compile seam.
 *
 * Guidance (AI SDK "Tools and tool calling"): strict tool calling enforces a tool's own
 * `inputSchema` so a call that contradicts the schema is rejected; dynamic `description`
 * functions decide whether a tool is surfaced at all based on the current request context. A
 * capability whose own surfaced contract OBVIOUSLY contradicts the request's domain is the AE
 * analogue — it is "a tool whose description/schema contradicts the request ... not surfaced / is
 * rejected before execute".
 *
 * This module is deliberately CONSERVATIVE: it only removes an OBSERVABLE mismatch, i.e. a
 * contradiction that is visible in the capability's own name/description text (ECB/fiat reference
 * rate vs crypto) against a request that explicitly names a concrete asset or a literal currency
 * pair. It never removes a capability on ambiguous/vague wording, never fabricates facts, never
 * selects a capability on its own, and every capability it keeps still has to pass the unchanged
 * deterministic compiler/contract-identity gate.
 */

export type CapabilityDomain = 'crypto' | 'fiat_fx' | 'none'

// Queries are classified as crypto ONLY when they explicitly name a concrete crypto asset. There
// is deliberately no generic 'coin'/'token'/'crypto' term here — those are too ambiguous and would
// over-cull unrelated capabilities (the false positive the guard must avoid).
const CRYPTO_ASSET_TOKENS: Record<string, true> = {
  bitcoin: true, btc: true, ethereum: true, eth: true, dogecoin: true, doge: true,
  litecoin: true, ltc: true, solana: true, sol: true, cardano: true, ada: true,
  ripple: true, xrp: true, polkadot: true, dot: true,
}

// A literal fiat currency pair in the request text (e.g. "EUR to USD"). ISO 4217 codes only; the
// query must name actual codes, never a fuzzy phrase.
const FIAT_CURRENCY_TOKENS: Record<string, true> = {
  usd: true, eur: true, gbp: true, jpy: true, aud: true, cad: true, chf: true,
  cny: true, hkd: true, nzd: true, sek: true, nok: true, dkk: true, pln: true,
  czk: true, huf: true, try: true, inr: true, krw: true, sgd: true, mxn: true,
  zar: true, brl: true, php: true, idr: true, thb: true, myr: true, rub: true,
}

const FX_WORDS: Record<string, true> = {
  convert: true, conversion: true, exchange: true, forex: true, to: true,
}

function normalizedTokens(value: string): readonly string[] {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/gu, ' ')
    .split(' ')
    .filter((token) => token.length > 0)
}

/**
 * The domain a customer request is *about*, classified conservatively. `crypto` beats `fiat_fx`
 * because "bitcoin price in usd" names a concrete crypto asset even though it also carries a fiat
 * code. Returns `none` for anything ambiguous so the guard never filters on vague wording.
 */
export function classifyCustomerQueryDomain(customerJob: string): CapabilityDomain {
  const tokens = normalizedTokens(customerJob)
  if (tokens.some((token) => CRYPTO_ASSET_TOKENS[token] === true)) return 'crypto'
  const fiatCodes = new Set(tokens.filter((token) => FIAT_CURRENCY_TOKENS[token] === true))
  const fiatPair = fiatCodes.size >= 2
  const convert = tokens.some((token) => FX_WORDS[token] === true)
  if (fiatPair || (fiatCodes.size === 1 && convert)) return 'fiat_fx'
  return 'none'
}

/** Distinct fiat currency codes the request names, in first-appearance order. */
export function declaredFiatPairCodes(customerJob: string): readonly string[] {
  const seen: string[] = []
  const present = new Set<string>()
  for (const token of normalizedTokens(customerJob)) {
    if (FIAT_CURRENCY_TOKENS[token] === true && !present.has(token)) {
      present.add(token)
      seen.push(token)
    }
  }
  return seen
}

/** True when a single fiat code is named more than once (e.g. "USD to USD" — same-pair). */
export function fiatCodeRepeated(customerJob: string): boolean {
  const counts = new Map<string, number>()
  for (const token of normalizedTokens(customerJob)) {
    if (FIAT_CURRENCY_TOKENS[token] !== true) continue
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return [...counts.values()].some((count) => count >= 2)
}

// Declared-domain vocabulary keyed off the REGISTRY-TAUGHT surface (the offering searchTerms
// declared on the curated catalog source), not regex over arbitrary free text as the sole signal.
// A searchTerm that names a concrete market is the catalog source declaring which domain the
// capability serves — e.g. CoinGecko declares 'bitcoin price'/'crypto price', Frankfurter declares
// 'exchange rates'/'ecb rates', Bizintel declares 'forex rate'. crypto wins over fiat so a combined
// term like 'bitcoin price in usd' still classes the op as crypto (the asset, not the quote).
const DECLARED_CRYPTO_TERM = /(?:crypto|cryptocur|bitcoin|ethereum|cryptocurrency|coin price|coinmarketcap)/iu
const DECLARED_FIAT_TERM = /(?:exchange rate|forex\b|ecb\b|currency conversion|reference rate|currency pair)/iu

/**
 * The declared domain a capability serves, derived from its own DECLARED data-driven surface
 * first and its surfaced contract text second. A `domain` stamped on the descriptor (from the
 * admission surface) is authoritative — the AI-SDK equivalent of advertising a tool's own
 * schema/description rather than inferring it. Next, the registered discovery vocabulary
 * (`searchTerms`, declared on the curated catalog source) is the moved 'asset/fiat vocabulary'
 * that used to live only in a hard-coded code lexicon: the cross-capability guard now keys off
 * the registry-taught surface instead of regex-scanning description text as the sole source. The
 * name+description regex is only a conservative fallback for descriptors that declare neither.
 */
export function classifyCapabilityDomain(
  descriptor: Readonly<Pick<ServerCapabilityDescriptor, 'name' | 'description' | 'domain' | 'searchTerms'>>,
): CapabilityDomain {
  if (descriptor.domain !== undefined) return descriptor.domain
  return classifyDeclaredCapabilityDomain(
    descriptor.searchTerms ?? [],
    descriptor.name,
    descriptor.description,
  )
}

/**
 * Classifies a capability's domain from its declared registry-taught surface (searchTerms,
 * populated on the curated catalog source) with the live name/description as a conservative
 * fallback. Exported so the request-graph assembly can stamp the resulting `domain` onto the
 * server descriptor once, making the declared domain authoritative for the guard thereafter.
 */
export function classifyDeclaredCapabilityDomain(
  searchTerms: readonly string[],
  name: string,
  description: string,
): CapabilityDomain {
  for (const term of searchTerms) {
    if (DECLARED_CRYPTO_TERM.test(term)) return 'crypto'
    if (DECLARED_FIAT_TERM.test(term)) return 'fiat_fx'
  }
  const text = `${name} ${description}`.toLocaleLowerCase('en')
  const crypto = /(?:crypto|cryptocurrenc|coin)/u.test(text)
  const fiatFx = /(?:ecb\b|forex|exchange rate|reference rate)/u.test(text)
  if (crypto) return 'crypto'
  if (fiatFx) return 'fiat_fx'
  return 'none'
}

/** True only for a direct, observable contradiction between the request and the capability. */
export function capabilityDomainsConflict(
  queryDomain: CapabilityDomain,
  capabilityDomain: CapabilityDomain,
): boolean {
  return (queryDomain === 'crypto' && capabilityDomain === 'fiat_fx')
    || (queryDomain === 'fiat_fx' && capabilityDomain === 'crypto')
}

/**
 * Culls a descriptor pool to capabilities that cannot OBVIOUSLY contradict the request's domain.
 * A `none` request keeps the pool whole; only concrete crypto/fiat-pair contradictions are removed.
 */
export function domainAppropriatePool(
  capabilities: readonly ServerCapabilityDescriptor[],
  customerJob: string,
): readonly ServerCapabilityDescriptor[] {
  const queryDomain = classifyCustomerQueryDomain(customerJob)
  if (queryDomain === 'none') return capabilities
  return capabilities.filter((descriptor) => (
    !capabilityDomainsConflict(queryDomain, classifyCapabilityDomain(descriptor))
  ))
}

/**
 * A capability is an *observed x402 listing* (registered for discovery only; AE does not execute
 * or pay it) when its own surfaced contract says so. Observable from the contract text.
 */
export function isObservedListing(
  descriptor: Readonly<Pick<ServerCapabilityDescriptor, 'name' | 'description'>>,
): boolean {
  return /(?:\(?x402|observed listing|does not execute)/iu.test(`${descriptor.name} ${descriptor.description}`)
}

/**
 * Prefer capabilities AE can actually execute: when an observed x402 listing and a directly
 * routeable capability are both candidate, keep only the routeable one. This mirrors the AI SDK
 * pattern of not surfacing a tool that can't produce a real result. When an observed listing is the
 * ONLY candidate it is kept, so the registered catalog stays visible for discovery.
 */
export function routeablePool(
  capabilities: readonly ServerCapabilityDescriptor[],
): readonly ServerCapabilityDescriptor[] {
  const nonObserved = capabilities.filter((descriptor) => !isObservedListing(descriptor))
  return nonObserved.length > 0 ? nonObserved : capabilities
}
