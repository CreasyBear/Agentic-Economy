import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const convexHost = readFileSync('convex/capabilitySupply.ts', 'utf8')
const portsSource = readFileSync('convex/capabilitySupplyPublicationPorts.ts', 'utf8')
const moduleRoot = 'src/modules/capability-supply/internal/publication'

describe('capability-supply publication-commands thinness', () => {
  it('does not keep publish/refresh/withdraw orchestration bodies in the Convex host', () => {
    const publishStart = convexHost.indexOf('export const publishCapability = mutation({')
    const refreshStart = convexHost.indexOf('export const refreshCapability = mutation({')
    const withdrawStart = convexHost.indexOf('export const withdrawCapability = mutation({')
    expect(publishStart).toBeGreaterThanOrEqual(0)
    expect(refreshStart).toBeGreaterThanOrEqual(0)
    expect(withdrawStart).toBeGreaterThanOrEqual(0)
    const publishBody = convexHost.slice(publishStart, publishStart + 1_200)
    const refreshBody = convexHost.slice(refreshStart, refreshStart + 2_000)
    const withdrawBody = convexHost.slice(withdrawStart, withdrawStart + 1_200)

    expect(publishBody).toContain('publishCapabilityCommand')
    expect(publishBody).toContain('publicationPorts')
    expect(publishBody).toContain('ownsPublishedBusiness')
    expect(publishBody).not.toContain('normalizeCapabilityPublication')
    expect(publishBody).not.toContain('admitRegisteredTransport')
    expect(publishBody).not.toContain('beginOperation')
    expect(publishBody).not.toContain('encodeCapabilityContractDocumentJson')
    expect(publishBody).not.toContain('contract_identity_conflict')
    expect(publishBody).not.toContain('scheduleReadinessProbe')
    expect(publishBody).not.toContain('capabilitySupplyReadiness.probe')

    expect(refreshBody).toContain('refreshCapabilityCommand')
    expect(refreshBody).toContain('publicationPorts')
    expect(refreshBody).toContain('ownsPublishedBusiness')
    expect(refreshBody).not.toContain('normalizeCapabilityPublication')
    expect(refreshBody).not.toContain('canonicalDigest')
    expect(refreshBody).not.toContain('setCapabilitySupplyEligibility(')
    expect(refreshBody).not.toContain('disposition: \'superseded\'')
    expect(refreshBody).not.toContain('capabilitySupplyReadiness.probe')

    expect(withdrawBody).toContain('withdrawCapabilityCommand')
    expect(withdrawBody).toContain('publicationPorts')
    expect(withdrawBody).toContain('ownsPublishedBusiness')
    expect(withdrawBody).not.toContain('setCapabilitySupplyEligibility(')
    expect(withdrawBody).not.toContain('disposition: \'withdrawn\'')
    expect(withdrawBody).not.toContain('capability_publication_supply_integrity_failure')
  })

  it('wires publication ports adapter for writers, ledger, and readiness probe', () => {
    expect(portsSource).toContain('capabilitySupplyOperationPorts')
    expect(portsSource).toContain('registerCapabilityContractDocument')
    expect(portsSource).toContain('scheduleReadinessProbe')
    expect(portsSource).toContain('capabilitySupplyReadiness.probe')
    expect(portsSource).toContain('insertPublication')
    expect(portsSource).toContain('patchPublicationWithdrawn')
    expect(portsSource).not.toMatch(/normalizeCapabilityPublication/)
    expect(portsSource).not.toMatch(/publishCapabilityCommand/)
  })

  it('leaves raw writers and ownership in the host', () => {
    expect(convexHost).toMatch(/export const withdrawCapability\s*=/)
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
