import { existsSync, globSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Quarantine proof for Product-Frontier Cleanup Batch 3.
 * Development evidence, tools/dev, and test fixtures must not enter deployable
 * route/component/convex graphs. We intentionally do not move ~5.5k LOC of
 * development-* modules unless a move shrinks production reachability.
 */

const deployableGlobs = [
  'src/routes/**/*.{ts,tsx}',
  'src/components/**/*.{ts,tsx}',
  'convex/**/*.ts',
] as const

const publicBarrels = [
  'src/modules/capability-supply/public.ts',
  'src/modules/capability-execution/public.ts',
  'src/modules/registry/public.ts',
  'src/modules/answer/public.ts',
  'src/modules/answer-thread/public.ts',
  'src/modules/work-tree/public.ts',
  'src/modules/study/public.ts',
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

  it('records that development-* modules remain co-located until a reachability-reducing move is proven', () => {
    const developmentModules = globSync('src/modules/capability-supply/development-*.ts').sort()
    expect(developmentModules.length).toBeGreaterThan(5)
    expect(existsSync('tools/dev/action-invocation-development-evidence.ts')).toBe(true)
  })
})
