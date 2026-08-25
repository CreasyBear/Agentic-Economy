import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const convexHost = readFileSync('convex/capabilitySupply.ts', 'utf8')
const probesSource = readFileSync('convex/capabilitySupplyProbes.ts', 'utf8')
const graphSource = readFileSync('convex/capabilitySupplyGraph.ts', 'utf8')
const convexSupply = [convexHost, probesSource, graphSource].join('\n')
const ownerSupply = readFileSync('convex/capabilitySupplyOwnerSupply.ts', 'utf8')
const readinessAction = readFileSync('convex/capabilitySupplyReadiness.ts', 'utf8')
const moduleRoot = 'src/modules/capability-supply/internal/graph'

describe('capability-supply graph/probe thinness', () => {
  it('does not keep probe digest or graph assembly bodies in the Convex host', () => {
    expect(convexSupply).not.toMatch(/function\s+probeTargetDigest\b/)
    expect(convexSupply).not.toMatch(/reason:\s*['"]graph_limit_exceeded['"]\s+as const/)
    expect(convexSupply).not.toMatch(/reason:\s*['"]graph_integrity_failure['"]\s+as const/)
    expect(convexSupply).not.toMatch(/kind:\s*['"]schema_compatible['"]\s+as const/)
    expect(convexSupply).not.toMatch(/probe:\$\{args\.outcome\}/)
    expect(convexSupply).not.toMatch(/['"]target_changed['"]\s+as const/)
  })

  it('delegates probe/graph via capabilitySupplyGraphPorts while keeping thin wrappers', () => {
    expect(convexSupply).toMatch(/from\s+['"]@\/modules\/capability-supply\/public['"]/)
    expect(convexSupply).not.toMatch(/from\s+['"]@\/modules\/capability-supply\/internal(?:\/[^'"]*)?['"]/)
    expect(convexSupply).toContain('capabilitySupplyGraphPorts')
    expect(convexSupply).toContain('readCapabilityProbeTargetFromModule')
    expect(convexSupply).toContain('recordCapabilityProbeResultFromModule')
    expect(convexSupply).toContain('queryCapabilityGraphFromModule')
    expect(convexHost).toMatch(/export const readCapabilityProbeTarget\s*=/)
    expect(convexHost).toMatch(/export const recordCapabilityProbeResult\s*=/)
    expect(convexHost).toMatch(/export const queryCapabilityGraph\s*=/)
    expect(convexSupply).toMatch(/readCapabilityProbeTargetFromModule\(\s*capabilitySupplyGraphPorts\(ctx\.db\)/)
    expect(convexSupply).toMatch(/recordCapabilityProbeResultFromModule\(\s*capabilitySupplyGraphPorts\(ctx\.db\)/)
    expect(convexSupply).toMatch(/queryCapabilityGraphFromModule\(\s*capabilitySupplyGraphPorts\(ctx\.db\)/)
  })
  it('keeps production owner readiness on probe -> record and out of the fixture helper', () => {
    expect(ownerSupply).toContain('internal.capabilitySupplyReadiness.probe')
    expect(readinessAction).toContain('internal.capabilitySupply.readCapabilityProbeTarget')
    expect(ownerSupply).not.toContain('internal.capabilitySupply.observeCapabilityReadiness')
    expect(convexSupply).toMatch(/recordCapabilityProbeResultFromModule\(\s*capabilitySupplyGraphPorts\(ctx\.db\)/)
  })
  it('keeps authorization for includeInactive in the host', () => {
    expect(convexSupply).toMatch(/args\.includeInactive/)
    expect(convexSupply).toContain("register_capability_supply")
    expect(convexSupply).toMatch(/reason:\s*['"]authorization_denied['"]\s+as const/)
  })

  it('keeps graph/probe modules free of Convex runtime imports', () => {
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

  it('does not reopen readiness HTTP probe into graph module', () => {
    const readiness = readFileSync(
      'src/modules/capability-supply/internal/readiness-probe.ts',
      'utf8',
    )
    expect(readiness).not.toMatch(/queryCapabilityGraph/)
    expect(readiness).not.toMatch(/CapabilityGraphPorts/)
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/fetch\(/)
      expect(source).not.toMatch(/readiness-probe/)
    }
  })
})
