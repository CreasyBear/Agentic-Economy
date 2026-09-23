/** Frozen design-system journey cases. Labels score sibling-of-discover grammar,
 * not matching intelligence. Jev evals stay out of this file.
 * SoT class strings are copied from DirectoryHero / DirectoryHomeDiscovery /
 * DirectoryToolCard and must not be "corrected."
 */

export const dsGrammarFrozenAt = '2026-09-21'

export type DsDialect = 'editorial-discover' | 'compact-discover'
export type DsProductJourney = 1 | 2 | 3 | 4 | 5 | 6 | 'supporting'
export type DsSurfaceState = 'default' | 'empty' | 'error'

export type DsLandmark = Readonly<{
  role: 'eyebrow' | 'display' | 'deck' | 'rail' | 'card' | 'title'
  expectedClass?: string
  note: string
}>

export type DsJourneyCase = Readonly<{
  id: string
  route: string
  dialect: DsDialect
  productJourney: DsProductJourney
  sot: boolean
  landmarks: readonly DsLandmark[]
  forbidden: readonly string[]
  states: readonly DsSurfaceState[]
}>

const DISCOVER_EYEBROW = 'text-xs font-medium tracking-[0.12em] text-muted-foreground'
const DISCOVER_DISPLAY =
  'max-w-xl text-[2.75rem] leading-[1.02] font-extralight tracking-[-0.055em] lg:text-6xl xl:text-7xl'
const DISCOVER_DECK = 'max-w-lg text-sm leading-relaxed text-muted-foreground lg:text-base'
const DISCOVER_KICKER = 'mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground'
const DISCOVER_COLLECTION_TITLE = 'text-2xl font-medium tracking-tight sm:text-3xl'
const DISCOVER_PILL = 'rounded-full border-border/70 bg-card'
const DISCOVER_CARD =
  'border border-border/70 p-0 shadow-none transition-[box-shadow,transform] duration-200 hover:-translate-y-1 hover:shadow-float'
const DISCOVER_CARD_TITLE = 'text-lg font-semibold leading-snug tracking-tight'

const EDITORIAL_FORBIDDEN = [
  'SiteMarker product eyebrow',
  'font-bold page title',
  'centered AeSiteHeroIntro default',
  '01 icon-card grid as page structure',
  'generic shadow-md product card',
] as const

const COMPACT_FORBIDDEN = [
  'SiteMarker product eyebrow',
  'font-bold page title',
  '7xl hero',
  'ink panel on a routine record',
  'generic shadow-md product card',
] as const

const editorial = (
  id: string,
  route: string,
  productJourney: DsProductJourney,
  extra: Partial<Pick<DsJourneyCase, 'sot' | 'landmarks' | 'states'>> = {},
): DsJourneyCase => ({
  id,
  route,
  dialect: 'editorial-discover',
  productJourney,
  sot: extra.sot === true,
  landmarks: extra.landmarks ?? [
    { role: 'eyebrow', expectedClass: DISCOVER_EYEBROW, note: 'Medium tracked uppercase, no marker.' },
    { role: 'display', expectedClass: DISCOVER_DISPLAY, note: 'ExtraLight left display.' },
    { role: 'deck', expectedClass: DISCOVER_DECK, note: 'Muted relaxed deck.' },
  ],
  forbidden: EDITORIAL_FORBIDDEN,
  states: extra.states ?? ['default'],
})

const compact = (
  id: string,
  route: string,
  productJourney: DsProductJourney,
  extra: Partial<Pick<DsJourneyCase, 'states'>> = {},
): DsJourneyCase => ({
  id,
  route,
  dialect: 'compact-discover',
  productJourney,
  sot: false,
  landmarks: [
    { role: 'title', note: 'Medium workbench title, not font-bold, not 7xl.' },
    { role: 'deck', note: 'Muted caption or body-sm description.' },
  ],
  forbidden: COMPACT_FORBIDDEN,
  states: extra.states ?? ['default'],
})

export const DS_JOURNEY_CASES: readonly DsJourneyCase[] = [
  {
    id: 'discover-sot',
    route: '/market?view=discover',
    dialect: 'editorial-discover',
    productJourney: 1,
    sot: true,
    landmarks: [
      { role: 'eyebrow', expectedClass: DISCOVER_EYEBROW, note: 'THE TOOL MARKET' },
      { role: 'display', expectedClass: DISCOVER_DISPLAY, note: 'Tools for what’s next.' },
      { role: 'deck', expectedClass: DISCOVER_DECK, note: 'Search the web…' },
      { role: 'rail', expectedClass: `${DISCOVER_KICKER} | ${DISCOVER_COLLECTION_TITLE} | ${DISCOVER_PILL}`, note: 'Collection rails' },
      { role: 'card', expectedClass: `${DISCOVER_CARD} | ${DISCOVER_CARD_TITLE}`, note: 'Listing card + semibold title' },
    ],
    forbidden: EDITORIAL_FORBIDDEN,
    states: ['default', 'empty'],
  },
  editorial('home', '/market', 1),
  editorial('for-agents', '/for-agents', 3),
  editorial('for-providers', '/for-providers', 4),
  editorial('about', '/about', 'supporting'),
  editorial('support', '/support', 'supporting'),
  editorial('privacy', '/privacy', 'supporting'),
  editorial('terms', '/terms', 'supporting'),
  editorial('remove-business', '/privacy/remove-business', 'supporting'),
  editorial('developers-api', '/developers/api', 'supporting'),
  editorial('developers-discovery', '/developers/discovery', 'supporting'),
  editorial('status', '/status', 'supporting'),
  editorial('onboarding', '/onboarding', 3),
  editorial('sign-in', '/sign-in', 'supporting'),
  editorial('tool-detail', '/tools/$providerHost/$slug', 2, { states: ['default'] }),
  editorial('provider-listing', '/$slug', 4),
  editorial('market-search', '/market?view=tools', 1, { states: ['default', 'empty'] }),
  editorial('market-compare', '/market?view=tools', 2, { states: ['default'] }),
  editorial('market-providers', '/market?view=providers', 4),
  editorial('market-saved', '/market?view=saved', 6, { states: ['default', 'empty'] }),
  compact('workspace', '/owner', 6),
  compact('credit', '/owner/credit', 3),
  compact('settings', '/owner/settings', 'supporting'),
  compact('team', '/owner/team', 'supporting'),
  compact('operations', '/owner/operations', 4, { states: ['default', 'empty'] }),
  compact('operations-tool', '/owner/operations/$toolRef', 4),
  compact('connections', '/owner/supply/connections/new', 4),
  compact('calls', '/activity', 6, { states: ['default', 'empty'] }),
  compact('call-receipt', '/calls/$callRef', 6),
  compact('agent-access', '/agent-access', 3),
  compact('admin-health', '/admin/index-health', 'supporting'),
  compact('admin-audit', '/admin/audit-events', 'supporting'),
  compact('chat', '/t/new', 'supporting'),
  compact('command', '/market', 'supporting'),
  compact('key-reveal', '/agent-access', 3),
]

export function dsJourneyCaseById(id: string): DsJourneyCase {
  const found = DS_JOURNEY_CASES.find(item => item.id === id)
  if (found === undefined) throw new Error(`unknown_ds_journey_case:${id}`)
  return found
}

export function dsSotCases(): readonly DsJourneyCase[] {
  return DS_JOURNEY_CASES.filter(item => item.sot)
}

export function validateDsJourneyCases(cases: readonly DsJourneyCase[]): readonly DsJourneyCase[] {
  const ids = cases.map(item => item.id)
  if (new Set(ids).size !== ids.length) throw new Error('duplicate_ds_case_id')
  const sot = cases.filter(item => item.sot)
  if (sot.length !== 1 || sot[0]?.id !== 'discover-sot') throw new Error('sot_must_be_discover_only')
  for (const item of cases) {
    if (item.sot && item.route !== '/market?view=discover') throw new Error(`sot_route:${item.id}`)
    if (item.landmarks.length === 0) throw new Error(`landmarks_required:${item.id}`)
    if (item.forbidden.length === 0) throw new Error(`forbidden_required:${item.id}`)
  }
  return cases
}
