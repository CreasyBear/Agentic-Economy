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
  catalogBody: 'Current Operations, priced before the call. Open one to compare.',
  catalogUnavailable: 'The Operation catalog is temporarily unavailable',
  catalogUnavailableBody: 'Try again shortly. Existing Operation links continue to work.',
  catalogEmpty: 'No Operations are available right now',
  catalogEmptyBody: 'Browse the current catalog, including Operations that still need setup.',
  closeBody: 'Paste one instruction. Your agent gets the catalog, the price, and the call.',
  aboutLink: 'About',
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
  body: 'One paste. It searches the live catalog, compares, shows the price, then calls only what you approve.',
  label: 'agent setup instruction',
  code: 'Search the catalog for my task. Compare. Show total price and inputs. Then use the one I approve.',
  copyText:
    'Read $ORIGIN/llms.txt. Preserve my full task, find viable capabilities, compare the real differences, show me total price and inputs, then use the one I approve. Connect only if that capability requires it.',
}

/** Setup paste on `/for-agents`. Connect first. Then the market loop. */
export const AGENT_SETUP_INSTRUCTION: AgentPasteInstruction = {
  heading: 'Set this up with your agent',
  body: 'Paste this. Claude Code, Cursor, or Codex connects once, then can search the catalog and pay per call.',
  label: 'agent setup instruction',
  code: 'Help me connect to Agentic Economy. One connection for Claude Code, Cursor, or Codex. Then I can search, compare, and call from this wallet.',
  copyText:
    'Help me connect to Agentic Economy at $ORIGIN. Read $ORIGIN/llms.txt and $ORIGIN/SKILL.md. Add $ORIGIN/mcp so Claude Code, Cursor, or Codex can use one connection. After it is connected, preserve my full task, search the live catalog, compare, show total price and inputs, then use the one I approve. Connect the wallet only if that call requires it. Do not create per-provider accounts.',
}

/** Agent/Runtime door on `/` (routes to /for-agents). */
export const AGENT_DOOR = {
  heading: 'For your agent',
  body: 'Search and inspect without a key. Connect once when a call needs it.',
  cta: 'Connect your agent',
  href: '/for-agents',
} as const

/** Agent/Runtime landing (`/for-agents`) — setup for named harnesses, then the market. */
export const AGENT_PAGE = {
  metaTitle: 'One connection, every tool | Agentic Economy',
  metaDescription:
    'Claude Code, Cursor, and Codex connect once. Then search, compare, and call listed tools from one wallet. No per-provider accounts.',
  eyebrow: 'Connections',
  heading: 'One connection. Every tool.',
  harnesses: 'Claude Code, Cursor, and Codex',
  subhead: 'One connection. Then the catalog and a wallet.',
} as const

/** Supplier door on `/` (routes to the existing supply mode). */
export const BUSINESS_DOOR = {
  heading: 'List your tool',
  body: 'Publish the job, the price, and the access terms. Agents compare before they call.',
  cta: 'List a tool',
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
