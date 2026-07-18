import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const machinesRoot = 'src/modules/customer-request/route-execution/machines'
const journalRoot = 'src/modules/customer-request/route-execution/journal'
const portsSource = readFileSync('convex/customerRequestRouteExecutionJournalPorts.ts', 'utf8')
const hostSource = readFileSync('convex/customerRequestRouteExecution.ts', 'utf8')

const machineFiles = [
  'start-or-resume.ts',
  'lease-next-dispatch.ts',
  'record-outcome.ts',
  'ports.ts',
  'types.ts',
  'index.ts',
] as const

describe('customer-request route-execution machines thinness', () => {
  it('hosts start/lease/outcome machines under machines/', () => {
    for (const file of machineFiles) {
      expect(statSync(join(machinesRoot, file)).isFile()).toBe(true)
    }
    const index = readFileSync(join(machinesRoot, 'index.ts'), 'utf8')
    expect(index).toContain('startOrResume')
    expect(index).toContain('leaseNextDispatch')
    expect(index).toContain('recordOutcome')
    expect(index).toContain('JournalMutationPorts')
  })

  it('keeps machines free of Convex runtime; effects only via JournalMutationPorts', () => {
    for (const file of listTsFiles(machinesRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/\bActionCtx\b/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
      expect(source).not.toMatch(/\bQueryCtx\b/)
      expect(source).not.toMatch(/\bDoc\s*</)
      expect(source).not.toMatch(/\bctx\.db\b/)
      expect(source).not.toMatch(/\bctx\.scheduler\b/)
    }
    const start = readFileSync(join(machinesRoot, 'start-or-resume.ts'), 'utf8')
    const lease = readFileSync(join(machinesRoot, 'lease-next-dispatch.ts'), 'utf8')
    const outcome = readFileSync(join(machinesRoot, 'record-outcome.ts'), 'utf8')
    for (const source of [start, lease, outcome]) {
      expect(source).toContain('JournalMutationPorts')
      expect(source).toContain('ports.')
    }
  })

  it('forbids WritePlan DTOs in machines and journal', () => {
    for (const file of [...listTsFiles(machinesRoot), ...listTsFiles(journalRoot)]) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bwritePlan\b/)
      expect(source).not.toMatch(/\bintendedPatches\b/)
    }
  })

  it('keeps journal free of machines / ports imports', () => {
    for (const file of listTsFiles(journalRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/route-execution\/machines/)
      expect(source).not.toMatch(/JournalMutationPorts/)
      expect(source).not.toMatch(/from\s+['"]\.\.\/machines/)
    }
  })

  it('wires host through journalMutationPorts without sibling Start/Lease/Outcome hosts', () => {
    expect(hostSource).toContain('journalMutationPorts(ctx)')
    expect(portsSource).toContain('export function journalMutationPorts')
    expect(portsSource.split('\n').length).toBeLessThanOrEqual(1000)
    for (const forbidden of [
      'convex/customerRequestRouteExecutionStart.ts',
      'convex/customerRequestRouteExecutionLease.ts',
      'convex/customerRequestRouteExecutionOutcome.ts',
    ]) {
      expect(() => statSync(forbidden)).toThrow()
    }
  })

  it('keeps each machines file under 1000 lines', () => {
    for (const file of listTsFiles(machinesRoot)) {
      const lines = readFileSync(file, 'utf8').split('\n').length
      expect(lines, file).toBeLessThanOrEqual(1000)
    }
  })
})

function listTsFiles(directory: string): string[] {
  const entries = readdirSync(directory)
  const files: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) files.push(...listTsFiles(path))
    else if (entry.endsWith('.ts')) files.push(path)
  }
  return files
}
