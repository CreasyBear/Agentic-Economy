import { describe, expect, it } from 'vitest'

import {
  DEPLOYMENT_MANIFEST,
  deploymentConfigFingerprint,
  validateDeploymentManifest,
} from '../../src/lib/deployment/manifest'

describe('deployment manifest import seam', () => {
  it('is a pure data/validation seam with stable probe declarations', () => {
    const environment = {
      NODE_ENV: 'development',
      AE_CANONICAL_BASE_URL: 'http://127.0.0.1:3000',
      CONVEX_URL: 'http://127.0.0.1:3210',
    }
    const first = validateDeploymentManifest(environment, { environment: 'development', nodeMajor: 22 })
    const second = validateDeploymentManifest(environment, { environment: 'development', nodeMajor: 22 })

    expect(first.fingerprint).toBe(second.fingerprint)
    expect(DEPLOYMENT_MANIFEST.readinessProbes.every((probe) => probe.path.startsWith('/'))).toBe(true)
    expect(deploymentConfigFingerprint(environment, { environment: 'development', nodeMajor: 22 })).toBe(first.fingerprint)
  })

  it('does not turn optional provider absence into a fabricated health claim', () => {
    const result = validateDeploymentManifest({ NODE_ENV: 'development' }, { environment: 'development', nodeMajor: 22 })

    expect(result.findings).toEqual([])
    expect(result.configuration.conditional.some((group) => group.scope === 'notifications:resend')).toBe(true)
    expect(result.readinessProbes.find((probe) => probe.id === 'readiness')?.dependencies).toEqual([
      'deployment-config',
      'convex-source',
      'source-authority',
    ])
  })
})
