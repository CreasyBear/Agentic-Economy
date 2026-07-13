import { describe, expect, it } from 'vitest'

import { kernelRetirementManifest } from '../../tools/release/kernel-retirement-manifest.mjs'
import { verifyKernelRetirement } from '../../tools/release/verify-kernel-retirement.mjs'

describe('kernel retirement manifest', () => {
  it('proves every retired writer, route, job, key, import, and quarantined-table reference is absent', () => {
    expect(verifyKernelRetirement()).toEqual({ ok: true, errors: [] })
  })

  it('classifies surviving application domains as non-authoritative kernel peers', () => {
    expect(kernelRetirementManifest.retainedNonAuthority.map(({ domain }) => domain)).toEqual([
      'registered-business-listings', 'marketplace-inquiries', 'validation-harness', 'demand-observation',
    ])
  })

  it('names the canonical retirement and historical readback owners', () => {
    expect(kernelRetirementManifest.retainedHistoricalSurfaces).toEqual({
      ingressRetirement: 'convex/http.ts',
      historicalReadback: 'convex/routingKernelV1History.ts',
      historicalSchema: 'src/modules/routing-kernel/internal/convex-schema.ts',
    })
  })
})
