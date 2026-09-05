/**
 * Brand-core voice strings for primary public surfaces.
 * Functional labels, accessibility copy, and machine descriptors stay with
 * their owning feature modules.
 *
 * Voice: sell Agentic Economy. Agent-first, short, concrete. Price before
 * the call. One connection, one wallet. Named jobs, not internal unit names.
 * Do not invent catalog counts, waitlists, or fees.
 */

/** Canonical category sentence, kept for public metadata rather than the person-facing hero. */
const CORE_SENTENCE =
  'The marketplace built for agents. Discover, compare, and call. Pay per use. No per-provider accounts.'

/** Public market entry (`/`). */
export const HOME = {
  metaTitle: 'The marketplace built for agents | Agentic Economy',
  metaDescription: CORE_SENTENCE,
  heroHeading: 'The marketplace built for agents.',
  heroSubhead:
    'Search first. Inspect the price and access terms. Connect only when the selected call needs it.',
  catalogHeading: 'Current Operations',
  catalogBody: 'Price and readiness are shown before you choose.',
  catalogUnavailable: 'The Operation catalog is temporarily unavailable',
  catalogUnavailableBody: 'Try again shortly. Existing Operation links continue to work.',
  catalogEmpty: 'No Operations are published yet',
  catalogEmptyBody: 'Publish the first bounded job, or check again after suppliers finish setup.',
} as const

export type AgentPasteInstruction = {
  heading: string
  body: string
  label: string
  code: string
  copyText: string
}

/** Market paste on `/`. Do not rewrite `copyText`. */
export const AGENT_INSTRUCTION: AgentPasteInstruction = {
  heading: 'Give this to your agent',
  body: 'One paste. It searches the live catalog, shows the strongest matches, and explains what each one can do now.',
  label: 'agent setup instruction',
  code: 'Search the catalog for my task. Show the best matches, total price, required inputs, and the next valid action.',
  copyText:
    'Read $ORIGIN/llms.txt. Preserve my full task, find viable capabilities, show the real differences, total price, required inputs, and the next valid action. Connect only if a callable capability requires it.',
}

/** Agent/Runtime door on `/` (routes to /for-agents). */
export const AGENT_DOOR = {
  heading: 'For your agent',
  body: 'Browse public Operations. Connect your account when you are ready to make a Call.',
  cta: 'Connect your agent',
  href: '/for-agents',
} as const

/** Agent/Runtime landing (`/for-agents`) — setup for named harnesses, then the market. */
export const AGENT_PAGE = {
  metaTitle: 'Connect your agent | Agentic Economy',
  metaDescription:
    'Find an outside service, compare its terms, and connect Codex, Claude Code or Cursor to make an authorized Call.',
  eyebrow: 'Connections',
  heading: 'Add the market to your agent.',
  harnesses: 'Claude Code, Cursor, and Codex',
  subhead: 'Find the service your task needs. Connect your account, review the terms, and make a Call within the authority you have granted.',
} as const

/** Supplier door on `/` (routes to the existing supply mode). */
export const BUSINESS_DOOR = {
  heading: 'Publish an Operation',
  body: 'Publish one bounded job, its price, readiness, and access terms. Agents inspect before they call.',
  cta: 'Publish an Operation',
  href: '/for-providers',
} as const

/** Company page (`/about`). No team roster, logos, or invented customers. */
export const ABOUT = {
  metaTitle: 'About | Agentic Economy',
  metaDescription: CORE_SENTENCE,
  eyebrow: 'About',
  heading: 'Who this market is for.',
  subhead:
    'Agents find, compare, and call. Suppliers publish the job, the price, and the access terms, and get paid after delivery.',
  doorsHeading: 'Agents and suppliers',
  settlementHeading: 'Pay per call',
  settlementBody:
    'Browse and inspect without a provider account. The price sits on the card before a call. Suppliers are paid when the job is delivered.',
  suppliersHeading: 'Listed suppliers',
  suppliersBody:
    'A supplier is listed when it publishes a job agents can inspect in the live catalog.',
  machinesHeading: 'Files for agents',
  machinesBody: 'The same facts the site shows: an index, a skill file, and a handshake.',
} as const

/** Public footer wordmark line. */
export const FOOTER = {
  tagline: 'The marketplace built for agents.',
} as const
