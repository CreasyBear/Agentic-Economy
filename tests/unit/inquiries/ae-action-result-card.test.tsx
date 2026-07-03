/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeActionResultCard } from '@/components/ae/feedback/AeActionResultCard'
import type { PublicInquirySubmitServerResult } from '@/modules/inquiries/inquiry.functions'

describe('AeActionResultCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('links a submitted inquiry receipt back to the originating answer', () => {
    render(
      <AeActionResultCard
        result={submittedResult()}
        businessName="Demo Plumbing"
        serviceName="Emergency plumbing"
        answerHref="/t/thread%3Aselected-provider"
      />,
    )

    expect(screen.getByText('Inquiry recorded')).toBeTruthy()
    expect(screen.getByText('This receipt stays connected to the answer thread you started from.')).toBeTruthy()
    expect(screen.getByText('Back to answer').closest('a')?.getAttribute('href')).toBe('/t/thread%3Aselected-provider')
  })

  it('keeps generic receipts free of answer-specific actions', () => {
    render(<AeActionResultCard result={submittedResult()} businessName="Demo Plumbing" serviceName="Emergency plumbing" />)

    expect(screen.queryByText('Back to answer')).toBeNull()
    expect(screen.queryByText('This receipt stays connected to the answer thread you started from.')).toBeNull()
  })
})

function submittedResult(): PublicInquirySubmitServerResult {
  return {
    kind: 'ok',
    code: 'inquiry_submitted',
    receipt: {
      threadId: 'inquiry_thread:123',
      businessId: 'business:demo',
      serviceId: 'service:demo',
      status: 'unread',
      version: 1,
      notificationId: 'inquiry_notification:123',
      notificationStatus: 'queued',
    },
  }
}
