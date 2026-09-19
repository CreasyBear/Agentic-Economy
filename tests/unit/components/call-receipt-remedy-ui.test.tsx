/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { CallReceiptIssue } from '@/components/ae/call-receipt/CallReceiptPrimitives'
import type { CallIssueView } from '@/modules/capability-execution/call-receipt-view'

afterEach(cleanup)

describe('CallReceiptIssue with Remedy Certificate (W-39 Ergonomics)', () => {
  it('renders Rule 4 Diagnostic Triplet and Autonomous Remedy Certificate', () => {
    const issue: CallIssueView = {
      title: 'Provider failed with timeout',
      whatHappened: 'Upstream host failed to respond within deadline.',
      moneyMovement: 'A refund is recorded — reserved credit was returned to your prepaid balance.',
      automaticNext: 'No duplicate charge and no automatic retry.',
      userNext: 'Autonomous buyer protection secured your funds. You can retry with an alternate tool.',
      retainedReference: 'call:v1:test_remedy_ref',
      remedyCertificate: {
        adjudicator: 'jev-payload-auditor (System One)',
        confidence: 0.95,
        decisionTier: 'jev_system_one',
        releasedAmountAud: 'A$0.0020',
      },
    }

    render(<CallReceiptIssue issue={issue} />)

    expect(screen.getByText('What happened')).toBeInTheDocument()
    expect(screen.getByText('Financial impact')).toBeInTheDocument()
    expect(screen.getByText('Autonomous Buyer Protection Certificate')).toBeInTheDocument()
    expect(screen.getByText('jev_system_one')).toBeInTheDocument()
    expect(screen.getByText('jev-payload-auditor (System One)')).toBeInTheDocument()
    expect(screen.getByText('95%')).toBeInTheDocument()
    expect(screen.getByText(/A\$0\.00 Net/)).toBeInTheDocument()
  })
})
