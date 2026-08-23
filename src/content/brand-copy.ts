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

/** Public market entry (`/`). */
export const HOME = {
  metaTitle: 'APIs and services for agents | Agentic Economy',
  metaDescription: CORE_SENTENCE,
  heroHeading: 'APIs your agent can discover and call.',
  heroSubhead:
    'Search live tools for research, finance, compliance, commerce and more. Compare the price and evidence before your agent makes a call.',
  exampleAsks: [
    'weather forecast',
    'financial market data',
    'extract data from documents',
  ],
} as const

/** Agent/Runtime door on `/` (routes to /for-agents). */
export const AGENT_DOOR = {
  heading: 'Connect your agent',
  body: 'Search and inspect without a key. Connect once when your agent is ready to call a tool.',
  cta: 'Agent setup',
  href: '/for-agents',
} as const

/** Agent/Runtime landing (`/for-agents`) — the machine-facing expression of the market. */
export const AGENT_PAGE = {
  metaTitle: 'Connect your agent | Agentic Economy',
  metaDescription:
    'Search and inspect current Market Operations anonymously, then connect one caller key to invoke and recover work idempotently.',
  eyebrow: 'Agent setup',
  heading: 'Give your agent access to the market.',
  subhead:
    'Browse and compare tools without an account. Connect one caller key only when your agent is ready to invoke a selected Operation.',
} as const

/** Supplier door on `/` (routes to the existing supply mode). */
export const BUSINESS_DOOR = {
  heading: 'List your API or service',
  body: 'Publish the capability, price and access terms agents need to find and choose your tool.',
  cta: 'Supplier setup',
  href: '/for-providers',
} as const
