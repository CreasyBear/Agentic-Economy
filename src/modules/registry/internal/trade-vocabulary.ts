/**
 * Customers search by the practitioner noun ("electrician", "sparky"); businesses
 * publish the service noun ("Electrical repairs"). Without a bridge, the most
 * natural query for a trade returns nothing.
 *
 * This table is the single source for that bridge. Both the index-side keyword
 * expansion and the query-side token normalisation read it, so the two cannot
 * drift apart — which is exactly how `electrician` came to return zero results
 * while `electrical` returned nine: expansion was keyed on the practitioner noun
 * that published supply never contains.
 */
export type TradeVocabularyEntry = Readonly<{
  /** Token every alias normalises to, and the word published supply actually contains. */
  canonical: string
  /** Everything a customer might type for this trade. */
  aliases: readonly string[]
  /** Problem words a customer types instead of naming the trade. */
  symptoms: readonly string[]
}>

/**
 * `symptoms` are the words a customer in trouble actually types. Nobody with
 * water across the floor searches "plumbing" — they search "burst pipe". They
 * resolve to the same canonical trade as the aliases, but are kept separate so
 * it stays obvious which words are the trade and which are the problem.
 */
export const TRADE_VOCABULARY: readonly TradeVocabularyEntry[] = [
  {
    canonical: 'plumbing',
    aliases: ['plumber', 'plumbers', 'plumbing'],
    symptoms: ['burst', 'pipe', 'pipes', 'drain', 'drains', 'leak', 'leaking', 'blocked', 'toilet', 'tap', 'taps', 'sewer'],
  },
  {
    canonical: 'electrical',
    aliases: ['electrician', 'electricians', 'electrical', 'sparky', 'sparkie'],
    symptoms: ['powerpoint', 'switchboard', 'wiring', 'fuse', 'blackout', 'socket'],
  },
  { canonical: 'locksmith', aliases: ['locksmith', 'locksmiths'], symptoms: ['locked', 'lockout', 'keys', 'deadbolt'] },
  { canonical: 'dental', aliases: ['dentist', 'dentists', 'dental'], symptoms: ['toothache', 'tooth', 'filling', 'crown'] },
  {
    canonical: 'accounting',
    aliases: ['accountant', 'accountants', 'accounting', 'bookkeeper', 'bookkeeping'],
    symptoms: ['bas', 'tax', 'payroll', 'gst'],
  },
  { canonical: 'cleaning', aliases: ['cleaner', 'cleaners', 'cleaning'], symptoms: ['bond', 'vacate', 'tidy'] },
  { canonical: 'tutoring', aliases: ['tutor', 'tutors', 'tutoring', 'tuition'], symptoms: ['maths', 'homework', 'exam'] },
  {
    canonical: 'hvac',
    aliases: ['hvac', 'aircon', 'airconditioning', 'heating', 'cooling'],
    symptoms: ['ducted', 'thermostat', 'refrigerant'],
  },
  { canonical: 'mechanic', aliases: ['mechanic', 'mechanics', 'mechanical'], symptoms: ['rego', 'roadworthy', 'brakes', 'engine'] },
  { canonical: 'lawyer', aliases: ['lawyer', 'lawyers', 'solicitor', 'solicitors', 'legal'], symptoms: ['conveyancing', 'custody', 'probate'] },
]

const aliasToCanonical = new Map<string, string>(
  TRADE_VOCABULARY.flatMap((entry) =>
    [...entry.aliases, ...entry.symptoms].map((word) => [word, entry.canonical] as const)),
)


/** Every alias is a legitimate trade word, so no alias may be mistaken for a place name. */
export const TRADE_WORDS: ReadonlySet<string> = new Set(aliasToCanonical.keys())

/** Collapses any way a customer names a trade onto the word published supply carries. */
export function canonicalTradeToken(token: string): string {
  return aliasToCanonical.get(token) ?? token
}

/**
 * Aliases to store on an indexed document so a backend doing plain substring
 * matching — such as the Convex search path, which has no synonym support —
 * still resolves a practitioner-noun query.
 */
export function tradeAliasesForText(normalizedText: string): readonly string[] {
  const aliases = new Set<string>()
  for (const entry of TRADE_VOCABULARY) {
    const mentioned = entry.canonical === 'hvac'
      ? entry.aliases.some((alias) => normalizedText.includes(alias))
      : new RegExp(`\\b${entry.canonical}`).test(normalizedText)
        || entry.aliases.some((alias) => new RegExp(`\\b${alias}\\b`).test(normalizedText))
    if (!mentioned) continue
    for (const alias of entry.aliases) aliases.add(alias)
  }
  return [...aliases].sort()
}

/** Canonical trade tokens, used to detect that a query names a trade at all. */
export const TRADE_CANONICAL_TOKENS: ReadonlySet<string> = new Set(
  TRADE_VOCABULARY.map((entry) => entry.canonical),
)
