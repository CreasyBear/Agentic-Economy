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
  it('renders one status line and a receipt handoff off Ask', () => {
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
    expect(screen.queryByLabelText('Call result')).toBeNull()
    expect(screen.queryByText('USD 1.25 · Paid')).toBeNull()
    expect(screen.queryByText('invocation:handback:1')).toBeNull()
    expect(screen.getByRole('link', { name: 'View receipt' }).getAttribute('href'))
      .toBe('/calls/invocation:handback:1')
  })

  it('keeps an uncertain effect as one status line with a reconcile handoff', () => {
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

    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Check call status' }).getAttribute('href'))
      .toBe('/calls/invocation%3Ahandback%3A2')
    expect(screen.getByRole('link', { name: 'Start a new chat' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    expect(screen.queryByText('attempt:handback:2')).toBeNull()
  })
})
