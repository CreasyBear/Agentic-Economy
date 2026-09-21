import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  DS_LEGAL,
  DS_RATCHET,
  DS_SOT_STRINGS,
  centeredPublicHeroIntroHits,
  ds18CenteredPublicErrorActionViolations,
  ds18InkNextActionSlabViolations,
  ds18PublicToolWorkspaceKindViolations,
  ds18SiteMarkerViolations,
  ds15LegalPageHeadingViolations,
  ds15PrivacyMomentNestedCardViolations,
  ds15RemovalFormCenteredWellViolations,
  ds15SiteMarkerViolations,
  ds16DevelopersApiHarvestViolations,
  ds16DevelopersDiscoveryHarvestViolations,
  ds17ClerkHeaderTitleViolations,
  ds17StatusCheckListRoundedLgViolations,
  ds17StatusHarvestRoundedLgViolations,
  ds19HarvestBudgetViolations,
  ds19NonSotMarketFontBoldTitleHits,
  ds19NonSotMarketRawTenPxProviderKickerHits,
  ds19NonSotMarketShadowMdHits,
  ds35FrameOwnershipInventory,
  ds36ChatShellViolations,
  ds37ChromeFlipViolations,
  ds38SettingsDialogViolations,
  dsGrammarSnapshot,
  fontBoldTitleHits,
  genericShadowMdProductCardHits,
  inkPublicEditorialHeroHits,
  journeyCases,
  missingSotStrings,
  mxAutoAgentFunnelWellHits,
  numberedStepProductEyebrowHits,
  siteMarkerProductEyebrowHits,
} from '../../tools/dev/eval-ds-grammar'
import { validateDsJourneyCases } from '../../tools/dev/ds-journey-cases'

describe('design-system grammar eval harness', () => {
  it('freezes the discover SoT class strings', () => {
    expect(missingSotStrings()).toEqual([])
    expect(DS_SOT_STRINGS.heroEyebrow).toContain('font-medium')
    expect(DS_SOT_STRINGS.heroDisplay).toContain('font-extralight')
    expect(DS_SOT_STRINGS.cardTitle).toContain('font-semibold')
    expect(DS_LEGAL).toContain('rounded-full')
  })

  it('validates frozen journey cases and keeps a single SoT case', () => {
    const cases = journeyCases()
    expect(() => validateDsJourneyCases(cases)).not.toThrow()
    expect(cases.filter(item => item.sot)).toEqual([
      expect.objectContaining({ id: 'discover-sot', route: '/market?view=discover' }),
    ])
    expect(cases.length).toBeGreaterThanOrEqual(20)
  })

  it('rejects a second SoT case or a missing-landmark case', () => {
    const [first] = journeyCases()
    if (first === undefined) throw new Error('cases_required')
    expect(() =>
      validateDsJourneyCases([{ ...first, id: 'dup' }, { ...first, id: 'dup' }]),
    ).toThrow('duplicate_ds_case_id')
    expect(() => validateDsJourneyCases([{ ...first, sot: true, id: 'other-sot', route: '/about' }])).toThrow()
    expect(() => validateDsJourneyCases([{ ...first, landmarks: [] }])).toThrow('landmarks_required')
  })

  it('keeps Wave 1 grammar ratchets at or under their ceilings', () => {
    expect(fontBoldTitleHits().length).toBeLessThanOrEqual(DS_RATCHET.fontBoldTitles)
    expect(siteMarkerProductEyebrowHits().length).toBeLessThanOrEqual(DS_RATCHET.siteMarkerProductEyebrows)
    expect(genericShadowMdProductCardHits().length).toBeLessThanOrEqual(DS_RATCHET.genericShadowMdProductCards)
    expect(centeredPublicHeroIntroHits().length).toBeLessThanOrEqual(DS_RATCHET.centeredPublicHeroIntro)
  })

  it('keeps Wave 2 DS-12–14 grammar ratchets at or under their ceilings', () => {
    expect(mxAutoAgentFunnelWellHits().length).toBeLessThanOrEqual(DS_RATCHET.mxAutoAgentFunnelWells)
    expect(numberedStepProductEyebrowHits().length).toBeLessThanOrEqual(DS_RATCHET.numberedStepProductEyebrows)
    expect(inkPublicEditorialHeroHits().length).toBeLessThanOrEqual(DS_RATCHET.inkPublicEditorialHeroes)
  })

  it('keeps discover-legal product eyebrows on Wave 2 surfaces', () => {
    const supply = readFileSync('src/components/ae/supply/AeSupplyLanding.tsx', 'utf8')
    const agents = readFileSync('src/components/ae/agents/AeAgentDoorPage.tsx', 'utf8')
    const about = readFileSync('src/components/ae/about/AeAboutPage.tsx', 'utf8')
    expect(supply).toContain('<AeSiteEyebrow>Providers</AeSiteEyebrow>')
    expect(supply).toContain('<AeSiteEyebrow>Before you sign in</AeSiteEyebrow>')
    expect(agents).toContain('<AeSiteEyebrow>{AGENT_PAGE.eyebrow}</AeSiteEyebrow>')
    expect(about).toContain('<AeSiteEyebrow>{ABOUT.eyebrow}</AeSiteEyebrow>')
    expect(
      numberedStepProductEyebrowHits().some(hit => hit.file.includes('AeSupplyLanding.tsx')),
    ).toBe(false)
  })

  it('snapshots the harness without inventing unavailable evidence', () => {
    const snapshot = dsGrammarSnapshot()
    expect(snapshot.missingSot).toEqual([])
    expect(snapshot.sotCases).toEqual(['discover-sot'])
    expect(snapshot.ratchets.fontBoldTitles).toBeLessThanOrEqual(DS_RATCHET.fontBoldTitles)
  })

  it('keeps Card discover lift opt-in and off by default', () => {
    const cardSource = readFileSync('src/components/ui/card.tsx', 'utf8')
    expect(cardSource).toContain('data-ae-discover-lift')
    expect(cardSource).toContain('discoverLift = false')
    expect(cardSource).toContain('text-lg font-semibold leading-snug tracking-tight')
  })

  it('DS-15: document pages use read-mode grammar, not dashboard headings', () => {
    expect(ds15LegalPageHeadingViolations()).toEqual([])
    expect(ds15SiteMarkerViolations()).toEqual([])
    expect(ds15PrivacyMomentNestedCardViolations()).toEqual([])
    expect(ds15RemovalFormCenteredWellViolations()).toEqual([])
  })

  it('DS-18: public tool detail stays editorial-discover, not operator workspace', () => {
    expect(ds18PublicToolWorkspaceKindViolations()).toEqual([])
    expect(ds18InkNextActionSlabViolations()).toEqual([])
    expect(ds18SiteMarkerViolations()).toEqual([])
    expect(ds18CenteredPublicErrorActionViolations()).toEqual([])
  })

  it('DS-16: developers API and discovery use public document chrome', () => {
    expect(ds16DevelopersApiHarvestViolations()).toEqual([])
    expect(ds16DevelopersDiscoveryHarvestViolations()).toEqual([])
  })

  it('DS-17: Clerk headerTitle and status lists use kit radius grammar', () => {
    expect(ds17ClerkHeaderTitleViolations()).toEqual([])
    expect(ds17StatusCheckListRoundedLgViolations()).toEqual([])
    expect(ds17StatusHarvestRoundedLgViolations()).toEqual([])
  })

  it('DS-35/36: lists frame ownership and keeps chat free of app chrome', () => {
    const inventory = ds35FrameOwnershipInventory()
    expect(inventory.appShell.brandMark).toBeGreaterThan(0)
    expect(inventory.appShell.userButton).toBeGreaterThan(0)
    expect(inventory.chatHeader.brandMark).toBe(0)
    expect(inventory.chatHeader.signInButton).toBe(0)
    expect(ds36ChatShellViolations()).toEqual([])
  })

  it('DS-37: keeps operator routes on the one app header and primary drawer landmark', () => {
    expect(ds37ChromeFlipViolations()).toEqual([])
  })

  it('DS-38: settings dialog stays free of operator page chrome', () => {
    expect(ds38SettingsDialogViolations()).toEqual([])
  })

  it('DS-19: discover SoT strings stay frozen; sibling market views keep catalogue grammar', () => {
    expect(missingSotStrings()).toEqual([])
    expect(readFileSync('src/components/ae/market/DirectoryHomeDiscovery.tsx', 'utf8')).toContain(
      DS_SOT_STRINGS.collectionKicker,
    )
    expect(ds19HarvestBudgetViolations()).toEqual([])
    expect(ds19NonSotMarketShadowMdHits()).toEqual([])
    expect(ds19NonSotMarketFontBoldTitleHits()).toEqual([])
    expect(ds19NonSotMarketRawTenPxProviderKickerHits()).toEqual([])
  })
})
