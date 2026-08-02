import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

type ReleaseScriptMap = Record<string, string>

type WorkflowStep = {
  if?: string
  name?: string
  run?: string
  uses?: string
  with?: Record<string, string>
}

type WorkflowJob = {
  steps?: WorkflowStep[]
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
    expect(steps.filter((step) => step.run === 'npm run gate:release')).toHaveLength(1)

    const uploads = steps.filter((step) => step.uses?.startsWith('actions/upload-artifact@'))
    expect(uploads.length).toBeGreaterThan(0)
    for (const upload of uploads) {
      const artifactName = upload.with?.name ?? ''
      const isConditionalT51Upload = artifactName.includes('-t51-hosted-work-tree')
      expect(upload.if).toBe(isConditionalT51Upload
        ? 'always() && env.AE_WORK_TREE_SETUP_TOKEN != \'\' && env.CLERK_SECRET_KEY != \'\' && env.AE_WORK_TREE_CLERK_INSTANCE_ID != \'\' && env.AE_WORK_TREE_CLERK_SUBJECT != \'\' && env.DEPLOY_CONVEX_URL != \'\' && env.AE_RELEASE_CONVEX_DEPLOYMENT_ID != \'\''
        : 'always()')
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
