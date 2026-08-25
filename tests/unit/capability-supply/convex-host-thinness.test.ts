import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const convexHost = readFileSync('convex/capabilitySupply.ts', 'utf8')
const convexSupply = [
  convexHost,
  readFileSync('convex/capabilitySupplyShared.ts', 'utf8'),
  readFileSync('convex/capabilitySupplyPublish.ts', 'utf8'),
  readFileSync('convex/capabilitySupplyProbes.ts', 'utf8'),
  readFileSync('convex/capabilitySupplyGraph.ts', 'utf8'),
  readFileSync('convex/capabilitySupplyLists.ts', 'utf8'),
  readFileSync('convex/capabilitySupplyCommands.ts', 'utf8'),
].join('\n')
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

const retiredUnsignedLifecycleMutations = [
  'registerOffering',
  'registerBinding',
  'registerMapping',
  'setEligibility',
  'quarantineBinding',
] as const

describe('capability-supply convex host thinness', () => {
  it('does not redefine moved pure helpers in Convex', () => {
    for (const symbol of movedSymbols) {
      expect(convexSupply).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexSupply).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
  })

  it('keeps retired unsigned lifecycle mutations absent from the public host and callers', () => {
    for (const name of retiredUnsignedLifecycleMutations) {
      expect(convexHost).not.toMatch(new RegExp(`export const ${name}\\s*=\\s*mutation\\s*\\(`))
      const publicReference = new RegExp(`api\\.capabilitySupply\\.${name}\\b`)
      for (const file of [...listTsFiles('src'), ...listTsFiles('tests'), ...listTsFiles('convex')]) {
        if (file.includes('/_generated/')) continue
        expect(readFileSync(file, 'utf8'), `${file} still references ${name}`).not.toMatch(publicReference)
      }
    }
  })

  it('imports moved behaviors from capability-supply public seam', () => {
    expect(convexSupply).toMatch(/from\s+['"]@\/modules\/capability-supply\/public['"]/)
    expect(convexSupply).not.toMatch(/from\s+['"]@\/modules\/capability-supply\/internal(?:\/[^'"]*)?['"]/)
    for (const symbol of [
      'publicationLifecycle',
      'bindingObservedRowDigest',
      'publishPreparedCapabilityCommand',
      'registerCapabilityOfferingWrite',
      'queryCapabilityGraphFromModule',
    ]) {
      expect(convexSupply).toContain(symbol)
    }
    expect(convexSupply).not.toContain(['publishCapability', 'Command'].join(''))
    expect(convexSupply).not.toContain(['CapabilityPublication', 'CommandImport'].join(''))
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
    expect(convexSupply).toContain('eligibleSupplyPorts')
    expect(convexSupply).toContain('listIntegratedCapabilitySupplyFromModule')
    expect(convexSupply).toContain('getEligibleExactCapabilitySupplyFromModule')
    expect(convexSupply).toMatch(/export async function listIntegratedCapabilitySupply\s*\(/)
    expect(convexSupply).toMatch(/export async function getEligibleExactCapabilitySupply\s*\(/)
    expect(convexSupply).not.toMatch(/reason: 'eligible_supply_limit_exceeded' as const/)
    expect(convexSupply).not.toMatch(/reason: 'supply_integrity_failure' as const/)
    expect(convexSupply).not.toMatch(/bindings\.length > input\.limit/)
  })

  it('keeps prepared publish and curated withdrawal thin while retiring owner bypass mutations', () => {
    expect(convexSupply).toContain('capabilitySupplyPublicationPorts')
    expect(convexSupply).toContain('publishPreparedCapabilityCommand')
    expect(convexSupply).not.toContain('refreshCapabilityCommand')
    expect(convexSupply).toContain('withdrawCapabilityCommand')
    expect(convexSupply).toMatch(/function publicationPorts\s*\(/)
    expect(convexHost).toMatch(/export const publishPreparedCapability\s*=/)
    expect(convexHost).not.toMatch(/export const refreshCapability\s*=/)
    expect(convexHost).not.toMatch(/export const withdrawCapability\s*=/)
    expect(convexSupply).not.toContain(['publishCapability', 'Command'].join(''))
    expect(convexSupply).not.toContain(['CapabilityPublication', 'CommandImport'].join(''))
    expect(convexSupply).not.toMatch(/encodeCapabilityContractDocumentJson/)
  })

  it('delegates raw writers via capabilitySupplyWriterPorts while keeping thin wrappers', () => {
    expect(convexSupply).toContain('capabilitySupplyWriterPorts')
    expect(convexSupply).toContain('registerCapabilityOfferingWrite')
    expect(convexSupply).toContain('registerCapabilityTransportBindingWrite')
    expect(convexSupply).toContain('setCapabilitySupplyEligibilityWrite')
    expect(convexSupply).toMatch(/export async function registerCapabilityOffering\s*\(/)
    expect(convexSupply).toMatch(/export async function registerCapabilityTransportBinding\s*\(/)
    expect(convexSupply).toMatch(/export async function setCapabilitySupplyEligibility\s*\(/)
    expect(convexSupply).not.toMatch(/defineCapabilityOfferingRegistration/)
    expect(convexSupply).not.toMatch(/admitRegisteredTransport/)
    expect(convexSupply).not.toMatch(/desiredEligibility/)
  })
})


