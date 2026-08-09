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
  needs?: string
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
    for (const subGate of [
      'check:convex-codegen',
      'lint',
      'typecheck',
      'check:kernel-retirement',
      'test:release:unit',
      'test:release:integration',
      'test:types',
      'test:imports',
      'test:ts-standards',
      'test:seo',
      'test:ui-contract',
      'test:eval:report',
      'build',
    ]) {
      expect(chain, `gate:release must execute ${subGate}`).toContain(`npm run ${subGate}`)
    }
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
    const sourceCodegen = source?.steps?.find((step) => step.name === 'Verify committed Convex generated source')
    expect(sourceCodegen).toBeUndefined()
    const sourceGate = source?.steps?.find((step) => step.name === 'Run source release contract without deployment credentials')
    expect(sourceGate?.run).toBe('npm run test:release:source:after-codegen')
    expect(sourceGate?.env).toBeUndefined()

    const hosted = workflow.jobs?.['hosted-proof']
    expect(hosted).toBeDefined()
    expect(hosted?.if).toBe('github.event_name != \'pull_request\' && github.ref == \'refs/heads/main\'')
    expect(hosted?.environment).toBe('production')
    expect(hosted?.needs).toBe('source-proof')
    const hostedCodegenIndex = hosted?.steps?.findIndex((step) => step.name === 'Verify committed Convex generated source') ?? -1
    const hostedCodegen = hosted?.steps?.[hostedCodegenIndex]
    expect(hostedCodegenIndex).toBeGreaterThanOrEqual(0)
    expect(hosted?.steps?.findIndex((step) => step.name === 'Refuse a checkout other than the triggering revision')).toBeLessThan(hostedCodegenIndex)
    expect(hosted?.steps?.findIndex((step) => step.name === 'Deploy the dual-compatible exact clean source revision')).toBeGreaterThan(hostedCodegenIndex)
    expect(hostedCodegen?.run).toBe('npm run check:convex-codegen')
    expect(hostedCodegen?.env?.CONVEX_DEPLOY_KEY).toBe('${{ secrets.CONVEX_DEPLOY_KEY }}')

    const uploads = steps.filter((step) => step.uses?.startsWith('actions/upload-artifact@'))
    expect(uploads.length).toBeGreaterThan(0)
    for (const upload of uploads) {
      const artifactName = upload.with?.name ?? ''
      expect(upload.if).toBe('always()')
      expect(artifactName).toContain('${{ github.sha }}')
      expect(artifactName).toContain('${{ github.run_id }}')
      expect(artifactName).toMatch(/(?:source|hosted)-(?:release-gate|work-tree)/)

      const artifactPaths = upload.with?.path ?? ''
      expect(`${artifactName}\n${artifactPaths}`).not.toMatch(/(?:^|[\\/\n])\.env(?:$|[.*\\/])/i)
      expect(`${artifactName}\n${artifactPaths}`).not.toMatch(/(?:credential|secret|token|private-key)/i)
    }

    const metadataRuns = steps
      .map((step) => step.run ?? '')
      .filter((run) => run.includes('evidenceClass'))
    expect(metadataRuns).toHaveLength(2)
    for (const run of metadataRuns) {
      expect(run).toContain('${GITHUB_SHA}')
      expect(run).toContain('${GITHUB_RUN_ID}')
      expect(run).toContain('sanitized: true')
    }
  })

  it('keeps React Doctor explicitly advisory', () => {
    const workflow = readWorkflow('.github/workflows/react-doctor.yml')
    const doctor = workflowSteps(workflow).find((step) => step.uses?.startsWith('millionco/react-doctor@'))
    expect(doctor?.with?.blocking).toBe('none')
  })
})
