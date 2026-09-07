import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { listActions } from '@/modules/actions'
import {
  buildDevelopmentPublishedToolEvidence,
} from '../../../tools/dev/fixtures/capability-supply/development-published-tool-evidence'

describe('published Tool foundation boundary', () => {
  it('does not statically register a business-published Tool', () => {
    const packet = buildDevelopmentPublishedToolEvidence()
    expect(listActions().some(({ id }) => id === packet.tool.operationId)).toBe(false)

    const registry = readFileSync('src/modules/actions/index.ts', 'utf8')
    expect(registry).not.toMatch(/published-tool|PublishedTool/)
  })

  it('materializes descriptor data without claiming an executable action or host surface', () => {
    const packet = buildDevelopmentPublishedToolEvidence()
    expect(packet.descriptor).not.toHaveProperty('run')
    expect(packet.descriptor).not.toHaveProperty('surfaces')

    const publicSource = readFileSync('src/modules/capability-supply/public.ts', 'utf8')
    expect(publicSource).not.toMatch(
      /PublishedToolHost|observeEmbeddedPublished|observeExternalPublished|comparePublishedToolHost/,
    )
  })

  it('keeps the evidence packet free of host, execution, receipt and parity claims', () => {
    const packet = buildDevelopmentPublishedToolEvidence()
    const { claimCeiling, ...evidence } = packet
    const serialized = JSON.stringify(evidence)
    expect(serialized).not.toMatch(
      /embedded_human|external_agent|host[_ -]?parity|execution[_ -]?parity|invocationRef|receipt/i,
    )
    expect(claimCeiling).toContain('no hosted route')
    expect(claimCeiling).toContain('no execution or host parity')
  })
})
