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
  body: 'Browse public Tools. Connect your account when you are ready to make a Call.',
  cta: 'Connect an Agent',
  href: '/for-agents',
} as const

/** Agent/Runtime landing (`/for-agents`) — setup for named harnesses, then the market. */
export const AGENT_PAGE = {
  metaTitle: 'Connect your Agent | Agentic Economy',
  metaDescription:
    'Find an outside service, compare its terms, and connect Codex, Claude Code or Cursor to make an authorized Call.',
  eyebrow: 'Connections',
  heading: 'Connect your Agent.',
  subhead: 'We’re building one AUD account for your Agent’s paid Tools, with a Spending policy and purchase records.',
  primaryCta: 'Start setup',
  faqHeading: 'Before you connect',
  faqQuestions: [
    {
      question: 'Do I need to move my Agent into Agentic Economy?',
      answer:
        'No. Your Agent stays in its existing app or framework. Agentic Economy supplies discovery and paid Tool access; your Agent continues to manage the larger task.',
    },
    {
      question: 'Is AUD Credit a crypto wallet?',
      answer:
        'No. AUD Credit belongs to the Business account. It is separate from the settlement mechanics used by x402 Tools.',
    },
    {
      question: 'When can I connect an Agent?',
      answer:
        'Agentic Economy is pre-launch. Public access, funding and purchases are not open yet. The status page tracks availability.',
    },
  ],
  faqStatusLinkLead: 'For current availability, visit our',
  faqStatusLinkLabel: 'status page',
} as const

/** Supplier door on `/` (routes to the existing supply mode). */
export const BUSINESS_DOOR = {
  heading: 'Publish a Tool',
  body: 'Publish one bounded job, its price, readiness, and access terms. Agents inspect before they call.',
  cta: 'Add Tool',
  href: '/for-providers',
} as const

/** Company page (`/about`). No team roster, logos, or invented customers. */
export const ABOUT = {
  metaTitle: 'About | Agentic Economy',
  metaDescription: CORE_SENTENCE,
  eyebrow: 'About',
  heading: 'Tools agents can call.',
  subhead:
    'Agents buy Tools. Providers set prices and receive AUD payouts after completed Calls.',
  doorsHeading: 'Agents and Providers',
  settlementHeading: 'Pay per call',
  settlementBody:
    'Browse and inspect without a Provider account. The price sits on the card before a Call.',
  providersHeading: 'Listed Providers',
  providersBody:
    'A Provider is listed when it publishes a Tool agents can inspect in the current catalogue.',
  machinesHeading: 'Files for agents',
  machinesBody: 'The same facts the site shows: an index, a skill file, and a handshake.',
  heroImage: '/website/terrace-forest.webp',
  editorialLabel: 'Meet the founder',
  editorialTitle: 'Joel Chan',
  editorialDescription:
    'Joel is building Agentic Economy so Australian businesses can offer Tools that Agents call on behalf of their Customers.',
  editorialParagraphs: [
    'His focus is on making that shift practical—giving businesses a way to make their Tools discoverable, deliver work and get paid as more purchasing moves into the hands of Agents acting for Customers.',
    'Joel is part of the 2026 AI Founder Sprint in Perth, delivered by Plus Eight in partnership with Superteam Australia and Solana.',
    'Joel also writes about how Agents are reshaping commerce, accountability and the institutions built around human decisions.',
  ],
  editorialLinks: [
    { label: 'Spacecubed’s founder cohort', href: 'https://blog.spacecubed.com/meet-the-12-exciting-founders-taking-part-in-our-superteam-ai-founder-sprint' },
    { label: 'Read The Agentic Economy →', href: 'https://www.agentic-economy.ai/writing/entry' },
    { label: 'All essays →', href: 'https://www.agentic-economy.ai/writing' },
  ],
  featuresLabel: 'How it works',
  featuresHeading: 'New possibilities. Clear responsibilities.',
  features: [
    {
      title: 'Permission before spending',
      description: 'Your business chooses what an Agent may buy and how much it may spend. Available Credit does not grant authority.',
    },
    {
      title: 'Evidence after the Call',
      description: 'Keep the price, delivered result and next step together. A successful charge alone does not prove delivery.',
    },
    {
      title: 'A familiar business starting point',
      description: 'AUD Credit, explicit spending controls and understandable usage records shape the experience we’re building for Australian businesses.',
    },
    {
      title: 'Your Agent. Your way of working.',
      description: 'Your chosen Agent, apps and frameworks keep the surrounding task. Agentic Economy focuses on finding, buying and recording the Tool.',
    },
  ],
  ctaHeading: 'Building it. Sharing the journey.',
  ctaDescription: 'Agentic Economy is pre-launch.',
  operatorLine: {
    prefix: 'Operated in Australia',
    separator: ' · ',
  },
  ctaPrimary: 'Browse Tools',
} as const

/** Public footer wordmark line. */
export const FOOTER = {
  tagline: 'The marketplace built for agents.',
  copyright: (year: number) => `© ${year} Agentic Economy`,
} as const

/**
 * Public surface (landing, browse, tool pages, site header and footer).
 * Lead with what x402 opens up: breadth and things you can now do.
 * Counts are never written here; pass live numbers in from data or omit them.
 */
export const BRAND_NAME = 'aecon'

export const PUBLIC_SURFACE = {
  /** Swap the headline here only. */
  headline: 'Every paid API, one call at a time.',
  subhead:
    'Thousands of APIs, data feeds and services for AI agents, each paid per call. No subscription, and no account with each provider.',
  searchLabel: 'Search tools',
  /** `count` is a live, already formatted number from the registry (for example "15,214"). */
  searchPlaceholder: (count?: string) => (count ? `Search ${count} tools` : 'Search tools'),
  browseAll: 'Browse all tools',
  pricePerCall: (price: string) => `${price} per call`,
  sample: 'Sample',
  signInToRun: 'Sign in to run it',
} as const

/** Public site header. Destinations live with the header; labels live here. */
export const SITE_NAV = {
  label: 'Main',
  tools: 'Tools',
  docs: 'Docs',
  providers: 'For providers',
  signIn: 'Sign in',
} as const

/** Public site footer. */
export const SITE_FOOTER = {
  tagline: PUBLIC_SURFACE.headline,
  productTitle: 'Product',
  companyTitle: 'Company',
  agentsTitle: 'For agents',
  about: 'About',
  trust: 'Trust centre',
  status: 'Status',
  support: 'Support',
  privacy: 'Privacy',
  terms: 'Terms',
  removeListing: 'Remove a listing',
} as const
