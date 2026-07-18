import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const convexHost = readFileSync('convex/customerRequestRouteExecution.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/route-execution/journal'

const movedSymbols = [
  'routeRunIdentityDigest',
  'routeAttemptIntegrityValid',
  'routeDispatchIntegrityValid',
  'projectCustomerEvidenceExport',
  'cancelCommandArgsConflict',
  'cancelPriorCommandConflicts',
  'cancelReplayKind',
  'cancelRunNotFound',
  'cancelRunHeadIntegrityValid',
  'canPreReleaseCancel',
  'canRequestAdapterCancellation',
  'cancelDisposition',
  'leaseArgsInvalid',
  'leasePendingCandidateValid',
  'leaseGrantExpired',
  'recoverDispatchLeaseStillCurrent',
  'recoverDispatchAttemptAligned',
  'recoverExpiredDispatchKind',
] as const

// DEFER: start/lease/outcome machines stay host-exported until a journal write-plan ADR.
const hostMachines = [
  'startOrResume',
  'leaseNextDispatch',
  'recordOutcome',
] as const

describe('customer-request route-execution journal thinness', () => {
  it('does not redefine moved journal helpers in Convex', () => {
    for (const symbol of movedSymbols) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
    expect(convexHost).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+exportState\b/)
    expect(convexHost).not.toMatch(/(?:^|\n)const\s+exportState\s*=/)
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

  it('keeps journal free of Convex runtime and write-plan DTOs', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/\bActionCtx\b/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
      expect(source).not.toMatch(/\bQueryCtx\b/)
      expect(source).not.toMatch(/\bDoc\s*</)
      expect(source).not.toMatch(/\bwritePlan\b/)
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bintendedPatches\b/)
      expect(source).not.toMatch(/\bpatches:\s*\[/)
    }
  })

  it('keeps host parseBoundedJson and exportedStepState', () => {
    expect(convexHost).toMatch(/(?:^|\n)function\s+parseBoundedJson\b/)
    expect(convexHost).toContain('const exportedStepState = v.union(')
  })

  it('keeps exportCustomerEvidence as a thin DB-load adapter', () => {
    expect(convexHost).toMatch(/export const exportCustomerEvidence\s*=/)
    expect(convexHost).toContain('projectCustomerEvidenceExport({')
    expect(convexHost).not.toContain('providerOrigin: new URL(')
    expect(convexHost).not.toContain('Result evidence')
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
