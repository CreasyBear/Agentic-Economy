import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = process.cwd()

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

describe('project record-keeping system', () => {
  it('keeps the authority order and promotion lifecycle explicit', () => {
    const system = read('.planning/records/README.md')

    expect(system).toContain('Production source and executable evidence decide what exists now.')
    expect(system).toContain('`PRODUCT.md` decides the current evidenced state and target product contract.')
    expect(system).toContain('research is not a decision;')
    expect(system).toContain('implementation is not customer reachability;')
  })

  it('registers the agent-callable decision and falsifiable hypotheses', () => {
    const register = read('.planning/records/PROJECT-RECORDS.md')

    expect(register).toContain('| D-001 | ACCEPTED |')
    expect(register).toContain('| D-002 | ACCEPTED |')
    expect(register).toContain('| H-001 | PROPOSED |')
    expect(register).toContain('| H-006 | PROPOSED |')
    expect(register).toContain('**Next field review:**')
  })

  it('keeps knowledge, sources, and unresolved research separately indexed', () => {
    const knowledge = read('.planning/records/KNOWLEDGE-INDEX.md')
    const sources = read('.planning/records/SOURCE-REGISTER.md')
    const queue = read('.planning/records/RESEARCH-QUEUE.md')

    expect(knowledge).toContain('## Product identity and maturity')
    expect(knowledge).toContain('| UNKNOWN |')
    expect(sources).toContain('| S-001 | OpenAI |')
    expect(sources).toContain('Refresh trigger')
    expect(queue).toContain('| P0 | Q-001 |')
    expect(queue).toContain('Closing research does not resolve the associated decision')
  })

  it('keeps active strategic research reviewable and maturity-bounded', () => {
    const research = read('.planning/research/2026-07-17-conversational-agentic-workspace-patterns.md')
    const requiredFields = [
      '**Owner:**',
      '**Status:**',
      '**Maturity:**',
      '**Question:**',
      '**Decision affected:**',
      '**Evidence cutoff:**',
      '**Review by:**',
      '**Supersedes:**',
      '**Superseded by:**',
    ]

    for (const field of requiredFields) expect(research).toContain(field)
    expect(research).toContain('do not establish production reliability')
  })

  it('records the partial-entry product boundary as a proposed ADR', () => {
    const adr = read('.planning/adr/ADR-009-partial-entry-without-request-ownership.md')

    expect(adr).toContain('status: proposed')
    expect(adr).toContain('partial entry')
    expect(adr).toContain('full route')
  })
})
