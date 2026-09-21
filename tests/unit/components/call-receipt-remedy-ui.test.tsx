/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { CallReceiptIssue } from '@/components/ae/call-receipt/CallReceiptPrimitives'
import type { CallIssueView } from '@/modules/capability-execution/call-receipt-view'

afterEach(cleanup)

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

    expect(screen.getByText('What happened')).toBeInTheDocument()
    expect(screen.getByText('Financial impact')).toBeInTheDocument()
    expect(screen.getByText('A refund is recorded — reserved credit was returned to your prepaid balance.')).toBeInTheDocument()
    expect(screen.getByText('No duplicate charge and no automatic retry.')).toBeInTheDocument()
    expect(screen.queryByText(/Confidence|Jev|System One|hold released immediately/i)).not.toBeInTheDocument()
  })
})
