import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createWorkTreeAgentClient,
  decisionCommand,
  parseTimeout,
  readAndVerifyWorkTreeParityRelease,
  workTreeParityConfigFromEnvironment,
} from '../../../tools/release/work-tree-parity-release'
import { withTemporaryWorkTreeCredential, WORK_TREE_SCOPES } from '../../../tools/release/work-tree-parity-credential'
import {
  WORK_TREE_PARITY_EVIDENCE_CLASS,
  sanitizeWorkTreeParityEvidence,
  writeWorkTreeParityEvidencePacket,
} from '../../../tools/release/work-tree-parity-evidence'
import { vercelProtectionBypassHeaders } from '../../../tests/deploy-smoke/vercel-bypass'

const baseEnv = {
  DEPLOY_BASE_URL: 'https://preview.example.test',
  DEPLOY_CONVEX_URL: 'https://happy-animal-123.convex.cloud',
  AE_RELEASE_SOURCE_REVISION: 'a'.repeat(40),
  AE_RELEASE_DEPLOYMENT_ID: 'dpl_preview_123',
  AE_RELEASE_CONVEX_DEPLOYMENT_ID: 'happy-animal-123',
  AE_T51_RELEASE_MODE: 'release',
  CLERK_SECRET_KEY: 'sk_test_temporary',
  AE_WORK_TREE_CLERK_INSTANCE_ID: 'ins_preview',
  AE_WORK_TREE_CLERK_SUBJECT: 'user_preview',
} as const

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
describe('hosted T51 invocation contract', () => {
  it('runs only from the credential-gated hosted job and uploads sanitized artifacts', async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const workflow = await readFile(join(process.cwd(), '.github/workflows/kernel-release-gate.yml'), 'utf8')
    expect(packageJson.scripts?.['smoke:work-tree:production:hosted']).toBe('npx playwright test --config=playwright.deploy-smoke.config.ts tests/deploy-smoke/work-tree-parity-release-proof.spec.ts --project=deploy-smoke')
    expect(workflow).toContain('npm run smoke:work-tree:production:hosted')
    expect(workflow).toContain('output/release/work-tree-parity/work-tree-parity-evidence.json')
    expect(workflow).toContain('output/release/playwright-deploy-smoke.json')
    expect(workflow).toContain('test-results/**/*.png')
    expect(workflow).not.toContain('test-results/**/*.zip')
    expect(workflow).not.toContain('trace.zip')
  })
})
describe('hosted WorkTree parity configuration', () => {
  it('requires deployed URLs, exact source identity, deployment IDs, and release credentials only in release mode', () => {
    const config = workTreeParityConfigFromEnvironment(baseEnv)
    expect(config.baseUrl.href).toBe('https://preview.example.test/')
    expect(config.convexUrl.href).toBe('https://happy-animal-123.convex.cloud/')
    expect(config.sourceRevision).toBe('a'.repeat(40))
    expect(config.vercelDeploymentId).toBe('dpl_preview_123')
    expect(config.convexDeploymentId).toBe('happy-animal-123')
    expect(config.evidenceDirectory).toContain('output/release/work-tree-parity')
    expect(config.releaseMode).toBe(true)
    expect(config.clerkSecretKey).toBe('sk_test_temporary')
    expect(config.clerkInstanceId).toBe('ins_preview')
    expect(config).not.toHaveProperty('setupToken')
    expect(config).not.toHaveProperty('clerkSubject')
  })
  it.each([
    ['placeholder', 'UNAVAILABLE_NOT_DEPLOYED', 'AE_RELEASE_CONVEX_DEPLOYMENT_ID_invalid'],
    ['local', 'local', 'AE_RELEASE_CONVEX_DEPLOYMENT_ID_invalid'],
    ['local deployment', 'local:local-agentic-economy', 'AE_RELEASE_CONVEX_DEPLOYMENT_ID_invalid'],
    ['uppercase local deployment', 'LOCAL:local-agentic-economy', 'AE_RELEASE_CONVEX_DEPLOYMENT_ID_invalid'],
    ['anonymous', 'anonymous', 'AE_RELEASE_CONVEX_DEPLOYMENT_ID_invalid'],
    ['anonymous deployment', 'anonymous:anonymous-Agentic-Economy', 'AE_RELEASE_CONVEX_DEPLOYMENT_ID_invalid'],
    ['uppercase anonymous deployment', 'ANONYMOUS:anonymous-Agentic-Economy', 'AE_RELEASE_CONVEX_DEPLOYMENT_ID_invalid'],
    ['synthetic local Convex ID', 'convex:local-agentic-economy', 'AE_RELEASE_CONVEX_DEPLOYMENT_ID_invalid'],
    ['synthetic dev Convex ID', 'convex:loyal-peacock-107', 'AE_RELEASE_CONVEX_DEPLOYMENT_ID_invalid'],
    ['URL', 'https://happy-animal-123.convex.cloud', 'AE_RELEASE_CONVEX_DEPLOYMENT_ID_invalid'],
    ['uppercase URL', 'HTTPS://happy-animal-123.convex.cloud', 'AE_RELEASE_CONVEX_DEPLOYMENT_ID_invalid'],
    ['other URL scheme', 'convex://happy-animal-123', 'AE_RELEASE_CONVEX_DEPLOYMENT_ID_invalid'],
    ['blank', ' ', 'AE_RELEASE_CONVEX_DEPLOYMENT_ID_required'],
  ])('rejects a %s Convex deployment ID before the hosted flow', (_label, convexDeploymentId, error) => {
    expect(() => workTreeParityConfigFromEnvironment({
      ...baseEnv,
      AE_RELEASE_CONVEX_DEPLOYMENT_ID: convexDeploymentId,
    })).toThrow(error)
  })

  it('accepts a hosted Convex dev deployment ID', () => {
    const config = workTreeParityConfigFromEnvironment({
      ...baseEnv,
      AE_RELEASE_CONVEX_DEPLOYMENT_ID: 'dev:happy-animal-123',
    })

    expect(config.convexDeploymentId).toBe('dev:happy-animal-123')
  })

  it('fails closed for missing runtime Clerk credentials only in named release mode', () => {
    const withoutClerk = { ...baseEnv }
    delete (withoutClerk as Record<string, string | undefined>).CLERK_SECRET_KEY
    expect(() => workTreeParityConfigFromEnvironment(withoutClerk)).toThrow('CLERK_SECRET_KEY_required')
    expect(() => workTreeParityConfigFromEnvironment({ ...baseEnv, DEPLOY_BASE_URL: 'http://localhost:3000' })).toThrow('DEPLOY_BASE_URL_deployed_https_required')
    expect(() => workTreeParityConfigFromEnvironment({ ...baseEnv, AE_RELEASE_SOURCE_REVISION: 'not-a-sha' })).toThrow('AE_RELEASE_SOURCE_REVISION_invalid')
  })

  it('does not require hosted Clerk secrets for source-mode config', () => {
    const sourceEnv = { ...baseEnv }
    delete (sourceEnv as Record<string, string | undefined>).AE_T51_RELEASE_MODE
    delete (sourceEnv as Record<string, string | undefined>).CLERK_SECRET_KEY
    delete (sourceEnv as Record<string, string | undefined>).AE_WORK_TREE_CLERK_INSTANCE_ID
    const config = workTreeParityConfigFromEnvironment(sourceEnv)
    expect(config.releaseMode).toBe(false)
    expect(config).not.toHaveProperty('clerkSecretKey')
  })

  it('validates bounded timeout', () => {
    expect(parseTimeout(undefined)).toBe(180_000)
    expect(parseTimeout('60000')).toBe(60_000)
    expect(() => parseTimeout('1')).toThrow('AE_WORK_TREE_TIMEOUT_MS_invalid')
  })

  it('computes the exact human root decision digest without adding authority fields', () => {
    const command = decisionCommand({
      projectId: 'project:one',
      nodeId: 'node:decision',
      kind: 'lock',
      expectedGeneration: 1,
      expectedRevision: 4,
      idempotencyKey: 'root-idempotency',
    })
    expect(command).toEqual(expect.objectContaining({
      projectId: 'project:one',
      nodeId: 'node:decision',
      kind: 'lock',
      expectedGeneration: 1,
      expectedRevision: 4,
      idempotencyKey: 'root-idempotency',
    }))
    expect(command).toHaveProperty('proposalDigest', expect.stringMatching(/^sha256:[0-9a-f]{64}$/u))
    expect(command).not.toHaveProperty('principalId')
  })
})
  it('reads source-owned SHA, Vercel and Convex coordinates before packet write', async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => Response.json({
      kind: 'release_readback',
      schemaVersion: 'ae.customer-request-release:v1',
      source: { provider: 'github', repository: 'CreasyBear/Agentic-Economy', revision: baseEnv.AE_RELEASE_SOURCE_REVISION },
      deployment: {
        provider: 'vercel',
        id: baseEnv.AE_RELEASE_DEPLOYMENT_ID,
        environment: 'production',
        targetEnvironment: 'production',
        url: 'https://preview.example.test/',
        productionUrl: 'https://preview.example.test/',
        convex: { provider: 'convex', id: baseEnv.AE_RELEASE_CONVEX_DEPLOYMENT_ID, url: baseEnv.DEPLOY_CONVEX_URL + '/' },
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
        observedAt: '2026-08-02T00:00:00.000Z',
        inputs: ['VERCEL', 'VERCEL_ENV', 'VERCEL_TARGET_ENV', 'VERCEL_DEPLOYMENT_ID', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_GIT_PROVIDER', 'VERCEL_GIT_REPO_OWNER', 'VERCEL_GIT_REPO_SLUG', 'VERCEL_GIT_COMMIT_SHA'],
        convexInputs: ['CONVEX_DEPLOYMENT_ID', 'CONVEX_URL'],
        sandbox: { involved: false, reason: 'release readback does not discover or execute supply' },
      },
    }))
    await expect(readAndVerifyWorkTreeParityRelease({
      baseUrl: new URL(baseEnv.DEPLOY_BASE_URL),
      agentApiKey: 'ak_agent',
      expectedRevision: baseEnv.AE_RELEASE_SOURCE_REVISION,
      expectedVercelDeploymentId: baseEnv.AE_RELEASE_DEPLOYMENT_ID,
      expectedConvexDeploymentId: baseEnv.AE_RELEASE_CONVEX_DEPLOYMENT_ID,
      expectedConvexUrl: baseEnv.DEPLOY_CONVEX_URL,
      fetchImpl,
    })).resolves.toMatchObject({
      kind: 'verified',
      revision: baseEnv.AE_RELEASE_SOURCE_REVISION,
      deploymentId: baseEnv.AE_RELEASE_DEPLOYMENT_ID,
      convexDeploymentId: baseEnv.AE_RELEASE_CONVEX_DEPLOYMENT_ID,
    })
    await expect(readAndVerifyWorkTreeParityRelease({
      baseUrl: new URL(baseEnv.DEPLOY_BASE_URL),
      agentApiKey: 'ak_agent',
      expectedRevision: baseEnv.AE_RELEASE_SOURCE_REVISION,
      expectedVercelDeploymentId: baseEnv.AE_RELEASE_DEPLOYMENT_ID,
      expectedConvexDeploymentId: 'other-deployment',
      expectedConvexUrl: baseEnv.DEPLOY_CONVEX_URL,
      fetchImpl,
    })).rejects.toThrow('hosted_release_convex_deployment_id_mismatch')
  })

describe('Vercel protection bypass configuration', () => {
  it('uses the accepted alias when the canonical secret is unset', () => {
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', undefined)
    vi.stubEnv('AE_CUSTOMER_REQUEST_VERCEL_BYPASS_SECRET', ' alias-secret ')

    expect(vercelProtectionBypassHeaders()).toEqual({
      'x-vercel-protection-bypass': 'alias-secret',
    })
  })

  it('gives the canonical secret precedence when both names are configured', () => {
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', ' canonical-secret ')
    vi.stubEnv('AE_CUSTOMER_REQUEST_VERCEL_BYPASS_SECRET', ' alias-secret ')

    expect(vercelProtectionBypassHeaders()).toEqual({
      'x-vercel-protection-bypass': 'canonical-secret',
    })
  })
})
describe('hosted WorkTree temporary credentials', () => {
  it('shares the Clerk acceptance session owner with the scoped agent key and revokes both after reload and evidence capture', async () => {
    const lifecycle: string[] = []
    const fetchImpl = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'ins_preview', environment_type: 'development' }))
      .mockResolvedValueOnce(Response.json({
        id: 'user_preview',
        banned: false,
        locked: false,
        primary_email_address_id: 'email_primary',
        email_addresses: [{
          id: 'email_primary',
          email_address: 'joel@agentic-economy.ai',
          verification: { status: 'verified' },
        }],
      }))
      .mockResolvedValueOnce(Response.json({ id: 'key_preview', secret: 'ak_preview' }))
      .mockResolvedValueOnce(Response.json({ id: 'session_preview', status: 'active' }))
      .mockResolvedValueOnce(Response.json({ jwt: 'session_jwt' }))
      .mockResolvedValueOnce(Response.json({ id: 'session_preview', status: 'revoked' }))
      .mockResolvedValueOnce(Response.json({ id: 'key_preview', revoked: true }))

    const run = vi.fn(async (credential: {
      agentApiKey: string
      credentialId: string
      scopes: readonly string[]
      issueCustomerSessionToken: () => Promise<string>
    }) => {
      expect(credential.agentApiKey).toBe('ak_preview')
      expect(credential.credentialId).toBe('key_preview')
      expect(credential.scopes).toEqual(WORK_TREE_SCOPES)
      expect(await credential.issueCustomerSessionToken()).toBe('session_jwt')
      lifecycle.push('receipt')
      lifecycle.push('reload')
      lifecycle.push('evidence')
    })

    await expect(withTemporaryWorkTreeCredential({
      clerkSecretKey: baseEnv.CLERK_SECRET_KEY,
      expectedInstanceId: baseEnv.AE_WORK_TREE_CLERK_INSTANCE_ID,
      subject: baseEnv.AE_WORK_TREE_CLERK_SUBJECT,
      fetch: fetchImpl,
      run,
    })).resolves.toBeUndefined()
    expect(lifecycle).toEqual(['receipt', 'reload', 'evidence'])
    expect(JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body))).toMatchObject({
      scopes: [
        'customer_requests:approve_each',
        'customer_requests:create',
        'work_trees:apply',
        'work_trees:create',
        'work_trees:decide',
        'work_trees:inspect',
      ],
    })
    expect(run).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[3]?.[0]).toBe('https://api.clerk.com/v1/sessions')
    expect(fetchImpl.mock.calls[6]?.[0]).toBe('https://api.clerk.com/v1/api_keys/key_preview/revoke')
  })

})

describe('hosted WorkTree evidence seams', () => {
  it('redacts secrets from route/account/selection receipts and writes exact deployment metadata', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'ae-work-tree-parity-'))
    try {
      const packetPath = await writeWorkTreeParityEvidencePacket({
        directory: temp,
        metadata: {
          sourceRevision: baseEnv.AE_RELEASE_SOURCE_REVISION,
          vercelDeploymentId: baseEnv.AE_RELEASE_DEPLOYMENT_ID,
          convexDeploymentId: baseEnv.AE_RELEASE_CONVEX_DEPLOYMENT_ID,
          evidenceClass: WORK_TREE_PARITY_EVIDENCE_CLASS,
        },
        route: { requestRef: 'request:one', revision: 3, routeGenerationRef: 'generation:one', routeRef: 'route:one' },
        account: { ownerAccountDigest: 'sha256:owner', subjectDigest: 'sha256:subject' },
        selection: { seed: 'seed:one', candidateCount: 2, selectedSubjectDigest: 'sha256:selected' },
        creation: { humanReceipt: 'decision:human', agentReceipt: 'decision:agent', projectId: 'project:one' },
        freshReadbacks: [{ processClass: 'fresh-browser', projectId: 'project:one' }, { processClass: 'fresh-child-agent', projectId: 'project:one' }],
        cleanup: { revoked: true },
        human: { receiptId: 'decision:human', authorization: 'Bearer ak_human_secret' },
        agent: { receiptId: 'decision:agent', credential: 'ak_agent_secret' },
        refusals: [{ refusalCode: 'stale_fence' }],
        secrets: ['ak_human_secret', 'ak_agent_secret', baseEnv.CLERK_SECRET_KEY],
        now: new Date('2026-08-02T00:00:00.000Z'),
      })
      const packet = await readFile(packetPath, 'utf8')
      expect(packet).toContain('"sourceRevision": "' + 'a'.repeat(40) + '"')
      expect(packet).toContain('"vercelDeploymentId": "dpl_preview_123"')
      expect(packet).toContain('"convexDeploymentId": "happy-animal-123"')
      expect(packet).toContain('"routeGenerationRef": "generation:one"')
      expect(packet).toContain('"candidateCount": 2')
      expect(packet).toContain('"processClass": "fresh-child-agent"')
      expect(packet).not.toContain('ak_human_secret')
      expect(packet).not.toContain('ak_agent_secret')
      expect(packet).not.toContain(baseEnv.CLERK_SECRET_KEY)
      expect(packet).not.toContain('"setup"')
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })

  it('keeps agent HTTP calls on the public WorkTree route and never adds a principal field', async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ kind: 'refused', reason: 'scope_required' }, { status: 403 }))
    const client = createWorkTreeAgentClient({ baseUrl: new URL(baseEnv.DEPLOY_BASE_URL), agentApiKey: 'temporary-agent-key', fetchImpl })
    await expect(client.inspect({ projectId: 'project:one' })).resolves.toMatchObject({ status: 403 })
    const [, init] = fetchImpl.mock.calls[0] ?? []
    expect(String(init?.body)).toContain('project:one')
    expect(String(init?.body)).not.toContain('principalId')
  })
})

describe('evidence sanitizer', () => {
  it('redacts credential-bearing keys and values recursively', () => {
    expect(sanitizeWorkTreeParityEvidence({ receiptId: 'decision:one', apiKey: 'secret', nested: [{ token: 'x' }] }, ['secret']))
      .toEqual({ receiptId: 'decision:one', apiKey: '[REDACTED]', nested: [{ token: '[REDACTED]' }] })
  })
})
