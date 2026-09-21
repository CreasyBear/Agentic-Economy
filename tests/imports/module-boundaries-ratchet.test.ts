import { describe, expect, it } from 'vitest'

import {
  MODULE_BOUNDARY_MANIFEST,
  type ModuleDeclaration,
} from '@/modules/module-boundaries'

/**
 * Ratchet thresholds for module boundary manifest metrics.
 * Lower these as work lands; never raise them.
 *
 * totalEntrySurfaces rose because the code-quality campaign moved domain types
 * out of `.tsx` files into declared `.view-model.ts` / `.contracts.ts` entry
 * surfaces (intended quarantine, not module sprawl). One module and one surface
 * (`decision-engine` / `public.ts`) is now the landed Jev gateway. One added
 * registry entry (`tool-reranker.ts`) is the Convex/chat catalogue rerank seam.
 * Three procurement entries remain the supported action, contract and engine
 * seams. Three exact unit-test exceptions retain white-box checks of payment
 * preparation, output adjudication, and the market directory reranker.
 *
 * Re-pinned 2026-09-21 from the first fully wired run. The surface increase
 * is market-demand/request-identity.ts plus market/market-route-data.ts; the
 * latter is now the declared UI/test seam, so no white-box exception is
 * needed. The second capability-supply exception is
 * provider-source-assessment-contract -> capability-supply/source-assessment.ts.
 */
const RATCHET = {
  numModules: 29,
  totalEntrySurfaces: 230,
  numTestOnlyWhiteBoxExceptions: 3,
  numToCapabilitySupply: 2,
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
