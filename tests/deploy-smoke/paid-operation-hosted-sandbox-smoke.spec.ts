import { test, expect } from '@playwright/test'

import {
  collectAndAdmitLivePaidOperationHostedEvidence,
  EXPECTED_AUTOMATED_INSTRUMENT_DIGEST,
  EXPECTED_RESIDUAL_REVIEW_DATE,
} from '../../tools/release/verify-paid-operation-hosted-release'

test.use({
  trace: 'off',
  video: 'off',
  screenshot: 'off',
})

const liveConfig = readLiveConfig()

test.describe('Phase 3C exact-revision hosted paid-operation sandbox', () => {
  test.skip(liveConfig === undefined, 'explicit exact hosted environment is required')

  test('collects one sanitized three-operation packet through temporary credentials', async ({
    browser,
  }, testInfo) => {
    if (liveConfig === undefined) throw new Error('live_config_missing')

    const result = await collectAndAdmitLivePaidOperationHostedEvidence(
      {
        source: {
          expectedRevision: liveConfig.expectedRevision,
          expectedTree: liveConfig.expectedTree,
        },
        deployment: {
          id: liveConfig.vercelDeploymentId,
          productionUrl: liveConfig.productionUrl,
        },
        github: {
          runId: liveConfig.githubRunId,
          runAttempt: liveConfig.githubRunAttempt,
        },
        automatedInstrumentDigest: EXPECTED_AUTOMATED_INSTRUMENT_DIGEST,
        residualReviewDate: EXPECTED_RESIDUAL_REVIEW_DATE,
      },
      {
        repositoryRoot: process.cwd(),
        baseUrl: `https://${liveConfig.productionUrl}`,
        browser,
        vercel: {
          apiToken: liveConfig.vercelApiToken,
          deploymentId: liveConfig.vercelDeploymentId,
          ...(liveConfig.vercelTeamId === undefined
            ? {}
            : { teamId: liveConfig.vercelTeamId }),
        },
        clerk: {
          secretKey: liveConfig.clerkSecretKey,
          instanceId: liveConfig.clerkInstanceId,
          subject: liveConfig.clerkSubject,
          primaryEmail: liveConfig.clerkPrimaryEmail,
        },
        convex: {
          configuredDeployment: liveConfig.convexDeployment,
        },
        ...(liveConfig.deploymentProtectionBypass === undefined
          ? {}
          : {
              deploymentProtectionBypass:
                liveConfig.deploymentProtectionBypass,
            }),
      },
    )

    expect(result.kind, result.kind === 'refused' ? result.code : undefined)
      .toBe('admitted')
    if (result.kind !== 'admitted') throw new Error('hosted_admission_refused')
    await testInfo.attach('sanitized-hosted-paid-operation-proof', {
      body: Buffer.from(JSON.stringify(result.packet, undefined, 2)),
      contentType: 'application/json',
    })
  })
})

function readLiveConfig() {
  if (process.env.AE_PAID_OPERATION_REQUIRE_LIVE !== '1') return undefined
  const expectedRevision = required('AE_PAID_OPERATION_EXPECTED_REVISION')
  const expectedTree = required('AE_PAID_OPERATION_EXPECTED_TREE')
  const vercelDeploymentId = required('AE_PAID_OPERATION_VERCEL_DEPLOYMENT_ID')
  const productionUrl = required('AE_PAID_OPERATION_PRODUCTION_URL')
  const githubRunId = required('AE_PAID_OPERATION_GITHUB_RUN_ID')
  const githubRunAttempt = Number(required('AE_PAID_OPERATION_GITHUB_RUN_ATTEMPT'))
  const convexDeployment = required('CONVEX_DEPLOYMENT')
  if (!/^[0-9a-f]{40}$/u.test(expectedRevision)
    || !/^[0-9a-f]{40}$/u.test(expectedTree)
    || !/^dpl_[A-Za-z0-9]+$/u.test(vercelDeploymentId)
    || !/^[1-9][0-9]*$/u.test(githubRunId)
    || !Number.isInteger(githubRunAttempt)
    || githubRunAttempt < 1
    || !/^(?:dev|prod):[A-Za-z0-9-]+$/u.test(convexDeployment)) {
    throw new Error('exact_hosted_environment_invalid')
  }
  const url = new URL(`https://${productionUrl}`)
  if (url.hostname !== productionUrl || url.pathname !== '/') {
    throw new Error('production_url_must_be_hostname')
  }
  return {
    expectedRevision,
    expectedTree,
    vercelDeploymentId,
    productionUrl,
    githubRunId,
    githubRunAttempt,
    convexDeployment,
    vercelApiToken: required('AE_PAID_OPERATION_VERCEL_API_TOKEN'),
    vercelTeamId: optional('AE_PAID_OPERATION_VERCEL_TEAM_ID'),
    clerkSecretKey: required('AE_PAID_OPERATION_CLERK_SECRET_KEY'),
    clerkInstanceId: required('AE_PAID_OPERATION_CLERK_INSTANCE_ID'),
    clerkSubject: required('AE_PAID_OPERATION_CLERK_SUBJECT'),
    clerkPrimaryEmail: required('AE_PAID_OPERATION_CLERK_PRIMARY_EMAIL'),
    deploymentProtectionBypass:
      optional('AE_PAID_OPERATION_VERCEL_PROTECTION_BYPASS'),
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (value === undefined || value === '') throw new Error(`${name} is required`)
  return value
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value === '' ? undefined : value
}
