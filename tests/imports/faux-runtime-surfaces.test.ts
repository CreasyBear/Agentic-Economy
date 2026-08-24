import { existsSync, readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { normalize, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const deployableRoots = [
  'src/modules/registry/**/*.ts',
  'src/modules/discovery/**/*.ts',
  'src/modules/catalog/owner-status.functions.ts',
  'src/modules/settings/**/*.ts',
  'src/modules/capability-execution/**/*.ts',
  'src/routes/llms[.]txt.ts',
  'src/routes/sitemap[.]xml.ts',
  'src/routes/$slug.ucp.ts',
]

const sourceFiles = globSync(deployableRoots).sort()
const movedProductionFiles = [
  'src/modules/capability-execution/seed-supply.ts',
]

const forbiddenSelectors = [
  /@\/lib\/dev\/local-e2e-business-fixtures/u,
  /@\/modules\/dev(?:\/|['"])/u,
  /seed-supply/u,
  /local-e2e-adapter/u,
  /\b(?:LOCAL_E2E_BUSINESS_FIXTURES|DEV_SEED_BUSINESS_FIXTURES|seedKeylessExecutableSource|defaultKeylessExecutableSource)\b/u,
  /\bisLocalE2EAuthBypassEnabled\s*\(/u,
  /\b(?:readFixtureCatalogDiscoveryManifest|readFixtureLlmsTxt|readFixtureSitemapXml)\b/u,
  /\bcreateLocalE2eRegistrySourceState\b/u,
  /\b(?:createDefaultDiscoverySourceState|createFixtureDiscoverySourceState)\b/u,
  /\b(?:state|sourceState)\s*:\s*DiscoverySourceState(?:\s*\|\s*undefined)?\s*=/u,
]

function sourceShapeViolations(): readonly string[] {
  return sourceFiles.flatMap((path) => {
    const source = readFileSync(path, 'utf8')
    return forbiddenSelectors
      .filter((selector) => selector.test(source))
      .map((selector) => `${path}:${selector.source}`)
  })
}

describe('faux runtime surfaces (source-shape proof only)', () => {
  it('keeps local fixture and seed authority out of deployable target graphs', () => {
    expect(sourceShapeViolations()).toEqual([])
  })

  it('keeps moved pure adapters out of deployable source paths', () => {
    expect(movedProductionFiles.filter((path) => existsSync(path))).toEqual([])
    expect(normalize(resolve('tests/helpers/keyless-seed-source.ts'))).toContain(normalize(resolve('tests/helpers')))
  })
})
