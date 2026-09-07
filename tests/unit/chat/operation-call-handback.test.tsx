/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ToolCard } from '@/components/ae/chat/ToolCard'
import { providerSafeActionToolName } from '@/modules/actions/tool-contract'
import { projectToolCard } from '@/modules/chat/tool-card'

const toolRef = `operation:v1:${'a'.repeat(64)}`
const toolType = `tool-${providerSafeActionToolName('tool.call')}`

afterEach(cleanup)

function projection(output: unknown) {
  const projected = projectToolCard({
    type: toolType,
    toolCallId: 'tool-call-handback-1',
    state: 'output-available',
    output: { type: 'json', value: output },
  })
  if (projected === null) throw new Error('Expected a Tool card')
  return projected
}

describe('Tool call handback', () => {
  it('renders literal structured output, actual charge, stable call identity, evidence, and receipt navigation', () => {
    render(<ToolCard projection={projection({
      kind: 'completed',
      callRef: 'invocation:handback:1',
      toolRef,
      output: { score: 91, classification: 'qualified' },
      evidenceHash: 'evidence:handback:1',
      usage: {
        usageRef: 'usage:handback:1',
        observedAt: 1,
        chargeState: 'paid',
        amount: { currency: 'USD', units: '125', exponent: 2 },
        priceDigest: 'price:handback:1',
        durationMs: 640,
      },
    })} />)

    expect(screen.getByText('Result ready')).toBeTruthy()
    expect(screen.getByLabelText('Call result').textContent).toContain('"score": 91')
    expect(screen.getByText('USD 1.25 · Paid')).toBeTruthy()
    expect(screen.getByText('640 ms')).toBeTruthy()
    expect(screen.getByText('invocation:handback:1')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View receipt' }).getAttribute('href'))
      .toBe('/calls/invocation:handback:1')
  })

  it('keeps an uncertain effect visibly unresolved and routes the caller to reconciliation', () => {
    render(<ToolCard projection={projection({
      kind: 'reconciliation_required',
      callRef: 'invocation:handback:2',
      toolRef,
      evidence: {
        attemptRef: 'attempt:handback:2',
        effectGeneration: 2,
        requiredAt: '2026-08-30T00:00:00.000Z',
        retry: 'reconcile_before_retry',
        evidenceSource: 'provider timeout after submit',
      },
    })} />)

    expect(screen.getAllByText('Reconciliation required').length).toBeGreaterThan(0)
    expect(screen.getByText(/Do not retry this call/i)).toBeTruthy()
    expect(screen.getByText('attempt:handback:2')).toBeTruthy()
    expect(screen.getByText('ae help recover')).toBeTruthy()
  })
})
