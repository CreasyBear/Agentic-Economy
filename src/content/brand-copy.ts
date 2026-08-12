/**
 * Brand-core voice strings — the managed source for surfaces that carry the
 * brand's primary voice. Governed by `.planning/BRAND.md` (LOCKED authority):
 * change that file first, then express here once.
 *
 * Scope: ONLY strings with brand-voice weight on primary public surfaces.
 * Functional labels, aria plumbing, and machine descriptors stay with their
 * owners (see `.planning/COPY-MAP.md`). Example asks are furniture — swap
 * them here without a rebrand.
 */

/** Canonical category sentence, kept for public metadata rather than the person-facing hero. */
const CORE_SENTENCE =
  'Agentic Economy is the market and controlled transaction layer where authorized agents discover, buy and invoke admitted third-party Market Operations, and suppliers are paid after contract-valid delivery.'

/** Door 1 — person-facing home (`/`). */
export const HOME = {
  metaTitle: 'Get things done | Agentic Economy',
  metaDescription: CORE_SENTENCE,
  heroHeading: 'Ask. It gets done.',
  heroSubhead:
    'Tell us what you need done. We find the businesses that can help, compare them, and lay out your options.',
  /**
   * Current executable demand demos. Keep these asks machine-resolvable and
   * problem-phrased; they are furniture, not the category definition.
   */
  exampleAsks: [
    'I need the current price of bitcoin',
    'Convert 500 US dollars to euros',
    'What’s the weather like in Melbourne right now?',
    'Summarise the Wikipedia page on quantum computing',
    'Show me a random cat photo',
  ],
} as const

/** Agent/Runtime door on `/` (routes to /for-agents). */
export const AGENT_DOOR = {
  heading: 'Have an agent?',
  body: 'Point your runtime here — discover, compare, buy and invoke admitted Market Operations through one market boundary.',
  cta: 'For agents',
  href: '/for-agents',
} as const

/** Agent/Runtime landing (`/for-agents`) — the machine-facing expression of the market. */
export const AGENT_PAGE = {
  metaTitle: 'Point your agent here | Agentic Economy',
  metaDescription:
    'Search and inspect current Market Operations anonymously, then connect one caller key to invoke and recover work idempotently.',
  eyebrow: 'For agents',
  heading: 'Start with the job, not a credential.',
  subhead:
    'Search and inspect current Operations anonymously. Connect one AE caller key only when you are ready to invoke; provider credentials and consequential authority stay outside that key.',
} as const

/** Supplier door on `/` (routes to /claim). */
export const BUSINESS_DOOR = {
  heading: 'Publish a Market Operation',
  body: 'Host your capability and publish its admitted Market Operation once — authorized agents bring qualified demand.',
  cta: 'For suppliers',
  href: '/claim',
} as const

/** Engine dialog empty-state welcome. */
export const DIALOG_WELCOME = {
  heading: 'What do you need done?',
  subhead:
    'Tell us what you\'re trying to get done. We\'ll check what\'s available and put together your options.',
} as const
