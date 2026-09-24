import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const graphFolder = 'src/modules/capability-supply/internal/graph'

describe('capability-supply graph/probe boundaries', () => {
  it('does not couple pure graph modules to Convex or readiness HTTP', () => {
    for (const file of listTsFiles(graphFolder)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"][^'"]*(?:_generated|convex\/server)['"]|\bMutationCtx\b|\bQueryCtx\b|\bDoc\s*</)
      expect(source).not.toMatch(/fetch\(|readiness-probe/)
    }
    const readiness = readFileSync('src/modules/capability-supply/internal/readiness-probe.ts', 'utf8')
    expect(readiness).not.toMatch(/queryCapabilityGraph|CapabilityGraphPorts/)
  })

  it('does not rebuild whole-business catalogues on probe observations', () => {
    expect(readFileSync('convex/capabilitySupplyProbes.ts', 'utf8'))
      .not.toContain('rebuildCapabilityOriginSupplyProjection')
  })
})
