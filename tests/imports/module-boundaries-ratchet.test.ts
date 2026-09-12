import { describe, expect, it } from 'vitest'

import {
  MODULE_BOUNDARY_MANIFEST,
  type ModuleDeclaration,
} from '@/modules/module-boundaries'

/**
 * Ratchet thresholds for module boundary manifest metrics.
 * Lower these as work lands; never raise them.
 */
const RATCHET = {
  numModules: 26,
  totalEntrySurfaces: 190,
  numTestOnlyWhiteBoxExceptions: 0,
  numToCapabilitySupply: 0,
} as const

describe('module-boundaries ratchet', () => {
  it('enforces module count does not increase', () => {
    const numModules = MODULE_BOUNDARY_MANIFEST.modules.length
    expect(numModules).toBeLessThanOrEqual(RATCHET.numModules)
  })

  it('enforces total entrySurfaces across all modules does not increase', () => {
    const totalEntrySurfaces = MODULE_BOUNDARY_MANIFEST.modules.reduce(
      (sum, module) => sum + module.entrySurfaces.length,
      0,
    )
    expect(totalEntrySurfaces).toBeLessThanOrEqual(RATCHET.totalEntrySurfaces)
  })

  it('enforces testOnlyWhiteBoxExceptions count does not increase', () => {
    const numTestOnlyWhiteBoxExceptions =
      MODULE_BOUNDARY_MANIFEST.testOnlyWhiteBoxExceptions.length
    expect(numTestOnlyWhiteBoxExceptions).toBeLessThanOrEqual(
      RATCHET.numTestOnlyWhiteBoxExceptions,
    )
  })

  it('enforces testOnlyWhiteBoxExceptions targeting capability-supply do not increase', () => {
    const numToCapabilitySupply =
      MODULE_BOUNDARY_MANIFEST.testOnlyWhiteBoxExceptions.filter(
        (ex) => ex.to === 'capability-supply',
      ).length
    expect(numToCapabilitySupply).toBeLessThanOrEqual(RATCHET.numToCapabilitySupply)
  })

  it('enforces entrySurfaces contain no duplicates within each module', () => {
    MODULE_BOUNDARY_MANIFEST.modules.forEach((module: ModuleDeclaration) => {
      const seen = new Set<string>()
      const duplicates = new Set<string>()

      for (const surface of module.entrySurfaces) {
        if (seen.has(surface)) {
          duplicates.add(surface)
        }
        seen.add(surface)
      }

      expect(
        duplicates,
        `Module "${module.name}" has duplicate entrySurfaces: ${Array.from(duplicates).join(', ')}`,
      ).toEqual(new Set())
    })
  })
})
