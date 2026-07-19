import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { listActions } from '@/modules/actions'
import {
  buildDevelopmentPublishedOperationEvidence,
} from '@/modules/capability-supply/development-published-operation-evidence'

describe('published operation foundation boundary', () => {
  it('does not statically register a business-published operation', () => {
    const packet = buildDevelopmentPublishedOperationEvidence()
    expect(listActions().some(({ id }) => id === packet.operation.operationId)).toBe(false)

    const registry = readFileSync('src/modules/actions/index.ts', 'utf8')
    expect(registry).not.toMatch(/published-operation|PublishedOperation/)
  })

  it('materializes descriptor data without claiming an executable action or host surface', () => {
    const packet = buildDevelopmentPublishedOperationEvidence()
    expect(packet.descriptor).not.toHaveProperty('run')
    expect(packet.descriptor).not.toHaveProperty('surfaces')

    const publicSource = readFileSync('src/modules/capability-supply/public.ts', 'utf8')
    expect(publicSource).not.toMatch(
      /PublishedOperationHost|observeEmbeddedPublished|observeExternalPublished|comparePublishedOperationHost/,
    )
  })

  it('keeps the evidence packet free of host, execution, receipt and parity claims', () => {
    const packet = buildDevelopmentPublishedOperationEvidence()
    const { claimCeiling, ...evidence } = packet
    const serialized = JSON.stringify(evidence)
    expect(serialized).not.toMatch(
      /embedded_human|external_agent|host[_ -]?parity|execution[_ -]?parity|invocationRef|receipt/i,
    )
    expect(claimCeiling).toContain('no hosted route')
    expect(claimCeiling).toContain('no execution or host parity')
  })
})
