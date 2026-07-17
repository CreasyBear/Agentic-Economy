import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const convexHost = readFileSync('convex/capabilitySupply.ts', 'utf8')
const internalRoot = 'src/modules/capability-supply/internal'
const movedFolders = ['offering', 'binding', 'eligibility', 'quarantine', 'publication', 'shared', 'operation-ledger'] as const

const movedSymbols = [
  'desiredEligibility',
  'eligibilityPublicResult',
  'publicationLifecycle',
  'bindingObservedRowDigest',
  'offeringIntegrityIsValid',
  'bindingIntegrityIsValid',
  'quarantineBindingAudit',
  'quarantineParentAudit',
  'supplyAuditEventId',
  'supplyAuditEffectRef',
  'eligibilityReplayAudits',
  'validQuarantineAuditPayload',
  'compareStableIdentifier',
  'writablePresentation',
  'transportAdmissionInput',
  'offeringStatusAfterBindingQuarantine',
  'beginOperation',
  'failOperation',
  'succeedOperation',
  'replayOperationResult',
  'ensureSupplyAudit',
  'verifyReplayAudits',
  'recoverOfferingReplay',
  'recoverBindingReplay',
  'replayQuarantineBinding',
  'trustedQuarantineParent',
  'isTrustedQuarantineParent',
] as const

describe('capability-supply convex host thinness', () => {
  it('does not redefine moved pure helpers in Convex', () => {
    for (const symbol of movedSymbols) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
  })

  it('imports moved behaviors from capability-supply internals', () => {
    expect(convexHost).toContain("from '@/modules/capability-supply/internal/offering'")
    expect(convexHost).toContain("from '@/modules/capability-supply/internal/binding'")
    expect(convexHost).toContain("from '@/modules/capability-supply/internal/eligibility'")
    expect(convexHost).toContain("from '@/modules/capability-supply/internal/quarantine'")
    expect(convexHost).toContain("from '@/modules/capability-supply/internal/publication'")
    expect(convexHost).toContain("from '@/modules/capability-supply/internal/shared'")
    expect(convexHost).toContain("from '@/modules/capability-supply/internal/operation-ledger'")
    for (const symbol of [
      'desiredEligibility',
      'publicationLifecycle',
      'bindingObservedRowDigest',
      'offeringIntegrityIsValid',
      'beginOperation',
      'ensureSupplyAudit',
      'replayOperationResult',
    ]) {
      expect(convexHost).toContain(symbol)
    }
  })

  it('keeps deepened module files free of Convex runtime imports', () => {
    for (const folder of movedFolders) {
      for (const file of listTsFiles(join(internalRoot, folder))) {
        const source = readFileSync(file, 'utf8')
        expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
        expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
        expect(source).not.toMatch(/\bMutationCtx\b/)
        expect(source).not.toMatch(/\bDoc\s*</)
      }
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
