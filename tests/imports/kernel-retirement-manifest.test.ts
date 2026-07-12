import { describe, expect, it } from 'vitest'

import { kernelRetirementManifest } from '../../tools/release/kernel-retirement-manifest.mjs'
import { verifyKernelRetirement } from '../../tools/release/verify-kernel-retirement.mjs'

describe('kernel retirement manifest', () => {
  it('proves every retired path, route, table, job, key, and import is absent', () => {
    expect(verifyKernelRetirement()).toEqual({ ok: true, errors: [] })
  })

  it('classifies surviving application domains as non-authoritative kernel peers', () => {
    expect(kernelRetirementManifest.retainedNonAuthority.map(({ domain }) => domain)).toEqual([
      'registered-business-listings', 'marketplace-inquiries', 'validation-harness', 'demand-observation',
    ])
  })

  it('names one canonical source owner for every kernel layer', () => {
    expect(kernelRetirementManifest.canonicalAuthority).toEqual({
      contract: 'src/modules/routing-kernel/contract.ts',
      application: 'src/modules/routing-kernel/application.ts',
      runtime: 'src/modules/routing-kernel/runtime.ts',
      ingress: 'convex/http.ts',
      durableRuntime: 'convex/routingKernel.ts',
      persistence: 'convex/routingKernelStore.ts',
      schema: 'src/modules/routing-kernel/internal/convex-schema.ts',
      scheduler: 'convex/crons.ts',
    })
  })
})
