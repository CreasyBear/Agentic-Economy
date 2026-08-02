/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeInquiryInboxPanel } from '@/components/ae/inquiries/AeInquiryInboxPanel'
import { AeInquiryOriginCard } from '@/components/ae/inquiries/AeInquiryOriginCard'
import type { BusinessId, OfferingRef, OwnerId } from '@/modules/common/ids'
import type { InquiryThreadId, OwnerInboxReadback } from '@/modules/inquiries/public'

describe('inquiry origin UI', () => {
  afterEach(() => {
    cleanup()
  })

  it('explains chat-origin inquiries in the owner detail card', () => {
    render(
      <AeInquiryOriginCard
        origin={{
          kind: 'answer_thread',
          label: 'From answer',
          href: '/t/thread%3Aselected-provider',
        }}
      />,
    )

    expect(screen.getByText('Chat answer context')).toBeTruthy()
    expect(screen.getByText(/customer chose a listed business in chat/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /open answer/i }).getAttribute('href')).toBe(
      '/t/thread%3Aselected-provider',
    )
  })

  it('makes chat-origin inquiries visible and searchable in the owner inbox', () => {
    render(<AeInquiryInboxPanel inbox={inboxReadback()} />)

    expect(screen.getByText('From answer')).toBeTruthy()
    expect(screen.getByText('Chat answer context: review the listed facts and limits before replying.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Search inquiries'), { target: { value: 'chat' } })

    expect(screen.getByText('Emergency plumbing')).toBeTruthy()
    expect(screen.queryByText('No matching inquiries')).toBeNull()
  })
})

function inboxReadback(): OwnerInboxReadback {
  return {
    ownerId: 'owner:demo' as OwnerId,
    empty: false,
    buckets: { unread: 1, needs_reply: 0, resolved: 0 },
    delivery: { queued: 1, sent: 0, failed: 0, held: 0 },
    inquiries: [
      {
        threadId: 'inquiry_thread:demo' as InquiryThreadId,
        businessId: 'business:demo' as BusinessId,
        offeringRef: 'offering:demo' as OfferingRef,
        businessName: 'Demo Plumbing',
        offeringName: 'Emergency plumbing',
        status: 'unread',
        bucket: 'unread',
        preview: 'Please have the owner review this request.',
        notificationStatus: 'queued',
        notificationLabel: 'Queued for owner delivery',
        messageCount: 1,
        version: 1,
        submittedAt: 1_900_000_000_000,
        updatedAt: 1_900_000_000_000,
        origin: {
          kind: 'answer_thread',
          label: 'From answer',
          href: '/t/thread%3Aselected-provider',
        },
      },
    ],
  }
}
