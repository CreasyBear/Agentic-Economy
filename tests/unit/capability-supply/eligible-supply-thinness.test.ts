import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const convexHost = readFileSync('convex/capabilitySupply.ts', 'utf8')
const listsSource = readFileSync('convex/capabilitySupplyLists.ts', 'utf8')
const commandsSource = readFileSync('convex/capabilitySupplyCommands.ts', 'utf8')
const sharedSource = readFileSync('convex/capabilitySupplyShared.ts', 'utf8')
const convexSupply = [convexHost, listsSource, commandsSource, sharedSource].join('\n')
const moduleRoot = 'src/modules/capability-supply/internal/eligibility'

describe('capability-supply eligible-supply thinness', () => {
  it('does not keep list/exact inventory bodies in the Convex host', () => {
    expect(convexSupply).not.toMatch(/reason: 'eligible_supply_limit_exceeded' as const/)
    expect(convexSupply).not.toMatch(/reason: 'supply_integrity_failure' as const/)
    expect(convexSupply).not.toMatch(/reason:\s*['"]contract_integrity_failure['"]\s+as const/)
    expect(convexSupply).not.toMatch(/MAX_ELIGIBLE_SUPPLY\s*=/)
    expect(convexSupply).not.toMatch(/listAdmittedConformantBindingsByNetwork/)
    expect(convexSupply).not.toMatch(/bindings\.length > input\.limit/)
  })

  it('keeps thin (db, input) wrappers via eligibleSupplyPorts', () => {
    expect(convexSupply).toMatch(/from\s+['"]@\/modules\/capability-supply\/public['"]/)
    expect(convexSupply).not.toMatch(/from\s+['"]@\/modules\/capability-supply\/internal(?:\/[^'"]*)?['"]/)
    expect(convexSupply).toContain('eligibleSupplyPorts')
    expect(convexSupply).toContain('listIntegratedCapabilitySupplyFromModule')
    expect(convexSupply).toContain('getEligibleExactCapabilitySupplyFromModule')
    expect(convexSupply).toMatch(/export async function listIntegratedCapabilitySupply\s*\(/)
    expect(convexSupply).toMatch(/export async function getEligibleExactCapabilitySupply\s*\(/)
    expect(convexSupply).toMatch(/listIntegratedCapabilitySupplyFromModule\(\s*eligibleSupplyPorts\(db\)/)
    expect(convexSupply).toMatch(/getEligibleExactCapabilitySupplyFromModule\(\s*eligibleSupplyPorts\(db\)/)
  })

  it('leaves listIntegrated internalQuery wire and canonical publish writers in the host', () => {
    expect(convexHost).toMatch(/export const listIntegrated\s*=/)
    expect(convexHost).toMatch(/export const publishPreparedCapability\s*=/)
    expect(convexHost).not.toMatch(/export const publishCapability\s*=/)
    expect(convexSupply).toMatch(/export async function registerCapabilityOffering\s*\(/)
    expect(convexSupply).toMatch(/async function ownsPublishedBusiness\s*\(/)
  })

  it('keeps eligibility inventory modules free of Convex runtime imports', () => {
    for (const file of ['ports.ts', 'list.ts', 'exact.ts']) {
      const source = readFileSync(join(moduleRoot, file), 'utf8')
      expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
      expect(source).not.toMatch(/\bQueryCtx\b/)
      expect(source).not.toMatch(/\bDoc\s*</)
    }
  })

  it('does not merge eligible inventory into operation-ledger', () => {
    for (const file of listTsFiles('src/modules/capability-supply/internal/operation-ledger')) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/listIntegratedCapabilitySupply|listRouteableCapabilitySupply/)
      expect(source).not.toMatch(/getEligibleExactCapabilitySupply/)
      expect(source).not.toMatch(/EligibleSupplyPorts/)
    }
  })
})


