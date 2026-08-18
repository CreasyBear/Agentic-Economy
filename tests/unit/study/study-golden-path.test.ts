import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { findAction } from '@/modules/actions'
import { studyJournalEventSchema } from '@/modules/study/public'

describe('WorkTree Study golden path characterization', () => {
  it('keeps study.start as the only write that moves a node into studying with a durable journal', () => {
    const start = findAction('study.start')
    const inspect = findAction('study.inspect')
    expect(start).toBeDefined()
    expect(inspect).toBeDefined()
    expect(start?.summary).toMatch(/studying/i)
    expect(start?.summary).toMatch(/journal/i)
    expect(start?.invocationContract.expectedEvidence.join(' ')).toMatch(/scan_started/i)
    expect(inspect?.readOnly).toBe(true)
    expect(inspect?.summary).toMatch(/chronology|journal|replay/i)
  })

  it('requires Study journal events to be digest-bound and typed through the RFx machine schema', () => {
    const parsed = studyJournalEventSchema.safeParse({
      type: 'scan_started',
      studyId: 'study:demo',
      projectId: 'project:demo',
      nodeId: 'node:study',
      generation: 1,
      revision: 1,
      timestamp: 1,
      digest: 'sha256:placeholder',
    })
    // Missing operationKey + evidenceClass must fail closed.
    expect(parsed.success).toBe(false)

    const studiesSource = readFileSync('convex/studies.ts', 'utf8')
    expect(studiesSource).toContain('study_tables_unlisted')
    expect(studiesSource).not.toContain('studyEvents')
  })

  it('keeps xstate as the Study RFx machine dependency (no bespoke DAG replacement)', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies.xstate).toMatch(/^\^?5\./)
    const machine = readFileSync('src/modules/study/internal/rfx-machine.ts', 'utf8')
    expect(machine).toMatch(/from ['"]xstate['"]/)
  })
})
