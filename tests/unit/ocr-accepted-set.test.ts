import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { AeToolEconomics } from '@/components/ae/market/tool-detail/AeToolEconomics'
import { validRedirectUri } from '@/lib/server/agent-access-oauth/protocol'
import { evaluateAgentAccessTool } from '@/modules/agent-access/policy'
import { isPublicHttpsUrl } from '@/modules/catalog/public'
import { importX402Capability } from '@/modules/capability-supply/public'
import { projectInspectResult } from '@/modules/chat/tool-card'
import { readFundingConstraints } from '@/modules/money/public'
import { redactPayload, validateAuditEvent } from '@/modules/observability/public'

import { admitHttp } from '../../convex/rateLimit'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const REACT_DOCTOR_SHA = '013f7373f91a3b9e68bd1dc7d4d354f4b041b117'

describe('ocr accepted set', () => {
  it('imports every T1–T12 offer so the file is red if an offer is missing', () => {
    expect(validRedirectUri).toEqual(expect.any(Function))
    expect(admitHttp).toBeDefined()
    expect(importX402Capability).toEqual(expect.any(Function))
    expect(evaluateAgentAccessTool).toEqual(expect.any(Function))
    expect(projectInspectResult).toEqual(expect.any(Function))
    expect(isPublicHttpsUrl).toEqual(expect.any(Function))
    expect(readFundingConstraints).toEqual(expect.any(Function))
    expect(AeToolEconomics).toEqual(expect.any(Function))
    expect(redactPayload).toEqual(expect.any(Function))
    expect(validateAuditEvent).toEqual(expect.any(Function))

    const funding = readFileSync(join(repoRoot, 'convex/lib/money/fundingStripeEventPipeline.ts'), 'utf8')
    expect(funding).toContain('async function prepareFundingRefundEvent')

    const reactDoctor = readFileSync(join(repoRoot, '.github/workflows/react-doctor.yml'), 'utf8')
    expect(REACT_DOCTOR_SHA).toMatch(/^[0-9a-f]{40}$/u)
    expect(reactDoctor).toContain(`millionco/react-doctor@${REACT_DOCTOR_SHA}`)
    expect(reactDoctor).not.toMatch(/react-doctor@v2(?:\s|$)/u)
    expect(reactDoctor).toContain('blocking: none')
    expect(reactDoctor).toContain('actions/checkout@v5')
    expect(reactDoctor).toContain('timeout-minutes: 15')

    const deployer = readFileSync(
      join(repoRoot, 'infra/package4/bootstrap/state-and-deployer.yaml'),
      'utf8',
    )
    expect(deployer).toContain('RoleName: Package4ReleaseOpenTofu')
    expect(deployer).not.toContain('PowerUserAccess')
    expect(deployer).toContain('Package4ReleaseIamBoundary')
    expect(deployer).toContain('aws:MultiFactorAuthPresent')
    const namedStorage = deployer.split('Sid: Package4NamedStorageAndData')[1]
      ?.split('Sid: Package4TaggedKmsKeys')[0]
    expect(namedStorage).toContain('- s3:*')
    expect(namedStorage).toContain('s3:::agentic-economy-*')
    expect(namedStorage).toContain('alias/${DeploymentName}-opentofu-state')
    expect(namedStorage).toContain('secret:rds!')
    expect(namedStorage).not.toMatch(/Resource: '\*'/u)
    expect(namedStorage).not.toMatch(/kms:[^:\n]+:[^:\n]+:[^:\n]+:key\/\*/u)
    const taggedKms = deployer.split('Sid: Package4TaggedKmsKeys')[1]
      ?.split('Sid: Package4AccountAndNetworkServices')[0]
    expect(taggedKms).toContain('aws:ResourceTag/Application')
    expect(taggedKms).toContain('ap-southeast-4')
    expect(deployer).toContain('Sid: Package4TaggedKmsKeys')
    expect(deployer).toContain('ap-southeast-4')
    const accountServices = deployer.split('Sid: Package4AccountAndNetworkServices')[1]
      ?.split('PolicyName: Package4ReleaseIamBoundary')[0]
    expect(accountServices).not.toMatch(/- s3:\*/u)
    expect(accountServices).toMatch(/- backup:\*/u)
    expect(accountServices).toContain("Resource: '*'")
  })
})
