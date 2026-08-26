/**
 * Brand-core voice strings for primary public surfaces.
 * Functional labels, accessibility copy, and machine descriptors stay with
 * their owning feature modules.
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
    'Browse live tools for research, finance, compliance, commerce and more. Compare the price and evidence before your agent makes a call.',
  claimsHeading: 'What you get',
  catalogHeading: 'Tools in the catalog',
  catalogBody:
    'Current tools with exact price and readiness. Open one to compare Operations.',
  catalogUnavailable:
    'The tool catalog is temporarily unavailable. Open Discover to browse the catalog, or try again shortly.',
  catalogEmpty:
    'No tools are ready right now. Browse all tools, including those that require setup.',
  heroPeek: 'Tools in the catalog',
  faqHeading: 'Questions before you connect',
  closeHeading: 'Set up your agent.',
  closeBody:
    'One instruction is enough. The catalog, the price, and the call sit behind it.',
  doorsHeading: 'Two ways in',
  aboutLink: 'What Agentic Economy is',
} as const

/** Shared agent-paste instruction. Home and `/for-agents` must stay identical. */
export const AGENT_INSTRUCTION = {
  heading: 'Give this to your agent',
  body: 'One instruction is enough. The agent searches the live catalog, compares real differences, shows you the total price and inputs, then calls only the Operation you approve.',
  label: 'agent setup instruction',
  code: 'Find viable capabilities for my task, compare the real differences, show me total price and inputs, then use the one I approve.',
  copyText:
    'Read $ORIGIN/llms.txt. Preserve my full task, find viable capabilities, compare the real differences, show me total price and inputs, then use the one I approve. Connect only if that capability requires it.',
} as const

export const HOME_CLAIMS = [
  {
    number: '01',
    title: 'One connection.',
    body: 'Add one endpoint and every listed Operation is searchable from the same wallet. No per-tool provider accounts.',
  },
  {
    number: '02',
    title: 'Compare before you call.',
    body: 'Price, readiness, and observed evidence sit on the Operation. The agent picks on facts, not a guess.',
  },
  {
    number: '03',
    title: 'Pay per Operation.',
    body: 'Browse and inspect without a provider signup. Connect only when the selected Operation requires it.',
  },
] as const

export const HOME_CLAIM_FIGURES = {
  '01': [
    { term: 'Search', detail: 'Every listed Operation, from one endpoint.' },
    { term: 'Compare', detail: 'Live differences, not a guess.' },
    { term: 'Call', detail: 'Only the Operation you approve.' },
    { term: 'Pay', detail: 'From the same wallet.' },
  ],
  '02': [
    { term: 'Price', detail: 'On the Operation, before the call.' },
    { term: 'Readiness', detail: 'Ready now, or needs setup.' },
    { term: 'Evidence', detail: 'Observed, not inferred.' },
  ],
  '03': [
    { term: 'Browse', detail: 'Free.' },
    { term: 'Inspect', detail: 'Free.' },
    { term: 'Call', detail: 'Priced on the Operation.' },
  ],
} as const

export const HOME_FAQ = [
  {
    question: 'Do I need a provider account to browse?',
    answer:
      'No. Browse and inspect without a signup. Connect only when the selected Operation requires it.',
  },
  {
    question: 'What does a call cost?',
    answer:
      'Price sits on the Operation before you call. You see the total before anything runs.',
  },
  {
    question: 'How does my agent start?',
    answer:
      'Paste one instruction. The agent searches the live catalog, compares real differences, then calls only what you approve.',
  },
  {
    question: 'Can I list my own API?',
    answer:
      'Yes. Publish the capability, price and access terms agents need to find and choose your tool.',
  },
] as const

/** Agent/Runtime door on `/` (routes to /for-agents). */
export const AGENT_DOOR = {
  heading: 'Connect your agent',
  body: 'Search and inspect without a key. Connect once when your agent is ready to call a tool.',
  cta: 'Agent setup',
  href: '/for-agents',
} as const

/** Agent/Runtime landing (`/for-agents`) — the machine-facing expression of the market. */
export const AGENT_PAGE = {
  metaTitle: 'One connection, every capability | Agentic Economy',
  metaDescription:
    'Add one MCP endpoint and your agent can search, compare, call, and pay for every listed Operation from a single wallet. No per-tool provider accounts.',
  eyebrow: 'Connections',
  heading: 'One connection. Every capability.',
  subhead:
    'Add one MCP endpoint and your agent sees a live catalog of Operations with one wallet that can pay for them. No per-tool provider accounts, no separate billing.',
} as const

/** Supplier door on `/` (routes to the existing supply mode). */
export const BUSINESS_DOOR = {
  heading: 'List your API or service',
  body: 'Publish the capability, price and access terms agents need to find and choose your tool.',
  cta: 'Supplier setup',
  href: '/for-providers',
} as const

/** Company page (`/about`). No team roster, logos, or invented customers. */
export const ABOUT = {
  metaTitle: 'About | Agentic Economy',
  metaDescription: CORE_SENTENCE,
  eyebrow: 'About',
  heading: 'A market for agent-callable work.',
  subhead:
    'Agents discover, compare, and call admitted Operations. Suppliers publish the capability, the price, and the access terms, and are paid after contract-valid delivery.',
  doorsHeading: 'Two ways in',
  settlementHeading: 'Pay per Operation',
  settlementBody:
    'Browse and inspect without a provider signup. Price sits on the Operation before a call. Suppliers are paid after the contract for that Operation is met.',
  suppliersHeading: 'Listed suppliers',
  suppliersBody:
    'There is no partner logo wall. A supplier is listed when it publishes an Operation agents can inspect in the live catalog.',
  machinesHeading: 'What machines read',
  machinesBody:
    'The same facts the site shows are published as an index, a skill file, and a machine handshake. Start there instead of guessing a private API.',
} as const
