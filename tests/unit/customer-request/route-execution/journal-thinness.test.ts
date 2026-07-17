import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const convexHost = readFileSync('convex/customerRequestRouteExecution.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/route-execution/journal'

const movedSymbols = [
  'routeRunIdentityDigest',
  'routeAttemptIntegrityValid',
  'routeDispatchIntegrityValid',
  'exportState',
] as const

const hostMachines = [
  'startOrResume',
  'leaseNextDispatch',
  'recordOutcome',
] as const

describe('customer-request route-execution journal thinness', () => {
  it('does not redefine moved integrity helpers in Convex', () => {
    for (const symbol of movedSymbols) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
  })

  it('imports journal helpers and still references them', () => {
    expect(convexHost).toContain("from '@/modules/customer-request/route-execution/journal'")
    for (const symbol of movedSymbols) {
      expect(convexHost).toContain(symbol)
    }
  })

  it('keeps host start/lease/outcome machines in Convex', () => {
    for (const symbol of hostMachines) {
      expect(convexHost).toMatch(new RegExp(`export const ${symbol}\\s*=`))
    }
  })

  it('keeps journal free of Convex runtime', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/\bActionCtx\b/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
      expect(source).not.toMatch(/\bQueryCtx\b/)
      expect(source).not.toMatch(/\bDoc\s*</)
    }
  })

  it('keeps host parseBoundedJson and exportedStepState', () => {
    expect(convexHost).toMatch(/(?:^|\n)function\s+parseBoundedJson\b/)
    expect(convexHost).toContain('const exportedStepState = v.union(')
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
