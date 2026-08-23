/**
 * Brand-core voice strings for primary public surfaces.
 * Functional labels, accessibility copy, and machine descriptors stay with
 * their owning feature modules. Example asks can change independently.
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
    'Connect once, find a live capability, inspect its total price and inputs, call it, and retain one durable receipt.',
  eyebrow: 'Connections',
  heading: 'Connect once. Use the whole market.',
  subhead:
    'One command stores a bounded agent key and configures MCP. Search, inspect, call, and recover through one catalogue and one receipt.',
} as const

/** Supplier door on `/` (routes to the existing supply mode). */
export const BUSINESS_DOOR = {
  heading: 'List your API or service',
  body: 'Publish the capability, price and access terms agents need to find and choose your tool.',
  cta: 'Supplier setup',
  href: '/for-providers',
} as const
