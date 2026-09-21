/** Design-system grammar harness. Scores sibling-of-discover recipes.
 * Not a Jev inference experiment. SoT class strings are law, not defects.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { findFiles, type ScanTarget } from '../../src/lib/ui/contract-scans'
import { DS_JOURNEY_CASES, validateDsJourneyCases, type DsJourneyCase } from './ds-journey-cases'

export const DS_SOT_FILES = [
  'src/components/ae/market/DirectoryHero.tsx',
  'src/components/ae/market/DirectoryHomeDiscovery.tsx',
  'src/components/ae/market/DirectoryToolCard.tsx',
] as const

export const DS_SOT_STRINGS = {
  heroEyebrow: 'text-xs font-medium tracking-[0.12em] text-muted-foreground',
  heroDisplay: 'max-w-xl text-[2.75rem] leading-[1.02] font-extralight tracking-[-0.055em] lg:text-6xl xl:text-7xl',
  heroDeck: 'max-w-lg text-sm leading-relaxed text-muted-foreground lg:text-base',
  collectionKicker: 'text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground',
  collectionTitle: 'text-2xl font-medium tracking-tight sm:text-3xl',
  collectionPill: 'rounded-full border-border/70 bg-card',
  cardLift: 'hover:-translate-y-1 hover:shadow-float',
  cardTitle: 'text-lg font-semibold leading-snug tracking-tight',
} as const

export const DS_LEGAL = [
  'font-semibold',
  'rounded-full',
  '-translate-y-1',
  'shadow-float',
  'tracking-[0.12em]',
  'tracking-[0.14em]',
  'font-extralight',
  'uppercase',
] as const

/** Counted ceilings. Lower in DS-33; never raise. */
export const DS_RATCHET = {
  fontBoldTitles: 0,
  siteMarkerProductEyebrows: 0,
  genericShadowMdProductCards: 0,
  centeredPublicHeroIntro: 0,
  mxAutoAgentFunnelWells: 0,
  numberedStepProductEyebrows: 0,
  inkPublicEditorialHeroes: 0,
} as const

const productUiTargets: readonly ScanTarget[] = [
  { root: 'src/components/ae', includeExtensions: ['.ts', '.tsx'] },
  { root: 'src/routes', includeExtensions: ['.ts', '.tsx'] },
]

const sotFileSuffixes = new Set(
  DS_SOT_FILES.map(relative => relative.replace(/^src\//, '')),
)

function isSotProductFile(file: string): boolean {
  return [...sotFileSuffixes].some(suffix => file.endsWith(suffix))
}

function isDiscoverLegalContext(snippet: string): boolean {
  if (DS_SOT_STRINGS.heroEyebrow.split(' ').every(part => snippet.includes(part))) {
    return true
  }
  if (DS_SOT_STRINGS.collectionKicker.split(' ').every(part => snippet.includes(part))) {
    return true
  }
  return DS_LEGAL.some(token => snippet.includes(token)) &&
    (snippet.includes('uppercase') || snippet.includes('font-extralight') || snippet.includes('shadow-float'))
}

export type DsHit = Readonly<{ file: string; line: number; excerpt: string }>

function repoRoot(): string {
  return process.cwd()
}

export function readSotSource(relativePath: (typeof DS_SOT_FILES)[number]): string {
  return readFileSync(join(repoRoot(), relativePath), 'utf8')
}

export function missingSotStrings(): readonly string[] {
  const missing: string[] = []
  const hero = readSotSource('src/components/ae/market/DirectoryHero.tsx')
  const rails = readSotSource('src/components/ae/market/DirectoryHomeDiscovery.tsx')
  const card = readSotSource('src/components/ae/market/DirectoryToolCard.tsx')
  const required: ReadonlyArray<readonly [string, string]> = [
    [hero, DS_SOT_STRINGS.heroEyebrow],
    [hero, DS_SOT_STRINGS.heroDisplay],
    [hero, DS_SOT_STRINGS.heroDeck],
    [rails, DS_SOT_STRINGS.collectionKicker],
    [rails, DS_SOT_STRINGS.collectionTitle],
    [rails, DS_SOT_STRINGS.collectionPill],
    [card, DS_SOT_STRINGS.cardLift],
    [card, DS_SOT_STRINGS.cardTitle],
  ]
  for (const [source, needle] of required) {
    if (!source.includes(needle)) missing.push(needle)
  }
  return missing
}

function scanHits(pattern: RegExp): readonly DsHit[] {
  const files = findFiles(productUiTargets.map(target => ({ ...target })))
  const hits: DsHit[] = []
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    for (const [index, line] of lines.entries()) {
      if (pattern.test(line)) {
        hits.push({ file, line: index + 1, excerpt: line.trim() })
      }
    }
  }
  return hits
}

const cnClassPattern = /className\s*=\s*\{cn\([\s\S]{0,800}?\)\}/g
const heroIntroCenterPattern =
  /<AeSiteHeroIntro\b[\s\S]{0,400}?(?:items-center|text-center)|AeSiteHeroIntro[\s\S]{0,120}?className\s*=\s*(?:\{cn\([\s\S]{0,400}?(?:items-center|text-center)|"[^"]*(?:items-center|text-center))/

export function fontBoldTitleHits(): readonly DsHit[] {
  const files = findFiles(productUiTargets.map(target => ({ ...target })))
  const hits: DsHit[] = []
  for (const file of files) {
    if (isSotProductFile(file)) {
      continue
    }
    const content = readFileSync(file, 'utf8')
    const lines = content.split(/\r?\n/)
    for (const [index, line] of lines.entries()) {
      if (!line.includes('font-bold')) {
        continue
      }
      const window = lines.slice(Math.max(0, index - 10), Math.min(lines.length, index + 11)).join('\n')
      if (isDiscoverLegalContext(window)) {
        continue
      }
      const inlineTitle =
        /<h[12]\b[^>]*font-bold/.test(line) ||
        (/<h[12]\b/.test(window) && /font-bold/.test(window))
      const quotedBold =
        /className="[^"]*font-bold[^"]*"/.test(line) &&
        /<h[12]\b/.test(window)
      let cnBold = false
      for (const match of window.matchAll(cnClassPattern)) {
        const block = match[0]
        if (!block.includes('font-bold')) {
          continue
        }
        if (/<h[12]\b/.test(window) || /text-(?:2xl|3xl|4xl|5xl|6xl|7xl)/.test(block)) {
          cnBold = true
          break
        }
      }
      if (inlineTitle || quotedBold || cnBold) {
        hits.push({ file, line: index + 1, excerpt: line.trim() })
      }
    }
  }
  return hits
}

export function siteMarkerProductEyebrowHits(): readonly DsHit[] {
  return scanHits(/AeSiteEyebrow[\s\S]{0,200}SiteMarker|SiteMarker[\s\S]{0,80}ae-site-eyebrow/)
}

export function genericShadowMdProductCardHits(): readonly DsHit[] {
  return scanHits(/shadow-md/)
}

export function mxAutoAgentFunnelWellHits(): readonly DsHit[] {
  const hits: DsHit[] = []
  const pattern =
    /mx-auto[\s\S]{0,120}max-w-5xl[\s\S]{0,240}AeAssistantInstallFunnel|max-w-5xl[\s\S]{0,240}AeAssistantInstallFunnel/
  const files = findFiles(productUiTargets.map(target => ({ ...target })))
  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    if (!content.includes('AeAssistantInstallFunnel')) {
      continue
    }
    if (!pattern.test(content)) {
      continue
    }
    const lines = content.split(/\r?\n/)
    const index = lines.findIndex(line => line.includes('max-w-5xl') || line.includes('mx-auto'))
    hits.push({
      file,
      line: index === -1 ? 1 : index + 1,
      excerpt: (lines[index === -1 ? 0 : index] ?? '').trim(),
    })
  }
  return hits
}

export function numberedStepProductEyebrowHits(): readonly DsHit[] {
  return scanHits(/AeSiteEyebrow>\{step\.number\}/)
}

export function inkPublicEditorialHeroHits(): readonly DsHit[] {
  return scanHits(/<AeSiteSection\b[^>]*rhythm="hero"[^>]*scheme="ink"|scheme="ink"[^>]*rhythm="hero"/)
}

export function centeredPublicHeroIntroHits(): readonly DsHit[] {
  const hits: DsHit[] = []
  const files = findFiles(productUiTargets.map(target => ({ ...target })))
  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    if (!content.includes('AeSiteHeroIntro')) {
      continue
    }
    if (!heroIntroCenterPattern.test(content)) {
      continue
    }
    const lines = content.split(/\r?\n/)
    for (const [index, line] of lines.entries()) {
      if (!line.includes('AeSiteHeroIntro')) {
        continue
      }
      const window = lines.slice(index, Math.min(lines.length, index + 12)).join('\n')
      if (heroIntroCenterPattern.test(window)) {
        hits.push({ file, line: index + 1, excerpt: line.trim() })
        break
      }
    }
  }
  return hits
}

export function censusRecipe(pattern: RegExp): { files: number; hits: number } {
  const files = findFiles(productUiTargets.map(target => ({ ...target })))
  const touched = new Set<string>()
  let hits = 0
  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    const matches = content.match(pattern)
    if (matches !== null && matches.length > 0) {
      touched.add(file)
      hits += matches.length
    }
  }
  return { files: touched.size, hits }
}

export function journeyCases(): readonly DsJourneyCase[] {
  return validateDsJourneyCases(DS_JOURNEY_CASES)
}

/** DS-18 harvest budget — public tool detail + provider listing. */
export const DS_18_SOURCE_FILES = [
  'src/components/ae/market/public-tool-detail/PublicToolDetail.tsx',
  'src/components/ae/market/public-tool-detail/AeDirectoryToolCanonicalPage.tsx',
  'src/components/ae/market/public-tool-detail/MarketBackButton.tsx',
  'src/components/ae/market/tool-detail/AeToolInspector.tsx',
  'src/components/ae/market/tool-detail/AeToolIdentity.tsx',
  'src/components/ae/market/tool-detail/AeToolDecision.tsx',
  'src/components/ae/market/tool-detail/AeToolNextAction.tsx',
  'src/components/ae/market/tool-detail/AeToolFacts.tsx',
  'src/components/ae/market/tool-detail/AeToolPosition.tsx',
  'src/components/ae/market/tool-detail/AeToolEconomics.tsx',
  'src/components/ae/market/tool-detail/AeToolTrackRecord.tsx',
  'src/components/ae/market/tool-detail/AeToolContractSections.tsx',
  'src/components/ae/listing/AeProviderListingPage.tsx',
  'src/components/ae/listing/public-business/AePublicBusiness.tsx',
] as const

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot(), relativePath), 'utf8')
}

export function ds18PublicToolWorkspaceKindViolations(): readonly string[] {
  const detailFiles = [
    'src/components/ae/market/public-tool-detail/PublicToolDetail.tsx',
    'src/components/ae/market/public-tool-detail/AeDirectoryToolCanonicalPage.tsx',
  ] as const
  const violations: string[] = []
  for (const file of detailFiles) {
    if (readRepoFile(file).includes('kind="workspace"')) {
      violations.push(`${file}: kind="workspace"`)
    }
  }
  return violations
}

export function ds18InkNextActionSlabViolations(): readonly string[] {
  const source = readRepoFile('src/components/ae/market/tool-detail/AeToolNextAction.tsx')
  const inkAside =
    /<aside\b[\s\S]{0,600}?className="[^"]*bg-foreground/.test(source) ||
    /<aside\b[\s\S]{0,600}?bg-foreground[\s\S]{0,200}?text-background/.test(source)
  return inkAside ? ['src/components/ae/market/tool-detail/AeToolNextAction.tsx: ink next-action slab'] : []
}

export function ds18SiteMarkerViolations(): readonly DsHit[] {
  const hits: DsHit[] = []
  for (const relative of DS_18_SOURCE_FILES) {
    const file = join(repoRoot(), relative)
    const lines = readRepoFile(relative).split(/\r?\n/)
    for (const [index, line] of lines.entries()) {
      if (line.includes('SiteMarker')) {
        hits.push({ file, line: index + 1, excerpt: line.trim() })
      }
    }
  }
  return hits
}

export function ds18CenteredPublicErrorActionViolations(): readonly string[] {
  const file = 'src/components/ae/listing/public-business/AePublicBusiness.tsx'
  const source = readRepoFile(file)
  return source.includes('sm:justify-center') ? [`${file}: sm:justify-center on error actions`] : []
}

/** DS-19 harvest budget — market search / compare / providers / saved. */
export const DS_19_SOURCE_FILES = [
  'src/components/ae/market/AeMarketPage.tsx',
  'src/components/ae/market/AeX402Directory.tsx',
  'src/components/ae/market/DirectoryIndexDiscovery.tsx',
  'src/components/ae/market/DirectoryProvidersIndex.tsx',
  'src/components/ae/market/DirectoryProviderCards.tsx',
  'src/components/ae/market/DirectoryExplorerFilters.tsx',
  'src/components/ae/market/DirectoryFilters.tsx',
  'src/components/ae/market/DirectoryProviderHeader.tsx',
  'src/components/ae/market/DirectoryComparison.tsx',
] as const

const ds19MarketScanRoots = ['src/components/ae/market'] as const

function marketProductFilesExcludingSot(): readonly string[] {
  return findFiles([{ root: ds19MarketScanRoots[0], includeExtensions: ['.ts', '.tsx'] }]).filter(
    file => !isSotProductFile(file),
  )
}

function lineWindow(lines: readonly string[], index: number, before = 2, after = 2): string {
  return lines.slice(Math.max(0, index - before), Math.min(lines.length, index + after + 1)).join('\n')
}

export function ds19NonSotMarketShadowMdHits(): readonly DsHit[] {
  const hits: DsHit[] = []
  for (const file of marketProductFilesExcludingSot()) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    for (const [index, line] of lines.entries()) {
      if (line.includes('shadow-md')) {
        hits.push({ file, line: index + 1, excerpt: line.trim() })
      }
    }
  }
  return hits
}

export function ds19NonSotMarketFontBoldTitleHits(): readonly DsHit[] {
  return fontBoldTitleHits().filter(hit => hit.file.includes('/market/') && !isSotProductFile(hit.file))
}

/** Raw `text-[10px]` provider hostname kickers (SoT collection kicker in DirectoryHomeDiscovery stays legal). */
export function ds19NonSotMarketRawTenPxProviderKickerHits(): readonly DsHit[] {
  const hits: DsHit[] = []
  const pattern = /text-\[10px\]/
  const providerCue = /PROVIDER\s+HOSTNAME|Provider hostname|Globe2/
  for (const file of marketProductFilesExcludingSot()) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    for (const [index, line] of lines.entries()) {
      if (!pattern.test(line)) {
        continue
      }
      const window = lineWindow(lines, index, 3, 3)
      if (providerCue.test(window)) {
        hits.push({ file, line: index + 1, excerpt: line.trim() })
      }
    }
  }
  return hits
}

/** DS-15 harvest budget — support, privacy, terms, remove-business document pages. */
export const DS_15_SOURCE_FILES = [
  'src/components/ae/support/help/AeSupportHelpPage.tsx',
  'src/components/ae/support/help/components/SupportStatusSection.tsx',
  'src/components/ae/support/help/components/AgentConnectionSection.tsx',
  'src/components/ae/support/help/components/PrivateSupportSection.tsx',
  'src/components/ae/support/help/components/ReferencedCallBanner.tsx',
  'src/components/ae/legal/privacy/AePrivacyPage.tsx',
  'src/components/ae/legal/privacy/components/PrivacyDetailCards.tsx',
  'src/components/ae/legal/privacy/components/PrivacyMomentTabs.tsx',
  'src/components/ae/legal/privacy/components/PrivacyCorrectionCta.tsx',
  'src/components/ae/legal/terms/AeTermsPage.tsx',
  'src/components/ae/legal/terms/components/TermsCapabilityList.tsx',
  'src/components/ae/legal/terms/components/TermsPracticeAccordion.tsx',
  'src/components/ae/privacy/remove-business/AeRemoveBusinessPage.tsx',
  'src/components/ae/privacy/remove-business/AeRemoveBusinessPageSkeleton.tsx',
  'src/components/ae/privacy/remove-business/components/CorrectionPathCards.tsx',
  'src/components/ae/privacy/remove-business/components/RemovalRequestForm.tsx',
] as const

const ds15DashboardHeadingPattern =
  /text-(?:2xl|3xl)[\s\S]{0,48}font-semibold|font-semibold[\s\S]{0,48}text-(?:2xl|3xl)/

export function ds15LegalPageHeadingViolations(): readonly DsHit[] {
  const hits: DsHit[] = []
  for (const relative of DS_15_SOURCE_FILES) {
    const file = join(repoRoot(), relative)
    const lines = readRepoFile(relative).split(/\r?\n/)
    for (const [index, line] of lines.entries()) {
      if (!ds15DashboardHeadingPattern.test(line)) {
        continue
      }
      hits.push({ file, line: index + 1, excerpt: line.trim() })
    }
  }
  return hits
}

export function ds15SiteMarkerViolations(): readonly DsHit[] {
  const hits: DsHit[] = []
  for (const relative of DS_15_SOURCE_FILES) {
    const file = join(repoRoot(), relative)
    const lines = readRepoFile(relative).split(/\r?\n/)
    for (const [index, line] of lines.entries()) {
      if (line.includes('SiteMarker')) {
        hits.push({ file, line: index + 1, excerpt: line.trim() })
      }
    }
  }
  return hits
}

export function ds15PrivacyMomentNestedCardViolations(): readonly string[] {
  const relative = 'src/components/ae/legal/privacy/components/PrivacyMomentTabs.tsx'
  const source = readRepoFile(relative)
  return source.includes('<Card') ? [`${relative}: Card-per-tab dashboard chrome`] : []
}

export function ds15RemovalFormCenteredWellViolations(): readonly string[] {
  const violations: string[] = []
  for (const relative of [
    'src/components/ae/privacy/remove-business/components/RemovalRequestForm.tsx',
    'src/components/ae/privacy/remove-business/AeRemoveBusinessPageSkeleton.tsx',
  ] as const) {
    const source = readRepoFile(relative)
    if (/mx-auto[\s\S]{0,80}max-w-3xl|max-w-3xl[\s\S]{0,80}mx-auto/.test(source)) {
      violations.push(`${relative}: centered max-w-3xl well`)
    }
  }
  return violations
}

export function ds19HarvestBudgetViolations(): readonly string[] {
  const violations: string[] = []
  for (const relative of DS_19_SOURCE_FILES) {
    const source = readRepoFile(relative)
    if (source.includes('shadow-md')) {
      violations.push(`${relative}: shadow-md`)
    }
    if (/\bh[12]\b[^>]*font-bold|font-bold[^>]*\bh[12]\b/.test(source)) {
      violations.push(`${relative}: font-bold title`)
    }
    if (/text-\[10px\][\s\S]{0,120}PROVIDER|PROVIDER[\s\S]{0,120}text-\[10px\]/.test(source)) {
      violations.push(`${relative}: raw text-[10px] provider kicker`)
    }
  }
  return violations
}

/** DS-16 harvest budget — developers API + discovery routes. */
export const DS_16_SOURCE_FILES = [
  'src/routes/developers.api.tsx',
  'src/routes/developers.discovery.tsx',
] as const

export function ds16DevelopersApiHarvestViolations(): readonly string[] {
  const relative = 'src/routes/developers.api.tsx'
  const source = readRepoFile(relative)
  const violations: string[] = []
  if (!source.includes('AePublicPage')) {
    violations.push(`${relative}: missing AePublicPage`)
  }
  if (!source.includes('eyebrow="Developers"')) {
    violations.push(`${relative}: missing Developers eyebrow`)
  }
  if (/^ {6,}<script\b/m.test(source)) {
    violations.push(`${relative}: Scalar CDN script in parent document`)
  }
  if (!source.includes('srcDoc')) {
    violations.push(`${relative}: missing Scalar srcDoc iframe isolation`)
  }
  return violations
}

export function ds16DevelopersDiscoveryHarvestViolations(): readonly string[] {
  const relative = 'src/routes/developers.discovery.tsx'
  const source = readRepoFile(relative)
  const violations: string[] = []
  if (source.includes('AeOperatorPage')) {
    violations.push(`${relative}: AeOperatorPage`)
  }
  if (!source.includes('AePublicPage')) {
    violations.push(`${relative}: missing AePublicPage`)
  }
  if (!source.includes('CodeBlock')) {
    violations.push(`${relative}: missing CodeBlock`)
  }
  if (source.includes('Builder readbacks | Agentic Economy')) {
    violations.push(`${relative}: stale tab title`)
  }
  if (!source.includes('loaderData.copy.title')) {
    violations.push(`${relative}: tab title not tied to visible h1 copy`)
  }
  if (!source.includes('discoveryRowStateLabel')) {
    violations.push(`${relative}: raw row state labels`)
  }
  return violations
}

/** DS-17 harvest budget — status, onboarding, sign-in/up chrome. */
export const DS_17_SOURCE_FILES = [
  'src/components/ae/website/clerk-appearance.ts',
  'src/components/ae/status/system-status/AeSystemStatus.tsx',
  'src/components/ae/status/system-status/components/StatusCheckList.tsx',
  'src/components/ae/status/system-status/components/StatusRecoveryPanel.tsx',
  'src/components/ae/status/system-status/components/StatusPageFooter.tsx',
  'src/components/ae/principal-account/onboarding/AeOnboardingPage.tsx',
  'src/components/ae/principal-account/onboarding/components/OnboardingOpeningPanel.tsx',
  'src/components/ae/principal-account/onboarding/components/OnboardingRoleStep.tsx',
  'src/components/ae/principal-account/onboarding/components/OnboardingWorkspaceStep.tsx',
  'src/components/ae/principal-account/onboarding/components/OnboardingStepIndicator.tsx',
  'src/components/ae/auth/sign-in/AeSignInPage.tsx',
  'src/components/ae/auth/sign-up/AeSignUpPage.tsx',
] as const

const clerkHeaderTitleLinePattern = /headerTitle:\s*'[^']*'/

export function ds17ClerkHeaderTitleViolations(): readonly string[] {
  const relative = 'src/components/ae/website/clerk-appearance.ts'
  const source = readRepoFile(relative)
  const violations: string[] = []
  const match = clerkHeaderTitleLinePattern.exec(source)
  if (match === null) {
    violations.push(`${relative}: missing headerTitle`)
    return violations
  }
  const headerTitleValue = match[0]
  if (headerTitleValue.includes('font-semibold')) {
    violations.push(`${relative}: headerTitle font-semibold`)
  }
  if (!headerTitleValue.includes('font-medium')) {
    violations.push(`${relative}: headerTitle missing font-medium`)
  }
  return violations
}

export function ds17StatusCheckListRoundedLgViolations(): readonly string[] {
  const relative = 'src/components/ae/status/system-status/components/StatusCheckList.tsx'
  const source = readRepoFile(relative)
  return source.includes('rounded-lg') ? [`${relative}: rounded-lg`] : []
}

export function ds17StatusHarvestRoundedLgViolations(): readonly string[] {
  const violations: string[] = []
  for (const relative of [
    'src/components/ae/status/system-status/AeSystemStatusSkeleton.tsx',
    'src/components/ae/status/system-status/components/StatusCheckList.tsx',
    'src/components/ae/status/system-status/components/StatusRecoveryPanel.tsx',
  ] as const) {
    const source = readRepoFile(relative)
    if (source.includes('rounded-lg')) {
      violations.push(`${relative}: rounded-lg`)
    }
  }
  return violations
}

function countOccurrences(source: string, needle: string): number {
  let count = 0
  let index = source.indexOf(needle)
  while (index !== -1) {
    count += 1
    index = source.indexOf(needle, index + needle.length)
  }
  return count
}

/** DS-35: inventory duplicate global chrome (listing only; no ratchet). */
export function ds35FrameOwnershipInventory(): Readonly<{
  appShell: { userButton: number; themeToggle: number; brandMark: number; organizationSwitcher: number }
  operatorSidebar: { userButton: number; themeToggle: number; brandMark: number; organizationSwitcher: number }
  chatHeader: { brandMark: number; signInButton: number; userButton: number; themeToggle: number }
}> {
  const appShell = readRepoFile('src/components/ae/layout/AeAppShell.tsx')
  const operatorSidebar = readRepoFile('src/components/ae/layout/AeOperatorSidebar.tsx')
  const chatHeader = readRepoFile('src/components/ae/chat/chat-session/components/ChatHeader.tsx')
  return {
    appShell: {
      userButton: countOccurrences(appShell, '<UserButton'),
      themeToggle: countOccurrences(appShell, '<ThemeToggle'),
      brandMark: countOccurrences(appShell, 'AECON_MARK_SRC'),
      organizationSwitcher: countOccurrences(appShell, 'AeOrganizationSwitcher'),
    },
    operatorSidebar: {
      userButton: countOccurrences(operatorSidebar, '<UserButton'),
      themeToggle: countOccurrences(operatorSidebar, '<ThemeToggle'),
      brandMark: countOccurrences(operatorSidebar, 'SiteMarker'),
      organizationSwitcher: countOccurrences(operatorSidebar, 'AeOrganizationSwitcher'),
    },
    chatHeader: {
      brandMark: countOccurrences(chatHeader, 'AECON_MARK_SRC'),
      signInButton: countOccurrences(chatHeader, 'SignInButton'),
      userButton: countOccurrences(chatHeader, '<UserButton'),
      themeToggle: countOccurrences(chatHeader, '<ThemeToggle'),
    },
  }
}

/** DS-37: operator routes keep the one app header; drawer uses primary landmark copy. */
export function ds37ChromeFlipViolations(): readonly string[] {
  const appShell = readRepoFile('src/components/ae/layout/AeAppShell.tsx')
  const siteNav = readRepoFile('src/components/ae/website/AeSiteNav.tsx')
  const violations: string[] = []
  if (appShell.includes('operatorWorkspace ? null : <AppHeaderNav')) {
    violations.push('AeAppShell.tsx: operatorWorkspace hides AppHeaderNav')
  }
  if (siteNav.includes('aria-label="Public navigation"')) {
    violations.push('AeSiteNav.tsx: Public navigation aria-label')
  }
  return violations
}

const DS38_SETTINGS_DIALOG_FILES = [
  'src/components/ae/settings/settings-dialog/AeSettingsDialog.tsx',
  'src/components/ae/settings/settings-dialog/useAeSettingsDialog.ts',
  'src/components/ae/settings/settings-dialog/components/WorkspaceSettingsBody.tsx',
] as const

/** DS-38: settings overlay must not wrap operator page chrome. */
export function ds38SettingsDialogViolations(): readonly string[] {
  const violations: string[] = []
  for (const file of DS38_SETTINGS_DIALOG_FILES) {
    const source = readRepoFile(file)
    if (source.includes('AeOperatorPage')) {
      violations.push(`${file}: AeOperatorPage`)
    }
    if (source.includes('OwnerSettingsShell')) {
      violations.push(`${file}: OwnerSettingsShell`)
    }
    if (source.includes('SiteMarker')) {
      violations.push(`${file}: SiteMarker`)
    }
  }
  const dialogTitle = readRepoFile('src/components/ae/settings/settings-dialog/AeSettingsDialog.tsx')
  if (dialogTitle.includes('font-bold')) {
    violations.push('AeSettingsDialog.tsx: font-bold title')
  }
  return violations
}

/** DS-36: chat must not re-own app-level brand or auth chrome. */
export function ds36ChatShellViolations(): readonly string[] {
  const inventory = ds35FrameOwnershipInventory()
  const violations: string[] = []
  if (inventory.chatHeader.brandMark > 0) {
    violations.push('ChatHeader.tsx: AECON_MARK_SRC')
  }
  if (inventory.chatHeader.signInButton > 0) {
    violations.push('ChatHeader.tsx: SignInButton')
  }
  if (inventory.chatHeader.userButton > 0) {
    violations.push('ChatHeader.tsx: UserButton')
  }
  if (inventory.chatHeader.themeToggle > 0) {
    violations.push('ChatHeader.tsx: ThemeToggle')
  }
  return violations
}

export function dsGrammarSnapshot() {
  return {
    frozenAt: '2026-09-21',
    missingSot: missingSotStrings(),
    ratchets: {
      fontBoldTitles: fontBoldTitleHits().length,
      siteMarkerProductEyebrows: siteMarkerProductEyebrowHits().length,
      genericShadowMdProductCards: genericShadowMdProductCardHits().length,
      centeredPublicHeroIntro: centeredPublicHeroIntroHits().length,
      mxAutoAgentFunnelWells: mxAutoAgentFunnelWellHits().length,
      numberedStepProductEyebrows: numberedStepProductEyebrowHits().length,
      inkPublicEditorialHeroes: inkPublicEditorialHeroHits().length,
    },
    ds18: {
      workspaceKind: ds18PublicToolWorkspaceKindViolations(),
      inkNextActionSlab: ds18InkNextActionSlabViolations(),
      siteMarker: ds18SiteMarkerViolations(),
      centeredErrorActions: ds18CenteredPublicErrorActionViolations(),
    },
    ds19: {
      harvestBudget: ds19HarvestBudgetViolations(),
      marketShadowMd: ds19NonSotMarketShadowMdHits().length,
      marketRawTenPxProviderKickers: ds19NonSotMarketRawTenPxProviderKickerHits().length,
      marketFontBoldTitles: ds19NonSotMarketFontBoldTitleHits().length,
    },
    ds15: {
      legalPageHeadings: ds15LegalPageHeadingViolations(),
      siteMarker: ds15SiteMarkerViolations(),
      privacyMomentNestedCard: ds15PrivacyMomentNestedCardViolations(),
      removalFormCenteredWell: ds15RemovalFormCenteredWellViolations(),
    },
    ds16: {
      developersApi: ds16DevelopersApiHarvestViolations(),
      developersDiscovery: ds16DevelopersDiscoveryHarvestViolations(),
    },
    ds17: {
      clerkHeaderTitle: ds17ClerkHeaderTitleViolations(),
      statusCheckListRoundedLg: ds17StatusCheckListRoundedLgViolations(),
      statusRoundedLg: ds17StatusHarvestRoundedLgViolations(),
    },
    ds35: ds35FrameOwnershipInventory(),
    ds36: { chatShell: ds36ChatShellViolations() },
    ds37: { chromeFlip: ds37ChromeFlipViolations() },
    ds38: { settingsDialog: ds38SettingsDialogViolations() },
    ceilings: DS_RATCHET,
    cases: journeyCases().length,
    sotCases: journeyCases().filter(item => item.sot).map(item => item.id),
  }
}
