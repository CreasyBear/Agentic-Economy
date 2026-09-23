/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { CallOutputSection } from '@/components/ae/call-receipt/CallTechnicalRecord'
import type { CallResult } from '@/modules/capability-execution/call-contracts'
import { CallReceiptIssue } from '@/components/ae/call-receipt/CallReceiptPrimitives'
import type { CallIssueView } from '@/modules/capability-execution/call-receipt-view'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('CallReceiptIssue financial evidence', () => {
  it('renders recorded financial impact and recovery without fabricated model authority', () => {
    const issue: CallIssueView = {
      title: 'Provider failed with timeout',
      whatHappened: 'Upstream host failed to respond within deadline.',
      moneyMovement: 'A refund is recorded — reserved credit was returned to your prepaid balance.',
      automaticNext: 'No duplicate charge and no automatic retry.',
      userNext: 'Autonomous buyer protection secured your funds. You can retry with an alternate tool.',
      retainedReference: 'call:v1:test_remedy_ref',
    }

    render(<CallReceiptIssue issue={issue} />)

    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('A refund is recorded — reserved credit was returned to your prepaid balance.')).toBeInTheDocument()
    expect(screen.getByText('Autonomous buyer protection secured your funds. You can retry with an alternate tool.')).toBeInTheDocument()
    expect(screen.getByText('What happens next')).toBeInTheDocument()
    expect(screen.queryByText(/Confidence|Jev|System One|hold released immediately/i)).not.toBeInTheDocument()
  })
})


describe('Call output reuse', () => {
  const completed = (output: Extract<CallResult, { kind: 'completed' }>['output']): CallResult => ({
    kind: 'completed', callRef: 'call:output', toolRef: 'tool:output', evidenceHash: 'sha256:output', output,
    usage: { usageRef: 'usage:output', observedAt: 1, chargeState: 'paid', amount: { currency: 'AUD', units: '1', exponent: 2 }, priceDigest: 'sha256:price' },
  })

  it('copies exact structured output without treating its contents as a command template', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const output = { value: '$ORIGIN stays literal', temperature: 13.8 }
    render(<CallOutputSection result={completed(output)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy output' }))
    expect(await screen.findByRole('button', { name: 'Output copied' })).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(output, null, 2))
  })

  it('keeps text output readable and selectable when clipboard access fails', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    render(<CallOutputSection result={completed('A useful plain text answer.')} />)
    expect(screen.getByText('A useful plain text answer.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy output' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Copy failed. Select the output above and copy it manually.')
    expect(screen.getByText('A useful plain text answer.')).toBeInTheDocument()
  })
})
