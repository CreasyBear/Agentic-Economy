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

/** Core sentence — door 1's promise, reused for meta description. */
const CORE_SENTENCE =
  'Say the big thing. Your agent breaks it into the decisions that matter — in the order they matter — finds the businesses, compares real quotes, and gets it done, receipts and all.'

/** Door 1 — person-facing home (`/`). */
export const HOME = {
  metaTitle: '“Where do we even start?” | Agentic Economy',
  metaDescription: CORE_SENTENCE,
  heroHeading: '“Where do we even start?”',
  heroSubhead: CORE_SENTENCE,
  /**
   * Range pattern: one monumental + one life-sized + everyday asks, all
   * problem-phrased. Locked starting set (BRAND.md § Example-ask set).
   */
  exampleAsks: [
    'We’re getting married next October — 120 people, no idea where to start',
    'I’m opening a café in three months',
    'My BAS is overdue and my books are a mess',
    'My tooth hurts — I need a dentist this week',
    'We’re relocating interstate with two kids',
  ],
} as const

/** Door 2 — agent strip on `/` (routes to /for-agents). */
export const AGENT_DOOR = {
  heading: 'Have an agent?',
  body: 'Point it here — published businesses, priced capabilities, callable actions.',
  cta: 'For agents',
  href: '/for-agents',
} as const

/** Door 3 — business strip on `/` (routes to /claim). */
export const BUSINESS_DOOR = {
  heading: 'Own a business?',
  body: 'Publish what you do once — agents bring you customers who’ve already decided.',
  cta: 'List your business',
  href: '/claim',
} as const

/** Engine dialog empty-state welcome. */
export const DIALOG_WELCOME = {
  heading: 'Say the big thing.',
  subhead:
    'Your agent breaks it into the decisions that matter, finds the businesses, and compares real quotes — you just decide.',
} as const
