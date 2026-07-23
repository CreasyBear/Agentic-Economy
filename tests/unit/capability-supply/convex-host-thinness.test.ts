import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const convexHost = readFileSync('convex/capabilitySupply.ts', 'utf8')
const internalRoot = 'src/modules/capability-supply/internal'
const movedFolders = ['offering', 'binding', 'eligibility', 'quarantine', 'publication', 'shared', 'operation-ledger', 'graph'] as const

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

  it('imports moved behaviors through the capability-supply public seam', () => {
    expect(convexHost).toContain("from '@/modules/capability-supply/public'")
    expect(convexHost).not.toContain("from '@/modules/capability-supply/internal/")
    for (const symbol of [
      'publicationLifecycle',
      'bindingObservedRowDigest',
      'publishCapabilityCommand',
      'refreshCapabilityCommand',
      'registerCapabilityOfferingWrite',
      'queryCapabilityGraphFromModule',
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

  it('delegates eligible inventory reads via ports while keeping thin wrappers', () => {
    expect(convexHost).toContain('eligibleSupplyPorts')
    expect(convexHost).toContain('listEligibleCapabilitySupplyFromModule')
    expect(convexHost).toContain('getEligibleExactCapabilitySupplyFromModule')
    expect(convexHost).toMatch(/export async function listEligibleCapabilitySupply\s*\(/)
    expect(convexHost).toMatch(/export async function getEligibleExactCapabilitySupply\s*\(/)
    expect(convexHost).not.toMatch(/reason: 'eligible_supply_limit_exceeded' as const/)
    expect(convexHost).not.toMatch(/reason: 'supply_integrity_failure' as const/)
    expect(convexHost).not.toMatch(/bindings\.length > input\.limit/)
  })

  it('delegates publish/refresh/withdraw via publication ports while keeping thin wrappers', () => {
    expect(convexHost).toContain('capabilitySupplyPublicationPorts')
    expect(convexHost).toContain('publishCapabilityCommand')
    expect(convexHost).toContain('refreshCapabilityCommand')
    expect(convexHost).toContain('withdrawCapabilityCommand')
    expect(convexHost).toMatch(/function publicationPorts\s*\(/)
    expect(convexHost).toMatch(/export const publishCapability\s*=/)
    expect(convexHost).toMatch(/export const refreshCapability\s*=/)
    expect(convexHost).toMatch(/export const withdrawCapability\s*=/)
    expect(convexHost).not.toMatch(/normalizeCapabilityPublication/)
    expect(convexHost).not.toMatch(/encodeCapabilityContractDocumentJson/)
  })

  it('delegates raw writers via capabilitySupplyWriterPorts while keeping thin wrappers', () => {
    expect(convexHost).toContain('capabilitySupplyWriterPorts')
    expect(convexHost).toContain('registerCapabilityOfferingWrite')
    expect(convexHost).toContain('registerCapabilityTransportBindingWrite')
    expect(convexHost).toContain('setCapabilitySupplyEligibilityWrite')
    expect(convexHost).toMatch(/export async function registerCapabilityOffering\s*\(/)
    expect(convexHost).toMatch(/export async function registerCapabilityTransportBinding\s*\(/)
    expect(convexHost).toMatch(/export async function setCapabilitySupplyEligibility\s*\(/)
    expect(convexHost).not.toMatch(/defineCapabilityOfferingRegistration/)
    expect(convexHost).not.toMatch(/admitRegisteredTransport/)
    expect(convexHost).not.toMatch(/desiredEligibility/)
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
