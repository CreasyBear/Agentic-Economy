import { describe, expect, it } from 'vitest'

import {
  declaredGraphCycles,
  scanModuleBoundaries,
  scanRuntimeModuleConsumers,
  scanTestOnlyModuleBoundaries,
  validateModuleBoundaryManifest,
} from '@/lib/ui/contract-scans'
import {
  MODULE_BOUNDARY_MANIFEST,
  type ModuleBoundaryManifest,
  type ModuleDeclaration,
  type RuntimeBoundaryException,
} from '@/modules/module-boundaries'

const fixtureRoot = 'tests/fixtures/module-boundaries/src/modules'

describe('module surface and dependency manifest', () => {
  it('enforces every current runtime module import through the target DAG or one bounded exception', () => {
    const result = scanModuleBoundaries({ manifest: MODULE_BOUNDARY_MANIFEST })
    expect(result.violations).toEqual([])
    expect(result.moduleCount).toBe(22)
    expect(result.cycles).toEqual([])
    expect(result.usedRuntimeExceptionIds).toHaveLength(
      MODULE_BOUNDARY_MANIFEST.temporaryRuntimeExceptions.filter(
        ({ from }) => from !== 'adapter' && from !== 'convex',
      ).length,
    )
  })

  it('accepts an allowed public action-to-registry-to-supply-to-common seam', () => {
    const result = scanModuleBoundaries({
      manifest: fixtureManifest(),
      moduleRoot: fixtureRoot,
      sourceFiles: [
        `${fixtureRoot}/actions/public.ts`,
        `${fixtureRoot}/registry/public.ts`,
        `${fixtureRoot}/capability-supply/public.ts`,
        `${fixtureRoot}/common/ids.ts`,
      ],
    })
    expect(result.violations).toEqual([])
  })

  it('accounts for every current test-only white-box import separately', () => {
    const result = scanTestOnlyModuleBoundaries(MODULE_BOUNDARY_MANIFEST)
    expect(result.violations).toEqual([])
    expect(result.usedTestExceptionIds).toHaveLength(
      MODULE_BOUNDARY_MANIFEST.testOnlyWhiteBoxExceptions.length,
    )
  })

  it('keeps route, lib, component, and Convex consumers on declared module entries', () => {
    const result = scanRuntimeModuleConsumers(MODULE_BOUNDARY_MANIFEST)
    expect(result.violations).toEqual([])
    expect(result.usedRuntimeExceptionIds).toHaveLength(
      MODULE_BOUNDARY_MANIFEST.temporaryRuntimeExceptions.filter(
        ({ from }) => from === 'adapter' || from === 'convex',
      ).length,
    )
  })

  it('rejects an undeclared deep entry and a forbidden reverse edge', () => {
    const deep = scanModuleBoundaries({
      manifest: fixtureManifest(),
      moduleRoot: fixtureRoot,
      sourceFiles: [`${fixtureRoot}/actions/deep-import.ts`],
    })
    const reverse = scanModuleBoundaries({
      manifest: fixtureManifest(),
      moduleRoot: fixtureRoot,
      sourceFiles: [`${fixtureRoot}/common/reverse-edge.ts`],
    })
    expect(deep.violations.map(({ rule }) => rule)).toContain('module-undeclared-entry')
    expect(reverse.violations.map(({ rule }) => rule)).toContain('module-forbidden-edge')
  })

  it('rejects a cycle in the declared target graph', () => {
    const manifest = fixtureManifest({
      modules: fixtureManifest().modules.map((module): ModuleDeclaration => (
        module.name === 'common'
          ? { ...module, allowedDependencies: ['actions'] }
          : module
      )),
    })
    expect(declaredGraphCycles(manifest)).not.toEqual([])
    expect(validateModuleBoundaryManifest(manifest, fixtureRoot).map(({ rule }) => rule)).toContain('module-cycle')
  })

  it('rejects an unowned temporary exception without a removal task', () => {
    const malformed: RuntimeBoundaryException = {
      id: 'malformed',
      from: 'common',
      to: 'actions',
      importer: 'reverse-edge.ts',
      entry: 'public.ts',
      owner: '',
      removalTask: 'T3',
    }
    const manifest = fixtureManifest({ temporaryRuntimeExceptions: [malformed] })
    expect(validateModuleBoundaryManifest(manifest, fixtureRoot).map(({ rule }) => rule)).toContain('module-malformed-exception')
  })

  it('does not permit runtime code to consume a test-only white-box exception', () => {
    const result = scanModuleBoundaries({
      manifest: fixtureManifest({
        testOnlyWhiteBoxExceptions: [{
          id: 'registry-testing-white-box',
          importers: ['tests/unit/registry/testing.test.ts'],
          to: 'registry',
          entry: 'testing.ts',
          owner: 'registry-tests',
        }],
      }),
      moduleRoot: fixtureRoot,
      sourceFiles: [`${fixtureRoot}/common/test-only-at-runtime.ts`],
    })
    expect(result.violations.map(({ rule }) => rule)).toContain('module-test-exception-at-runtime')
  })
})

function fixtureManifest(
  overrides: Partial<ModuleBoundaryManifest> = {},
): ModuleBoundaryManifest {
  return {
    modules: [
      { name: 'common', entrySurfaces: ['ids.ts'], allowedDependencies: [] },
      { name: 'capability-supply', entrySurfaces: ['public.ts'], allowedDependencies: ['common'] },
      { name: 'registry', entrySurfaces: ['public.ts'], allowedDependencies: ['capability-supply'] },
      { name: 'actions', entrySurfaces: ['public.ts'], allowedDependencies: ['registry'] },
    ],
    temporaryRuntimeExceptions: [],
    testOnlyWhiteBoxExceptions: [],
    ...overrides,
  }
}
