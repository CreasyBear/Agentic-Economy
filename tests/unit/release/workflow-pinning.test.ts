import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const files = ['cli-release.yml', 'kernel-release-gate.yml']
type Job = { env?: Record<string, unknown>; permissions?: Record<string, string> }
type Workflow = { permissions?: Record<string, string>; jobs: Record<string, Job> }

describe.each(files)('%s hardening', (file) => {
  const text = readFileSync(`.github/workflows/${file}`, 'utf8')
  const workflow = parse(text) as Workflow

  it('pins every action to a full commit SHA', () => {
    const uses = [...text.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm)].map((m) => m[1])
    expect(uses.length).toBeGreaterThan(0)
    for (const u of uses) expect(u).toMatch(/@[0-9a-f]{40}$/)
  })

  it('keeps secrets out of job-level env', () => {
    for (const job of Object.values(workflow.jobs))
      for (const value of Object.values(job.env ?? {}))
        expect(String(value)).not.toMatch(/secrets\./)
  })

  it('does not grant id-token at workflow level', () => {
    expect(workflow.permissions?.['id-token']).toBeUndefined()
  })
})
