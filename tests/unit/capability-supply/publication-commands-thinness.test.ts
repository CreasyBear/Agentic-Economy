import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const convexHost = readFileSync('convex/capabilitySupply.ts', 'utf8')
const portsSource = readFileSync('convex/capabilitySupplyPublicationPorts.ts', 'utf8')
const moduleRoot = 'src/modules/capability-supply/internal/publication'

describe('capability-supply publication-commands thinness', () => {
  it('does not keep retired owner bypass mutations in the Convex host', () => {
    const publishStart = convexHost.indexOf('export const publishPreparedCapability = mutation({')
    const readStart = convexHost.indexOf('export const readCapabilityPublication = query({')
    const graphStart = convexHost.indexOf('export const queryCapabilityGraph = query({')
    expect(publishStart).toBeGreaterThanOrEqual(0)
    expect(readStart).toBeGreaterThan(publishStart)
    expect(graphStart).toBeGreaterThan(readStart)

    const publishBody = convexHost.slice(publishStart, readStart)
    expect(publishBody).toContain('publishPreparedCapabilityCommand')
    expect(publishBody).not.toContain(['publishCapability', 'Command'].join(''))
    expect(publishBody).not.toContain(['CapabilityPublication', 'CommandImport'].join(''))
    expect(publishBody).toContain('publicationPorts')
    expect(publishBody).toContain('ownsPublishedBusiness')
    expect(publishBody).not.toContain('normalizeCapabilityPublication')
    expect(publishBody).not.toContain('admitRegisteredTransport')
    expect(publishBody).not.toContain('beginOperation')
    expect(publishBody).not.toContain('encodeCapabilityContractDocumentJson')
    expect(publishBody).not.toContain('contract_identity_conflict')
    expect(publishBody).not.toContain('scheduleReadinessProbe')
    expect(publishBody).not.toContain('capabilitySupplyReadiness.probe')

    expect(convexHost).not.toMatch(/export const refreshCapability\s*=/)
    expect(convexHost).not.toMatch(/export const withdrawCapability\s*=/)
  })

  it('wires capabilitySupplyPublicationPorts adapter for writers, ledger, and readiness probe', () => {
    expect(convexHost).toMatch(/from\s+['"]@\/modules\/capability-supply\/public['"]/)
    expect(convexHost).not.toMatch(/from\s+['"]@\/modules\/capability-supply\/internal(?:\/[^'"]*)?['"]/)
    expect(portsSource).toContain('capabilitySupplyPublicationPorts')
    expect(portsSource).toContain('scheduleReadinessProbe')
    expect(portsSource).toContain('capabilitySupplyReadiness.probe')
    expect(portsSource).toContain('insertPublication')
    expect(portsSource).toContain('patchPublicationWithdrawn')
    expect(portsSource).not.toMatch(/normalizeCapabilityPublication/)
    expect(portsSource).not.toContain(['publishCapability', 'Command'].join(''))
    expect(portsSource).not.toContain(['CapabilityPublication', 'CommandImport'].join(''))
  })

  it('leaves raw writers and ownership in the host', () => {
    expect(convexHost).toMatch(/export const publishPreparedCapability\s*=/)
    expect(convexHost).not.toMatch(/export const publishCapability\s*=/)
    expect(convexHost).not.toMatch(/export const withdrawCapability\s*=/)
    expect(convexHost).toMatch(/export async function registerCapabilityOffering\s*\(/)
    expect(convexHost).toMatch(/export async function registerCapabilityTransportBinding\s*\(/)
    expect(convexHost).toMatch(/export async function setCapabilitySupplyEligibility\s*\(/)
    expect(convexHost).toMatch(/async function ownsPublishedBusiness\s*\(/)
  })

  it('keeps publication command modules free of Convex runtime imports', () => {
    for (const file of ['ports.ts', 'publish.ts', 'refresh.ts', 'withdraw.ts', 'draft.ts']) {
      const source = readFileSync(join(moduleRoot, file), 'utf8')
      expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
      expect(source).not.toMatch(/\bQueryCtx\b/)
      expect(source).not.toMatch(/\bDoc\s*</)
    }
  })

  it('does not relocate operation-ledger helpers into publication', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+beginOperation\b/)
      expect(source).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+ensureSupplyAudit\b/)
      expect(source).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+succeedOperation\b/)
    }
  })

  it('keeps withdraw as a publication lifecycle command, not eligibility', () => {
    const withdrawSource = readFileSync(join(moduleRoot, 'withdraw.ts'), 'utf8')
    expect(withdrawSource).toContain('withdrawCapabilityCommand')
    expect(withdrawSource).toContain('setEligibility')
    expect(withdrawSource).toContain('patchPublicationWithdrawn')
    expect(withdrawSource).not.toMatch(/desiredEligibility/)
    expect(withdrawSource).not.toMatch(/eligibilityPublicResult/)
  })
})


