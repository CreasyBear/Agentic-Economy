import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const convexHost = readFileSync('convex/capabilitySupply.ts', 'utf8')
const moduleRoot = 'src/modules/capability-supply/internal/operation-ledger'

const movedBodies = [
  'beginOperation',
  'failOperation',
  'succeedOperation',
  'replayOperationResult',
  'ensureSupplyAudit',
  'verifyReplayAudits',
  'recoverOfferingReplay',
  'recoverBindingReplay',
  'replayQuarantineBinding',
  'recoverEligibilityReplayDesired',
  'trustedQuarantineParent',
] as const

describe('capability-supply operation-ledger thinness', () => {
  it('does not redefine moved ledger helpers in Convex host', () => {
    for (const symbol of movedBodies) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
  })

  it('keeps thin (db, command, now) command re-exports via portsFor', () => {
    expect(convexHost).toContain("from '@/modules/capability-supply/public'")
    expect(convexHost).not.toMatch(/from\s+['"]@\/modules\/capability-supply\/internal(?:\/[^'"]*)?['"]/)
    expect(convexHost).toContain('capabilitySupplyOperationPorts')
    expect(convexHost).toContain('function portsFor')
    expect(convexHost).toMatch(/export async function registerCapabilityOfferingCommand\s*\(/)
    expect(convexHost).toMatch(/export async function registerCapabilityBindingCommand\s*\(/)
    expect(convexHost).toMatch(/export async function setCapabilitySupplyEligibilityCommand\s*\(/)
    expect(convexHost).toMatch(/export async function quarantineCapabilityBindingCommand\s*\(/)
    expect(convexHost).toContain('runRegisterOfferingCommand(portsFor(db)')
    expect(convexHost).toContain('runRegisterBindingCommand(portsFor(db)')
    expect(convexHost).toContain('runSetEligibilityCommand(portsFor(db)')
    expect(convexHost).toContain('runQuarantineCommand(portsFor(db)')
  })

  it('leaves thin writer wrappers in the host and delegates listIntegrated via ports', () => {
    expect(convexHost).toMatch(/export async function registerCapabilityOffering\s*\(/)
    expect(convexHost).toMatch(/export async function registerCapabilityTransportBinding\s*\(/)
    expect(convexHost).toMatch(/export async function setCapabilitySupplyEligibility\s*\(/)
    expect(convexHost).toContain('capabilitySupplyWriterPorts')
    expect(convexHost).toMatch(/export async function listIntegratedCapabilitySupply\s*\(/)
    expect(convexHost).toContain('listIntegratedCapabilitySupplyFromModule(eligibleSupplyPorts(db)')
    expect(convexHost).toMatch(/export const publishCapability\s*=/)
  })

  it('keeps operation-ledger free of Convex runtime imports', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
      expect(source).not.toMatch(/\bQueryCtx\b/)
      expect(source).not.toMatch(/\bDoc\s*</)
    }
  })

  it('does not merge ledger into offering/binding folders', () => {
    for (const folder of ['offering', 'binding', 'eligibility', 'quarantine', 'shared']) {
      for (const file of listTsFiles(join('src/modules/capability-supply/internal', folder))) {
        const source = readFileSync(file, 'utf8')
        expect(source).not.toMatch(/\bbeginOperation\b/)
        expect(source).not.toMatch(/\bensureSupplyAudit\b/)
        expect(source).not.toMatch(/registerCapabilityOfferingCommand/)
      }
    }
  })

  it('publication may compose ledger without relocating helpers', () => {
    for (const file of listTsFiles(join('src/modules/capability-supply/internal', 'publication'))) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+beginOperation\b/)
      expect(source).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+ensureSupplyAudit\b/)
      expect(source).not.toMatch(/registerCapabilityOfferingCommand/)
    }
  })
})


