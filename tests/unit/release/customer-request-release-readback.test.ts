import { describe, expect, it } from 'vitest'

import {
  readCustomerRequestRelease,
  verifyCustomerRequestHostedRevision,
} from '@/modules/customer-request/release-readback'

const revision = '50fa5ed886dbf5eddbfc1397704b12fc52469abe'

const productionEnvironment = {
  VERCEL: '1',
  VERCEL_ENV: 'production',
  VERCEL_TARGET_ENV: 'production',
  VERCEL_DEPLOYMENT_ID: 'dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3',
  VERCEL_URL: 'agentic-economy-abc123.vercel.app',
  VERCEL_PROJECT_PRODUCTION_URL: 'agentic-economy-phi.vercel.app',
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'CreasyBear',
  VERCEL_GIT_REPO_SLUG: 'Agentic-Economy',
  VERCEL_GIT_COMMIT_SHA: revision,
} as const

describe('Customer Request hosted release readback', () => {
  it('binds the production Request entrypoint to platform-owned deployment identity', () => {
    expect(readCustomerRequestRelease({
      env: productionEnvironment,
      observedAt: () => Date.parse('2026-07-14T04:05:06.000Z'),
    })).toEqual({
      kind: 'release_readback',
      schemaVersion: 'ae.customer-request-release:v1',
      source: {
        provider: 'github',
        repository: 'CreasyBear/Agentic-Economy',
        revision,
      },
      deployment: {
        provider: 'vercel',
        id: 'dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3',
        environment: 'production',
        targetEnvironment: 'production',
        url: 'https://agentic-economy-abc123.vercel.app',
        productionUrl: 'https://agentic-economy-phi.vercel.app',
      },
      requestEntrypoint: {
        contract: 'Customer Request V2',
        method: 'POST',
        path: '/api/v1/requests',
        schemaPath: '/api/v1/requests/schema',
        authentication: 'clerk_api_key',
        requiredScope: 'customer_requests:create',
      },
      evidence: {
        observedAt: '2026-07-14T04:05:06.000Z',
        inputs: [
          'VERCEL',
          'VERCEL_ENV',
          'VERCEL_TARGET_ENV',
          'VERCEL_DEPLOYMENT_ID',
          'VERCEL_URL',
          'VERCEL_PROJECT_PRODUCTION_URL',
          'VERCEL_GIT_PROVIDER',
          'VERCEL_GIT_REPO_OWNER',
          'VERCEL_GIT_REPO_SLUG',
          'VERCEL_GIT_COMMIT_SHA',
        ],
        sandbox: { involved: false, reason: 'release readback does not discover or execute supply' },
      },
    })
  })

  it.each([
    ['caller-supplied revision', { ...productionEnvironment, VERCEL_GIT_COMMIT_SHA: undefined, AE_RELEASE_SOURCE_REVISION: revision }],
    ['non-production deployment', { ...productionEnvironment, VERCEL_ENV: 'preview' }],
    ['wrong repository', { ...productionEnvironment, VERCEL_GIT_REPO_SLUG: 'another-project' }],
    ['invalid revision', { ...productionEnvironment, VERCEL_GIT_COMMIT_SHA: 'abc123' }],
    ['missing deployment identity', { ...productionEnvironment, VERCEL_DEPLOYMENT_ID: undefined }],
  ])('refuses %s as release evidence', (_case, env) => {
    expect(readCustomerRequestRelease({ env, observedAt: () => 0 })).toEqual({
      kind: 'unavailable',
      reason: 'authoritative_release_identity_unavailable',
    })
  })

  it('independently refuses a hosted revision or entrypoint mismatch', () => {
    const readback = readCustomerRequestRelease({ env: productionEnvironment, observedAt: () => 0 })
    expect(readback.kind).toBe('release_readback')
    if (readback.kind !== 'release_readback') throw new Error('test setup failed')

    expect(verifyCustomerRequestHostedRevision({ expectedRevision: revision, readback })).toEqual({
      kind: 'verified',
      revision,
      deploymentId: productionEnvironment.VERCEL_DEPLOYMENT_ID,
    })
    expect(() => verifyCustomerRequestHostedRevision({
      expectedRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      readback,
    })).toThrow('hosted_release_revision_mismatch')
    const entrypointMismatch = structuredClone(readback)
    Object.defineProperty(entrypointMismatch.requestEntrypoint, 'path', { value: '/api/legacy' })
    expect(() => verifyCustomerRequestHostedRevision({
      expectedRevision: revision,
      readback: entrypointMismatch,
    })).toThrow('hosted_release_entrypoint_mismatch')
  })
})
