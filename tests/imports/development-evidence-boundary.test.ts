import { existsSync, globSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Development evidence fixtures and the file-backed x402 payment-attempt
 * fixture live under tools/dev/fixtures; production runtime authorities remain
 * in src.
 */

const deployableGlobs = [
  'src/routes/**/*.{ts,tsx}',
  'src/components/**/*.{ts,tsx}',
  'convex/**/*.ts',
] as const

const publicBarrels = [
  'src/modules/capability-supply/public.ts',
  'src/modules/capability-execution/index.ts',
  'src/modules/registry/public.ts',
  'src/modules/money/public.ts',
] as const

const forbiddenImportSelectors = [
  /from\s+['"][^'"]*capability-supply\/development-[^'"]+['"]/u,
  /from\s+['"][^'"]*action-invocation\/development-[^'"]+['"]/u,
  /from\s+['"][^'"]*modules\/dev(?:\/|['"])/u,
  /from\s+['"][^'"]*tools\/dev\/[^'"]+['"]/u,
  /from\s+['"][^'"]*tests\/helpers\/[^'"]+['"]/u,
  /from\s+['"][^'"]*tests\/fixtures\/[^'"]+['"]/u,
]

/** Explicit development/operator Convex surfaces — not production request paths. */
const deployableAllowlist = new Set([
  'convex/devSeed.ts',
  'convex/devSeedStore.ts',
  'convex/curatedProviders.ts',
])

function deployableFiles(): readonly string[] {
  return deployableGlobs
    .flatMap((pattern) => globSync(pattern))
    .filter((path) => !path.includes('/_generated/'))
    .filter((path) => !path.endsWith('.test.ts'))
    .filter((path) => !deployableAllowlist.has(path))
    .sort()
}

function violationsFor(path: string): readonly string[] {
  const source = readFileSync(path, 'utf8')
  return forbiddenImportSelectors
    .filter((selector) => selector.test(source))
    .map((selector) => `${path}:${selector.source}`)
}

describe('development evidence boundary', () => {
  it('keeps development evidence, tools/dev, and test fixtures out of deployable graphs', () => {
    expect(deployableFiles().flatMap(violationsFor)).toEqual([])
  })

  it('keeps public production barrels free of development-* re-exports', () => {
    const offenders = publicBarrels
      .filter((path) => existsSync(path))
      .filter((path) => /development-/u.test(readFileSync(path, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('keeps development fixtures owned by tools/dev/fixtures', () => {
    const expectedCapabilitySupplyFixtures = [
      'tools/dev/fixtures/capability-supply/development-alternate-published-operation-evidence.ts',
      'tools/dev/fixtures/capability-supply/development-evidence-continuity.ts',
      'tools/dev/fixtures/capability-supply/development-evidence-fixture.ts',
      'tools/dev/fixtures/capability-supply/development-evidence-invocations.ts',
      'tools/dev/fixtures/capability-supply/development-evidence-scenario.ts',
      'tools/dev/fixtures/capability-supply/development-published-operation-evidence.ts',
    ].sort()

    expect(globSync('src/modules/capability-supply/development-*.ts')).toEqual([])
    expect(existsSync('src/modules/capability-supply/btc-usd-quote-result.ts')).toBe(false)
    expect(existsSync('src/modules/action-invocation/development-file-x402-payment-attempt-port.ts')).toBe(false)
    expect(globSync('tools/dev/fixtures/capability-supply/*.ts').sort()).toEqual(
      expectedCapabilitySupplyFixtures,
    )
    expect(globSync('tools/dev/fixtures/action-invocation/*.ts')).toEqual([
      'tools/dev/fixtures/action-invocation/development-file-x402-payment-attempt-port.ts',
    ])
  })
})
