import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const convexHost = readFileSync('convex/capabilitySupply.ts', 'utf8')
const moduleRoot = 'src/modules/capability-supply/internal/graph'

describe('capability-supply graph/probe thinness', () => {
  it('does not keep probe digest or graph assembly bodies in the Convex host', () => {
    expect(convexHost).not.toMatch(/function\s+probeTargetDigest\b/)
    expect(convexHost).not.toMatch(/reason: 'graph_limit_exceeded' as const/)
    expect(convexHost).not.toMatch(/reason: 'graph_integrity_failure' as const/)
    expect(convexHost).not.toMatch(/kind: 'schema_compatible' as const/)
    expect(convexHost).not.toMatch(/probe:\$\{args\.outcome\}/)
    expect(convexHost).not.toMatch(/target_changed' as const/)
  })

  it('delegates probe/graph via capabilitySupplyGraphPorts while keeping thin wrappers', () => {
    expect(convexHost).toContain("from '@/modules/capability-supply/public'")
    expect(convexHost).not.toMatch(/from\s+['"]@\/modules\/capability-supply\/internal(?:\/[^'"]*)?['"]/)
    expect(convexHost).toContain('capabilitySupplyGraphPorts')
    expect(convexHost).toContain('readCapabilityProbeTargetFromModule')
    expect(convexHost).toContain('recordCapabilityProbeResultFromModule')
    expect(convexHost).toContain('queryCapabilityGraphFromModule')
    expect(convexHost).toMatch(/export const readCapabilityProbeTarget\s*=/)
    expect(convexHost).toMatch(/export const recordCapabilityProbeResult\s*=/)
    expect(convexHost).toMatch(/export const queryCapabilityGraph\s*=/)
    expect(convexHost).toContain('readCapabilityProbeTargetFromModule(capabilitySupplyGraphPorts(ctx.db)')
    expect(convexHost).toContain('recordCapabilityProbeResultFromModule(capabilitySupplyGraphPorts(ctx.db)')
    expect(convexHost).toContain('queryCapabilityGraphFromModule(capabilitySupplyGraphPorts(ctx.db)')
  })

  it('keeps authorization for includeInactive in the host', () => {
    expect(convexHost).toMatch(/args\.includeInactive/)
    expect(convexHost).toContain("register_capability_supply")
    expect(convexHost).toContain("reason: 'authorization_denied' as const")
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


