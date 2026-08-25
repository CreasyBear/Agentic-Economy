import { describe, expect, it } from 'vitest'

import {
  assertCliPackIntegrity,
  assertGeneratedSnapshotUnchanged,
  assertPinnedNitroNightly,
} from '../../tools/release/maturity-release-integrity'
import {
  assertCoverageRatchet,
  createCoverageBaseline,
  parseCoveragePolicy,
  parseCoverageSummary,
} from '../../tools/release/coverage-ratchet'

const metrics = (total: number, covered: number) => ({
  branches: { covered, pct: total === 0 ? 100 : covered / total * 100, skipped: 0, total },
  functions: { covered, pct: total === 0 ? 100 : covered / total * 100, skipped: 0, total },
  lines: { covered, pct: total === 0 ? 100 : covered / total * 100, skipped: 0, total },
  statements: { covered, pct: total === 0 ? 100 : covered / total * 100, skipped: 0, total },
})

const exactNitroSpec = 'npm:nitro-nightly@3.0.1-20260628-090458-3df69609'
const nitroManifest = (spec = exactNitroSpec) => ({ devDependencies: { nitro: spec } })
const nitroLock = (spec = exactNitroSpec, version = '3.0.1-20260628-090458-3df69609') => ({
  packages: {
    '': { devDependencies: { nitro: spec } },
    'node_modules/nitro': {
      integrity: 'sha512-example',
      name: 'nitro-nightly',
      resolved: `https://registry.npmjs.org/nitro-nightly/-/nitro-nightly-${version}.tgz`,
      version,
    },
  },
})

const cliManifest = {
  bin: { ae: 'dist/ae.js' },
  files: ['dist/ae.js', 'README.md'],
  name: '@agentic-economy/cli',
  version: '0.1.0',
}
const cliReport = (files = [
  { mode: 0o644, path: 'README.md', size: 10 },
  { mode: 0o755, path: 'dist/ae.js', size: 100 },
  { mode: 0o644, path: 'package.json', size: 20 },
]) => [{
  entryCount: files.length,
  filename: 'agentic-economy-cli-0.1.0.tgz',
  files,
  integrity: 'sha512-example',
  name: '@agentic-economy/cli',
  shasum: 'example',
  version: '0.1.0',
}]

describe('P0-03 release integrity', () => {
  it('rejects generated source drift after generation instead of accepting rewritten artifacts', () => {
    const intendedDirtySnapshot = {
      'convex/_generated/api.d.ts': 'already-dirty-content',
      'src/routeTree.gen.ts': 'intended-route-change',
    }
    expect(() => assertGeneratedSnapshotUnchanged(intendedDirtySnapshot, intendedDirtySnapshot)).not.toThrow()
    expect(() => assertGeneratedSnapshotUnchanged(intendedDirtySnapshot, {
      ...intendedDirtySnapshot,
      'convex/_generated/api.d.ts': 'generator-rewrote-content',
    })).toThrow(
      /generated_artifact_drift/u,
    )
    expect(() => assertGeneratedSnapshotUnchanged(intendedDirtySnapshot, {
      ...intendedDirtySnapshot,
      'convex/_generated/new-api.d.ts': 'generator-added-content',
    })).toThrow(
      /generated_artifact_drift/u,
    )
  })

  it('pins the Nitro nightly alias and its root lock entry to one exact artifact', () => {
    expect(assertPinnedNitroNightly(nitroManifest(), nitroLock())).toBe(
      '3.0.1-20260628-090458-3df69609',
    )
    expect(() => assertPinnedNitroNightly(
      nitroManifest('npm:nitro-nightly@^3.0.1-20260628-090458-3df69609'),
      nitroLock('npm:nitro-nightly@^3.0.1-20260628-090458-3df69609'),
    )).toThrow(/nitro_nightly_must_be_exactly_pinned/u)
    expect(() => assertPinnedNitroNightly(
      nitroManifest('npm:nitro-nightly@latest'),
      nitroLock('npm:nitro-nightly@latest'),
    )).toThrow(/nitro_nightly_version_must_be_an_immutable_version/u)
    expect(() => assertPinnedNitroNightly(nitroManifest(), nitroLock(exactNitroSpec, '3.0.2-nightly')))
      .toThrow(/nitro_nightly_lock_version_mismatch/u)
  })

  it('fails packaging when a declared CLI artifact is absent or repository source leaks in', () => {
    expect(assertCliPackIntegrity(cliManifest, cliReport()).entryCount).toBe(3)
    expect(() => assertCliPackIntegrity(cliManifest, cliReport([
      { mode: 0o644, path: 'README.md', size: 10 },
      { mode: 0o644, path: 'package.json', size: 20 },
    ]))).toThrow(/cli_pack_file_set_mismatch/u)
    expect(() => assertCliPackIntegrity(
      { ...cliManifest, files: [...cliManifest.files, 'tools/ae/cli.ts'] },
      cliReport([
        { mode: 0o644, path: 'README.md', size: 10 },
        { mode: 0o755, path: 'dist/ae.js', size: 100 },
        { mode: 0o644, path: 'package.json', size: 20 },
        { mode: 0o644, path: 'tools/ae/cli.ts', size: 20 },
      ]),
    )).toThrow(/cli_pack_contains_repository_source/u)
  })

  it('enforces per-file no-regression by uncovered count and 100% on canonical maturity paths', () => {
    const policy = parseCoveragePolicy({
      criticalPathPrefixes: ['src/modules/principal-account'],
      schema: 'ae.coverage-ratchet-policy:v1',
    })
    const baselineSummary = parseCoverageSummary({
      '/repo/src/existing.ts': metrics(10, 8),
    }, '/repo')
    const baseline = createCoverageBaseline(baselineSummary).files
    const passing = parseCoverageSummary({
      '/repo/src/existing.ts': metrics(12, 10),
      '/repo/src/modules/principal-account/principal.ts': metrics(5, 5),
    }, '/repo')
    expect(() => assertCoverageRatchet(passing, baseline, policy)).not.toThrow()

    const regressed = parseCoverageSummary({
      '/repo/src/existing.ts': metrics(12, 9),
      '/repo/src/modules/principal-account/principal.ts': metrics(5, 4),
    }, '/repo')
    expect(() => assertCoverageRatchet(regressed, baseline, policy)).toThrow(/coverage_ratchet_failed/u)
    expect(() => assertCoverageRatchet(
      passing,
      baseline,
      policy,
      ['src/modules/principal-account/missing.ts'],
    )).toThrow(/critical_file_missing_from_current_summary/u)
  })
})
