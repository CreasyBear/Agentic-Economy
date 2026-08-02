import { existsSync, globSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { kernelRetirementManifest } from '../../tools/release/kernel-retirement-manifest.mjs'

const root = process.cwd()
const retiredPaths = [
  'convex/enginePlans.ts',
  'convex/decisionMaps.ts',
  'src/modules/plan-proposal',
  'src/modules/decision-map',
  'src/components/ae/chat/AePlanWork.tsx',
  'src/components/ae/decision-map',
  'src/modules/answer-thread/internal/turns/proposal.ts',
  'eval/engine',
  'tests/eval/engine-suite.test.ts',
] as const
const retiredTokens = [
  'AE_ENGINE_PROPOSALS',
  'enginePlans',
  'decisionMaps',
  'AePlanWork',
  'AeDecisionMapJourney',
] as const

describe('legacy engine retirement', () => {
  it('removes retired hosts and modules from the public source surface', () => {
    for (const path of retiredPaths) {
      expect(existsSync(join(root, path)), path).toBe(false)
    }
  })
  it('records the production-data verification before schema removal', () => {
    expect(kernelRetirementManifest.retired.dataVerification).toContain('No committed production-data claim exists')
  })

  it('keeps public source, action registry, and schema free of retired references', () => {
    const matches = sourceFiles(root, ['src', 'convex', 'tools', 'eval', '.env.example', 'package.json'])
      .filter((path) => !path.startsWith('convex/_generated/'))
      .filter((path) => !path.endsWith('legacy-engine-retirement.test.ts'))
      .filter((path) => !path.endsWith('tools/release/kernel-retirement-manifest.mjs'))
      .filter((path) => !path.endsWith('tools/release/verify-kernel-retirement.mjs'))
      .flatMap((path) => {
        const source = readFileSync(join(root, path), 'utf8')
        return retiredTokens.filter((token) => source.includes(token)).map((token) => `${path}:${token}`)
      })

    expect(matches).toEqual([])
  })
})

function sourceFiles(base: string, directories: readonly string[]): string[] {
  return directories
    .flatMap((directory) => globSync([
      join(base, directory),
      join(base, directory, '**/*'),
      join(base, directory, '**/.*'),
      join(base, directory, '**/.*/**/*'),
    ], { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(base, join(entry.parentPath, entry.name)))
    .filter((path) => /\.(?:ts|tsx|mts|cts|js|mjs|cjs|json)$/.test(path))
    .filter((path) => !path.includes('/node_modules/') && !path.includes('/.git/'))
}
