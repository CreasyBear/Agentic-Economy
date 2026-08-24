import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

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

describe('green release baseline', () => {
  it('executes every required source sub-gate through gate:release', () => {
    const chain = releaseCommandChain('gate:release')
    expect(releaseCommandChain('test:release:source')).toContain('npm run verify:deployment-manifest -- --environment development')
    for (const subGate of [
      'test:conformance',
      'test:chat:conformance',
      'generate:convex',
      'check:convex-codegen',
      'lint',
      'typecheck',
      'test:release:unit',
      'test:release:integration',
      'test:types',
      'test:imports',
      'test:ts-standards',
      'test:seo',
      'test:ui-contract',
      'test:e2e',
      'test:e2e:a11y',
      'test:cli-package',
      'build',
    ]) {
      expect(chain, `gate:release must execute ${subGate}`).toContain(`npm run ${subGate}`)
    }
    const sourceScript = scripts['test:release:source']!
    const orderedSourceGates = [
      'verify:deployment-manifest',
      'test:conformance',
      'test:chat:conformance',
      'generate:convex',
      'check:convex-codegen',
      'test:release:source:after-codegen',
    ]
    for (let index = 1; index < orderedSourceGates.length; index += 1) {
      expect(sourceScript.indexOf(`npm run ${orderedSourceGates[index]!}`)).toBeGreaterThan(
        sourceScript.indexOf(`npm run ${orderedSourceGates[index - 1]!}`),
      )
    }
    expect(scripts['generate:convex']).toBe('convex codegen --typecheck=disable')
    expect(scripts['check:convex-codegen']).toBe('convex codegen --dry-run --typecheck=disable')
    expect(scripts['smoke:chat:staging']).toBe(
      'node tools/dev/run-with-cleanup.mjs playwright test --config=playwright.chat-staging.config.ts',
    )
    expect(chain).not.toContain('npm run test:eval:report')
  })

  it('keeps pull requests credential-free and protected releases generated-source proof', () => {
    const workflow = readWorkflow('.github/workflows/kernel-release-gate.yml')
    const events = workflow.on ?? {}
    expect(events).toHaveProperty('pull_request')
    expect(events).toHaveProperty('merge_group')
    expect(events.push).toEqual({ branches: ['main'] })
    const steps = workflowSteps(workflow)

    const source = workflow.jobs?.['source-proof']
    expect(source).toBeDefined()
    const sourceConfig = JSON.stringify(source ?? {})
    expect(sourceConfig).not.toContain('CONVEX_DEPLOY_KEY')
    expect(sourceConfig).not.toContain('secrets.')
    const generateIndex = source?.steps?.findIndex((step) => step.name === 'Generate Convex source normally') ?? -1
    const dryRunIndex = source?.steps?.findIndex((step) => step.name === 'Verify generated Convex source with a dry run') ?? -1
    const driftIndex = source?.steps?.findIndex((step) => step.name === 'Prove committed Convex generated source is current') ?? -1
    const sourceGateIndex = source?.steps?.findIndex((step) => step.name === 'Run source release contract without deployment credentials') ?? -1
    expect(source?.steps?.[generateIndex]?.run).toBe('npm run generate:convex')
    expect(source?.steps?.[dryRunIndex]?.run).toBe('npm run check:convex-codegen')
    expect(source?.steps?.[driftIndex]?.run).toBe('git diff --exit-code -- convex/_generated')
    expect(generateIndex).toBeLessThan(dryRunIndex)
    expect(dryRunIndex).toBeLessThan(driftIndex)
    expect(driftIndex).toBeLessThan(sourceGateIndex)
    const sourceGate = source?.steps?.find((step) => step.name === 'Run source release contract without deployment credentials')
    expect(sourceGate?.run).toBe('npm run test:release:source:after-codegen')
    expect(sourceGate?.env).toBeUndefined()
    const chatGate = source?.steps?.find((step) => step.name === 'Run deterministic operation chat conformance')
    expect(chatGate?.run).toBe('npm run test:chat:conformance')

    const uploads = steps.filter((step) => step.uses?.startsWith('actions/upload-artifact@'))
    for (const upload of uploads) {
      const artifactName = upload.with?.name ?? ''
      if (artifactName.includes('paid-gateway-smoke-receipt')) {
        expect(upload.if).toBe("inputs.live_gateway_stage == 'complete'")
      } else if (artifactName.includes('gateway-topup-preparation')) {
        expect(upload.if).toBe("inputs.live_gateway_stage == 'prepare'")
      } else if (artifactName.includes('chat-staging-smoke')) {
        expect(upload.if).toBe('always()')
        expect(upload.with?.path).toBe('output/release/playwright-chat-staging-smoke.json')
      } else {
        expect(upload.if).toBe('always()')
        expect(artifactName).toContain('source-release-gate')
      }
      expect(artifactName).toContain('${{ github.sha }}')
      expect(artifactName).toContain('${{ github.run_id }}')

      const artifactPaths = upload.with?.path ?? ''
      expect(`${artifactName}\n${artifactPaths}`).not.toMatch(/(?:^|[\\/\n])\.env(?:$|[.*\\/])/i)
      expect(`${artifactName}\n${artifactPaths}`).not.toMatch(/(?:credential|secret|token|private-key)/i)
    }
    const sourceUpload = uploads.find((upload) => upload.with?.name?.includes('source-release-gate'))
    expect(sourceUpload?.with?.path).toContain('output/release/chat-conformance-vitest.json')

    const workflowText = readFileSync(resolve(root, '.github/workflows/kernel-release-gate.yml'), 'utf8')
    expect(workflowText).not.toContain('answer-suite-report')
    expect(workflowText).not.toContain('test:eval:report')

    const metadataRuns = steps
      .map((step) => step.run ?? '')
      .filter((run) => run.includes('evidenceClass'))
    expect(metadataRuns).toHaveLength(1)
    for (const run of metadataRuns) {
      expect(run).toContain('${GITHUB_SHA}')
      expect(run).toContain('${GITHUB_RUN_ID}')
      expect(run).toContain('sanitized: true')
    }
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
      VERCEL_AUTOMATION_BYPASS_SECRET: '${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}',
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
    expect(smoke?.env).toBeUndefined()
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

  it('keeps React Doctor explicitly advisory', () => {
    const workflow = readWorkflow('.github/workflows/react-doctor.yml')
    const doctor = workflowSteps(workflow).find((step) => step.uses?.startsWith('millionco/react-doctor@'))
    expect(doctor?.with?.blocking).toBe('none')
  })
})
