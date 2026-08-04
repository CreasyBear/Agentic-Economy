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

  it('runs one source gate for every required CI event and publishes sanitized evidence', () => {
    const workflow = readWorkflow('.github/workflows/kernel-release-gate.yml')
    const events = workflow.on ?? {}
    expect(events).toHaveProperty('pull_request')
    expect(events).toHaveProperty('merge_group')
    expect(events.push).toEqual({ branches: ['main'] })
    const steps = workflowSteps(workflow)

    const source = workflow.jobs?.['source-proof']
    const codegen = source?.steps?.find((step) => step.name === 'Verify committed Convex generated source')
    expect(codegen?.run).toBe('npm run check:convex-codegen')
    expect(codegen?.env?.CONVEX_DEPLOY_KEY).toBe('${{ secrets.CONVEX_DEPLOY_KEY }}')
    const sourceGate = source?.steps?.find((step) => step.name === 'Run source release contract without deployment credentials')
    expect(sourceGate?.run).toBe('npm run test:release:source:after-codegen')
    expect(sourceGate?.env).toBeUndefined()

    const hosted = workflow.jobs?.['hosted-proof']
    expect(hosted).toBeDefined()
    expect(hosted?.env?.AE_T51_RELEASE_MODE).toBe('release')
    expect(hosted?.env).not.toHaveProperty('AE_WORK_TREE_SETUP_TOKEN')
    expect(hosted?.env).not.toHaveProperty('AE_WORK_TREE_CLERK_SUBJECT')
    const t51Step = hosted?.steps?.find((step) => step.name === 'Verify exact hosted T51 WorkTree parity')
    expect(t51Step?.if).toBeUndefined()
    const t51Upload = hosted?.steps?.find((step) => step.name === 'Upload sanitized T51 hosted parity evidence')
    expect(t51Upload?.if).toBe('always()')
    expect(t51Upload?.with?.['if-no-files-found']).toBe('error')

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
