import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

import { DEPLOYMENT_MANIFEST } from '../../../src/lib/deployment/manifest'

type ReleaseScriptMap = Record<string, string>

type WorkflowStep = {
  if?: string
  name?: string
  env?: Record<string, string>
  run?: string
  uses?: string
  with?: Record<string, string>
}

type WorkflowJob = {
  if?: string
  needs?: string | string[]
  name?: string
  environment?: string
  steps?: WorkflowStep[]
  env?: Record<string, string>
  'timeout-minutes'?: number
}
type Workflow = {
  on?: Record<string, unknown>
  jobs?: Record<string, WorkflowJob>
}

const root = resolve(process.cwd())
const scripts = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts as ReleaseScriptMap

function releaseCommandChain(name: string, seen = new Set<string>()): string {
  if (seen.has(name)) return ''
  seen.add(name)
  const command = scripts[name]
  if (typeof command !== 'string') throw new Error(`missing npm script: ${name}`)
  const nested = [...command.matchAll(/\bnpm run ([\w:-]+)/g)]
    .map((match) => releaseCommandChain(match[1]!, seen))
    .join('\n')
  return `${name}\n${command}\n${nested}`
}

function readWorkflow(path: string): Workflow {
  return parse(readFileSync(resolve(root, path), 'utf8')) as Workflow
}

function workflowSteps(workflow: Workflow): WorkflowStep[] {
  return Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? [])
}

const LISTED_VITEST_RUNNER = 'node tools/dev/run-listed-vitest.ts'

function listedVitestFiles(name: string): string[] {
  const command = scripts[name]
  if (typeof command !== 'string') throw new Error(`missing npm script: ${name}`)
  const runnerIndex = command.indexOf(LISTED_VITEST_RUNNER)
  if (runnerIndex < 0) throw new Error(`${name} must use the listed Vitest runner`)
  const args = command.slice(runnerIndex + LISTED_VITEST_RUNNER.length).trim().split(/\s+/u)
  const delimiterIndex = args.indexOf('--')
  return delimiterIndex < 0 ? args : args.slice(0, delimiterIndex)
}

describe('green release baseline', () => {
  it('keeps local and Convex Node runtimes on the same project major', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    const convex = JSON.parse(readFileSync(resolve(root, 'convex.json'), 'utf8'))
    const major = readFileSync(resolve(root, '.nvmrc'), 'utf8').trim()
    expect(major).toBe('22')
    expect(manifest.engines.node).toBe(`${major}.x`)
    expect(convex.node.nodeVersion).toBe(major)
    expect(manifest.packageManager).toBe('npm@11.5.1')
  })

  it('runs a guarded command on Node 22 and preserves its exit status', () => {
    const result = spawnSync(process.execPath, [
      'tools/dev/require-supported-node.ts', '--', 'node', '-e',
      'console.log(process.versions.node); process.exit(17)',
    ], { cwd: root, encoding: 'utf8' })
    if (process.versions.node.startsWith('22.')) {
      expect(result.stdout.trim()).toBe(process.versions.node)
      expect(result.status).toBe(17)
    } else {
      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('this project requires Node 22')
    }
  })

  it('fails closed when an explicit conformance test path is missing', () => {
    for (const scriptName of ['test:conformance', 'test:chat:conformance']) {
      const files = listedVitestFiles(scriptName)
      expect(files.length).toBeGreaterThan(0)
      for (const file of files) {
        expect(existsSync(resolve(root, file)), `${scriptName} names missing test ${file}`).toBe(true)
      }
    }


    const missingPath = 'tests/unit/release/__missing-listed-vitest-path__.test.ts'
    const preflight = spawnSync(
      process.execPath,
      ['tools/dev/run-listed-vitest.ts', missingPath],
      { cwd: root, encoding: 'utf8' },
    )
    expect(preflight.status).toBe(1)
    expect(preflight.stderr).toContain(`listed vitest path missing:\n${missingPath}`)
    expect(`${preflight.stdout}\n${preflight.stderr}`).not.toContain('RUN  v')
  })

  it('runs only credential-free checks on PRs and reserves full proof for releases', () => {
    const workflow = readWorkflow('.github/workflows/kernel-release-gate.yml')
    const check = workflow.jobs?.check
    const release = workflow.jobs?.['source-proof']
    const fresh = workflow.jobs?.['fresh-checkout-proof']
    expect(workflow.on).toHaveProperty('pull_request')
    expect(workflow.on?.push).toEqual({ tags: ['v*'] })
    expect(check?.if).toBe("github.event_name == 'pull_request'")
    expect(JSON.stringify(check)).not.toMatch(/secrets\./u)
    expect(check?.steps?.some((step) => step.run === 'npm run check')).toBe(true)
    expect(release?.if).toContain("startsWith(github.ref, 'refs/tags/v')")
    expect(fresh?.if).toContain("startsWith(github.ref, 'refs/tags/v')")
    expect(release?.steps?.some((step) => step.run === 'npm run gate')).toBe(true)
    expect(release?.steps?.some((step) => step.run === 'git diff --exit-code -- convex/_generated')).toBe(true)
  })


  it('keeps the chat staging smoke opt-in, exact-revision, and secret-contained', () => {
    const workflow = readWorkflow('.github/workflows/kernel-release-gate.yml')
    const staging = workflow.jobs?.['chat-staging-proof']
    expect(staging?.if).toBe("github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.confirm_chat_staging_smoke == true")
    expect(staging?.needs).toBe('source-proof')
    expect(staging?.environment).toBe('staging')
    expect(staging?.env).toMatchObject({
      PLAYWRIGHT_BASE_URL: '${{ vars.AE_CHAT_STAGING_BASE_URL }}',
      AE_RELEASE_SOURCE_REVISION: '${{ github.sha }}',
    })

    const stagingConfig = JSON.stringify(staging ?? {})
    expect(stagingConfig).not.toMatch(/confirm_live_gateway_spend|CDP_|STRIPE_|AE_GATEWAY_SMOKE_/u)
    const install = staging?.steps?.find((step) => step.name === 'Frozen dependency install without lifecycle scripts')
    expect(install?.run).toBe('npm ci --ignore-scripts')
    const browserInstall = staging?.steps?.find((step) => step.name === 'Install the staging browser')
    expect(browserInstall?.run).toBe('npm exec -- playwright install --with-deps chromium')

    const storage = staging?.steps?.find((step) => step.name === 'Write the private owner browser session')
    expect(storage?.env).toEqual({
      AE_CHAT_STAGING_OWNER_STORAGE_STATE_JSON: '${{ secrets.AE_CHAT_STAGING_OWNER_STORAGE_STATE_JSON }}',
    })
    expect(storage?.run).toContain('${RUNNER_TEMP}/ae-chat-owner-storage-state.json')
    expect(storage?.run).toContain('umask 077')
    expect(storage?.run).toContain('chmod 600')
    expect(storage?.run).toContain('SMOKE_OWNER_STORAGE_STATE=${owner_storage_state}')
    expect(storage?.run).toContain('${GITHUB_ENV}')

    const smoke = staging?.steps?.find((step) => step.name === 'Run the exact-revision chat staging smoke')
    expect(smoke?.run).toBe('npm run smoke:chat:staging')
    expect(smoke?.env).toEqual({
      VERCEL_AUTOMATION_BYPASS_SECRET: '${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}',
    })
    const upload = staging?.steps?.find((step) => step.name === 'Upload only the sanitized chat staging result')
    expect(upload?.if).toBe('always()')
    expect(upload?.with).toMatchObject({
      name: 'release-${{ github.sha }}-${{ github.run_id }}-chat-staging-smoke',
      path: 'output/release/playwright-chat-staging-smoke.json',
      'if-no-files-found': 'error',
    })
    expect(upload?.with?.path).not.toMatch(/trace|screenshot|storage|\.env|secret|token|working/u)

    const dispatch = workflow.on?.['workflow_dispatch'] as {
      inputs?: {
        confirm_chat_staging_smoke?: {
          default?: boolean
          description?: string
          type?: string
        }
      }
    } | undefined
    expect(dispatch?.inputs?.confirm_chat_staging_smoke?.default).toBe(false)
    expect(dispatch?.inputs?.confirm_chat_staging_smoke?.type).toBe('boolean')
    expect(dispatch?.inputs?.confirm_chat_staging_smoke?.description).toMatch(/deployed staging host.*exact source revision.*private owner browser session/u)

    const workflowText = readFileSync(resolve(root, '.github/workflows/kernel-release-gate.yml'), 'utf8')
    expect(workflowText).not.toContain('answer-suite-report')
    expect(workflowText).not.toContain('test:eval:report')
  })

  it('provides every production manifest requirement to the live gateway job', () => {
    const workflow = readWorkflow('.github/workflows/kernel-release-gate.yml')
    const liveEnvironment = workflow.jobs?.['live-gateway-proof']?.env ?? {}
    const requiredNames = DEPLOYMENT_MANIFEST.configuration.requiredProduction
      .flatMap(({ names }) => names)
      .concat(DEPLOYMENT_MANIFEST.configuration.controlledPackage5.flatMap(({ names }) => names))

    expect(Object.keys(liveEnvironment)).toEqual(expect.arrayContaining(requiredNames))
    expect(liveEnvironment).toMatchObject({
      AE_LLM_MODEL: '${{ vars.AE_LLM_MODEL }}',
      AE_CHAT_PROXY_SECRET: '${{ secrets.AE_CHAT_PROXY_SECRET }}',
      AE_X402_CDP_EXPECTED_EVM_ADDRESS: '${{ secrets.AE_X402_CDP_EXPECTED_EVM_ADDRESS }}',
      AE_X402_CDP_ACCOUNT_POLICY_ID: '${{ secrets.AE_X402_CDP_ACCOUNT_POLICY_ID }}',
      AE_X402_CDP_PROJECT_POLICY_ID: '${{ secrets.AE_X402_CDP_PROJECT_POLICY_ID }}',
      AE_X402_CDP_POLICY_RULES_DIGEST: '${{ secrets.AE_X402_CDP_POLICY_RULES_DIGEST }}',
      AE_X402_CDP_CREDENTIAL_GENERATION: '${{ secrets.AE_X402_CDP_CREDENTIAL_GENERATION }}',
      AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '${{ secrets.AE_X402_CUSTODY_DAILY_MAX_ATOMIC }}',
    })
  })

  it('keeps the paid gateway smoke explicit and production-approved', () => {
    expect(releaseCommandChain('test:release')).not.toContain('smoke:gateway:production')
    const gatewayChain = releaseCommandChain('test:release:live-gateway')
    expect(gatewayChain.match(/npm run smoke:gateway:production/g)).toHaveLength(1)

    const workflow = readWorkflow('.github/workflows/kernel-release-gate.yml')
    const live = workflow.jobs?.['live-gateway-proof']
    expect(live?.if).toBe("github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.confirm_live_gateway_spend == true")
    expect(live?.name).toBe('Opt-in production-approved exact-revision paid gateway smoke')
    expect(live?.environment).toBe('production')
    expect(live?.needs).toBe('source-proof')

    const prepareIndex = live?.steps?.findIndex((step) => step.name === 'Prepare a run-scoped paid Checkout before any external payment') ?? -1
    const preparationUploadIndex = live?.steps?.findIndex((step) => step.name === 'Upload the exact run-scoped Checkout preparation artifact') ?? -1
    const completeIndex = live?.steps?.findIndex((step) => step.name === 'Observe same-run paid provider state and emit the strict receipt') ?? -1
    const validatorIndex = live?.steps?.findIndex((step) => step.name === 'Independently validate the strict opt-in paid gateway receipt') ?? -1
    const uploadIndex = live?.steps?.findIndex((step) => step.name === 'Upload the validated strict opt-in paid gateway receipt') ?? -1
    const manifestIndex = live?.steps?.findIndex((step) => step.name === 'Verify production deployment manifest before live smoke') ?? -1
    expect(manifestIndex).toBeGreaterThanOrEqual(0)
    expect(live?.steps?.[manifestIndex]?.run).toBe('npm run verify:deployment-manifest -- --environment production')
    expect(manifestIndex).toBeLessThan(prepareIndex)
    expect(prepareIndex).toBeLessThan(preparationUploadIndex)
    expect(preparationUploadIndex).toBeLessThan(completeIndex)
    expect(completeIndex).toBeLessThan(validatorIndex)
    expect(validatorIndex).toBeLessThan(uploadIndex)
    const prepare = live?.steps?.[prepareIndex]
    expect(prepare?.run).toContain('npm run smoke:gateway:production -- --receipt output/release/operation-gateway-topup-preparation.json')
    expect(prepare?.if).toBe("inputs.live_gateway_stage == 'prepare'")
    const complete = live?.steps?.[completeIndex]
    expect(complete?.run).toContain('npm run smoke:gateway:production -- --receipt output/release/operation-gateway-smoke.json')
    expect(complete?.if).toBe("inputs.live_gateway_stage == 'complete'")
    expect(live?.steps?.[preparationUploadIndex]?.if).toBe("inputs.live_gateway_stage == 'prepare'")
    expect(live?.steps?.[uploadIndex]?.if).toBe("inputs.live_gateway_stage == 'complete'")
    for (const name of [
      'AE_GATEWAY_SMOKE_CONFIRM_LIVE_SPEND',
      'AE_GATEWAY_SMOKE_RUN_ID',
      'AE_GATEWAY_SMOKE_TOPUP_STAGE',
      'AE_GATEWAY_SMOKE_API_KEY',
      'AE_GATEWAY_SMOKE_OWNER_CLERK_SESSION_ID',
      'AE_GATEWAY_SMOKE_OWNER_CLERK_USER_ID',
      'AE_GATEWAY_SMOKE_OWNER_OPENAPI_DOCUMENT_JSON',
      'AE_GATEWAY_SMOKE_OWNER_OPENAPI_PATH',
      'AE_GATEWAY_SMOKE_OWNER_OPENAPI_METHOD',
      'AE_GATEWAY_SMOKE_CREDENTIAL_ID',
      'AE_GATEWAY_SMOKE_TOPUP_AMOUNT_JSON',
      'AE_RELEASE_CONVEX_DEPLOYMENT_ID',
      'AE_RELEASE_CONVEX_URL',
      'CLERK_SECRET_KEY',
    ]) expect(complete?.env?.[name] ?? live?.env?.[name]).toBeDefined()
    expect(complete?.run).toContain('AE_GATEWAY_SMOKE_PAYOUT_IDEMPOTENCY_KEY')
    const workflowText = readFileSync(resolve(root, '.github/workflows/kernel-release-gate.yml'), 'utf8')
    expect(workflowText).not.toContain('AE_GATEWAY_SMOKE_TOPUP_WEBHOOK_RAW_BODY')
    expect(workflowText).not.toContain('AE_GATEWAY_SMOKE_TOPUP_WEBHOOK_SIGNATURE')
    expect(workflowText).not.toContain('AE_GATEWAY_SMOKE_TOPUP_EXTERNAL_REF')
    expect(workflowText).toContain('actions/download-artifact@v4')
    expect(workflowText).toContain('live_gateway_prepare_workflow_run_id')
    const upload = live?.steps?.[uploadIndex]
    expect(upload?.with?.path).toBe('output/release/operation-gateway-smoke.json')
    expect(upload?.with?.['if-no-files-found']).toBe('error')

    const dispatch = workflow.on?.['workflow_dispatch'] as {
      inputs?: {
        confirm_live_gateway_spend?: { default?: boolean }
        live_gateway_run_id?: { type?: string }
        live_gateway_stage?: { type?: string }
        live_gateway_prepare_workflow_run_id?: { type?: string }
      }
    } | undefined
    expect(dispatch?.inputs?.confirm_live_gateway_spend?.default).toBe(false)
    expect(dispatch?.inputs?.live_gateway_run_id?.type).toBe('string')
    expect(dispatch?.inputs?.live_gateway_stage?.type).toBe('choice')
    expect(dispatch?.inputs?.live_gateway_prepare_workflow_run_id?.type).toBe('string')
    expect(live?.env?.CDP_API_KEY_ID).toBe('${{ secrets.CDP_API_KEY_ID }}')
    expect(live?.env?.CDP_API_KEY_SECRET).toBe('${{ secrets.CDP_API_KEY_SECRET }}')
    expect(live?.env?.CDP_WALLET_SECRET).toBe('${{ secrets.CDP_WALLET_SECRET }}')
    expect(live?.env?.AE_X402_CDP_ACCOUNT_NAME).toBe('${{ secrets.AE_X402_CDP_ACCOUNT_NAME }}')
    expect(live?.env?.AE_X402_CUSTODY_ENABLED).toBe('true')
    expect(live?.env?.AE_X402_CUSTODY_MAX_ATOMIC).toBe('${{ secrets.AE_X402_CUSTODY_MAX_ATOMIC }}')
    expect(live?.env?.AE_X402_RPC_URLS_JSON).toBe('${{ secrets.AE_X402_RPC_URLS_JSON }}')
  })

  it('proves a fresh checkout reaches a sellable local sandbox with only the Clerk development instance', () => {
    const workflow = readWorkflow('.github/workflows/kernel-release-gate.yml')
    const fresh = workflow.jobs?.['fresh-checkout-proof']
    expect(fresh).toBeDefined()
    expect(fresh?.['timeout-minutes']).toBe(30)

    // The app mounts ClerkProvider unconditionally, so the only credentials
    // this job may receive are the Clerk development instance's.
    const freshConfig = JSON.stringify(fresh ?? {})
    const secretRefs = [...freshConfig.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1])
    expect(new Set(secretRefs)).toEqual(new Set([
      'AE_AUTHENTICATED_E2E_OWNER_EMAIL',
      'AE_AUTHENTICATED_E2E_CLERK_PUBLISHABLE_KEY',
      'AE_AUTHENTICATED_E2E_CLERK_SECRET_KEY',
    ]))
    expect(fresh?.environment).toBeUndefined()


    const start = fresh?.steps?.find((step) => step.name === 'Start local stack (anonymous Convex, authenticated Clerk)')
    expect(start?.env).toMatchObject({
      CONVEX_AGENT_MODE: 'anonymous',
      CLERK_JWT_ISSUER_DOMAIN: 'https://relative-phoenix-8958.clerk.accounts.dev',
      CLERK_PUBLISHABLE_KEY: '${{ secrets.AE_AUTHENTICATED_E2E_CLERK_PUBLISHABLE_KEY }}',
      CLERK_SECRET_KEY: '${{ secrets.AE_AUTHENTICATED_E2E_CLERK_SECRET_KEY }}',
      AE_E2E_OWNER_EMAIL: '${{ secrets.AE_AUTHENTICATED_E2E_OWNER_EMAIL }}',
      CI: 'true',
    })
    expect(start?.run).toContain('npm run dev:local -- --no-doctor')
    expect(start?.run).toContain('output/fresh-checkout/dev-local.log')
    expect(start?.run).toContain('http://127.0.0.1:3024/api/ready')
    expect(start?.run).toContain('DEV_LOCAL_PID=$!')
    expect(start?.run).toContain('GITHUB_ENV')

    // Consent approval requires the owner's strict reverification in a
    // browser, so no CI job may bind agent authority headlessly.
    expect(fresh?.steps?.some((step) => step.run?.includes('connect:local'))).toBe(false)

    const doctor = fresh?.steps?.find((step) => step.name === 'Doctor')
    expect(doctor?.run).toContain('npm run --silent ae -- doctor --json --base-url http://127.0.0.1:3024 > output/fresh-checkout/doctor.json')
    expect(doctor?.run).toContain('groups.discovery !== "pass"')
    expect(doctor?.run).toContain('find((c) => c.id === "quote")')
    expect(doctor?.run).toContain('!quote')
    expect(doctor?.run).toContain('loopback_readiness_unprovable')
    expect(doctor?.run).toContain('catalogue_absent')
    expect(doctor?.run).toContain('no_buyer_credential')
    expect(doctor?.run).not.toContain('market_requests')

    const upload = fresh?.steps?.find((step) => step.name === 'Upload the fresh-checkout evidence')
    expect(upload?.if).toBe('always()')
    expect(upload?.with).toMatchObject({
      path: 'output/fresh-checkout/',
      'if-no-files-found': 'error',
    })
    expect(upload?.with?.name).toContain('${{ github.sha }}')
    expect(upload?.with?.name).toContain('${{ github.run_id }}')

    const stop = fresh?.steps?.find((step) => step.name === 'Stop local stack')
    expect(stop?.if).toBe('always()')
    expect(stop?.run).toContain('DEV_LOCAL_PID')

    const cache = fresh?.steps?.find((step) => step.uses?.startsWith('actions/cache@'))
    expect(cache?.with?.path).toBe('~/.cache/convex/binaries')
    expect(cache?.with?.key).toContain('convex-backend-version.outputs.version')
  })

  it('keeps React Doctor blocking new errors', () => {
    const workflow = readWorkflow('.github/workflows/react-doctor.yml')
    const doctor = workflowSteps(workflow).find((step) => step.uses?.startsWith('millionco/react-doctor@'))
    expect(doctor?.with?.blocking).toBe('error')
  })
})
