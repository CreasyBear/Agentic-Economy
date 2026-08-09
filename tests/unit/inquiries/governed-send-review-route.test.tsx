/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType, ReactElement } from 'react'
import type * as ReactStartModule from '@tanstack/react-start'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  isRedirect,
  RouterContextProvider,
  type AnyRedirect,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeCustomerRecord } from '@/components/ae/inquiries/AeCustomerRecord'
import { brandNonEmpty } from '@/modules/common/ids'
import * as customerRecordClient from '@/modules/inquiries/customer-record-client'
import type {
  CustomerInquiryRecordServerResult,
  PublicInquirySubmitServerResult,
} from '@/modules/inquiries/inquiry.functions'
import { GOVERNED_SEND_CANONICAL_FIELDS } from '@/modules/inquiries/internal/governed-send'
import type { PublicInquiryRouteReadback } from '@/modules/inquiries/route-readbacks'
import {
  GovernedSendReviewRows,
  Route as PublicInquiryRoute,
} from '@/routes/$slug.inquiry'
import { Route as LegacyInquiryRoute } from '@/routes/i.$threadId'

const submitInquiryMock = vi.hoisted(() =>
  vi.fn<(input: {
    data: { expectedDigest: string; operationKey?: string }
  }) => Promise<PublicInquirySubmitServerResult>>(),
)

vi.mock('@tanstack/react-start', async () => {
  const actual = await vi.importActual<typeof ReactStartModule>('@tanstack/react-start')
  return { ...actual, useServerFn: () => submitInquiryMock }
})

afterEach(() => {
  cleanup()
  submitInquiryMock.mockReset()
  vi.restoreAllMocks()
})

function renderWithRouter(ui: ReactElement) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/claim' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in/$' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/for-agents' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/privacy' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/terms' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}

describe('GovernedSendReviewRows', () => {
  it('renders every canonical label and distinct value in the declared field order', () => {
    const values = Object.fromEntries(
      GOVERNED_SEND_CANONICAL_FIELDS.map(({ key }, index) => [key, `review-value-${index + 1}`]),
    )

    const { container } = render(<GovernedSendReviewRows values={values} />)
    const rows = Array.from(container.querySelectorAll('dl > div')).map((row) => ({
      label: row.querySelector('dt')?.textContent,
      value: row.querySelector('dd')?.textContent,
    }))

    expect(rows).toEqual(
      GOVERNED_SEND_CANONICAL_FIELDS.map(({ key, label }) => ({ label, value: values[key] })),
    )
  })

  it('renders null contact fields as Not shared without adding unsupported mechanics', () => {
    const values: Record<string, string | null> = Object.fromEntries(
      GOVERNED_SEND_CANONICAL_FIELDS.map(({ key }, index) => [key, `review-value-${index + 1}`]),
    )
    values.contactName = null
    values.contactEmail = null
    values.contactPhone = null

    const { container } = render(<GovernedSendReviewRows values={values} />)
    const rows = Array.from(container.querySelectorAll('dl > div')).map((row) => ({
      label: row.querySelector('dt')?.textContent,
      value: row.querySelector('dd')?.textContent,
    }))

    expect(rows.filter(({ label }) => ['Name', 'Email', 'Phone'].includes(label ?? ''))).toEqual([
      { label: 'Name', value: 'Not shared' },
      { label: 'Email', value: 'Not shared' },
      { label: 'Phone', value: 'Not shared' },
    ])
    expect(container.textContent).not.toMatch(
      /\b(?:wallet|credits?|custody|settlement|checkout|payment|booking|dispatch|autonomous)\b/i,
    )
  })
})

describe('/$slug/inquiry governed-send review', () => {
  it('submits one locked digest with a stable operation key while pending', async () => {
    const retryableFailure: PublicInquirySubmitServerResult = {
      kind: 'error',
      code: 'source_unavailable',
      retryable: true,
      reason: 'Try the exact reviewed request again.',
    }
    submitInquiryMock.mockResolvedValue(retryableFailure)
    vi.spyOn(PublicInquiryRoute, 'useLoaderData').mockReturnValue(availableInquiryReadback())
    vi.spyOn(PublicInquiryRoute, 'useSearch').mockReturnValue({})
    const Component = PublicInquiryRoute.options.component as ComponentType

    renderWithRouter(<Component />)

    expect(screen.getByRole('heading', { name: 'Confirm what will be sent' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Review what will be sent' })).toBeTruthy()
    expect(screen.getByText("This is exactly what will be sent. It can't change after you approve it.")).toBeTruthy()
    expect(screen.getByText('This sends your request once to Demo Plumbing.')).toBeTruthy()
    expect(screen.getByText('Price is confirmed by Demo Plumbing in their reply.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alex@example.com' } })
    fireEvent.change(screen.getByLabelText('What do you need?'), {
      target: { value: 'Please inspect the leaking isolation valve.' },
    })
    const submitButton = screen.getByRole('button', { name: /^Send request to Demo Plumbing$/ })
    fireEvent.click(submitButton)

    expect(submitInquiryMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Creating a written handoff record.')).toBeTruthy()
    expect(screen.getByText('Do not close or send again.')).toBeTruthy()
    const pendingButton = screen.getByRole('button', { name: /^Sending to Demo Plumbing…$/ })
    fireEvent.click(pendingButton)
    expect(submitInquiryMock).toHaveBeenCalledTimes(1)

    const firstSubmittedData = submitInquiryMock.mock.calls[0]?.[0].data
    expect(firstSubmittedData?.expectedDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(firstSubmittedData?.operationKey).toEqual(expect.stringMatching(/^inquiry-review:.+/))

    const retryButton = await screen.findByRole('button', { name: /^Send request to Demo Plumbing$/ })
    fireEvent.click(retryButton)
    await waitFor(() => expect(submitInquiryMock).toHaveBeenCalledTimes(2))

    expect(submitInquiryMock.mock.calls[1]?.[0].data.operationKey).toBe(
      firstSubmittedData?.operationKey,
    )
  })

  it('publishes the locked confirmation title in route metadata', async () => {
    const head = await PublicInquiryRoute.options.head?.({} as never)

    expect(head?.meta).toContainEqual({ title: 'Confirm what will be sent | Agentic Economy' })
  })

  it('uses unavailable metadata and a not-found view instead of the review shell', async () => {
    const unavailableHead = await PublicInquiryRoute.options.head?.({
      loaderData: { kind: 'unavailable', slug: 'demo-plumbing', reason: 'The source is unavailable.' },
    } as never)
    expect(unavailableHead?.meta).toContainEqual({ title: 'Request unavailable | Agentic Economy' })

    vi.spyOn(PublicInquiryRoute, 'useLoaderData').mockReturnValue({
      kind: 'not_found',
      slug: 'missing-business',
      reason: 'no_such_business',
    } as never)
    vi.spyOn(PublicInquiryRoute, 'useSearch').mockReturnValue({})
    const Component = PublicInquiryRoute.options.component as ComponentType
    renderWithRouter(<Component />)

    expect(screen.getByRole('heading', { name: 'Business page not found' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Ask' }).getAttribute('href')).toBe('/')
    expect(screen.queryByRole('heading', { name: 'Confirm what will be sent' })).toBeNull()
  })
})

describe('customer inquiry record proof boundary', () => {
  it('states exactly what the record proves and does not prove', () => {
    vi.spyOn(customerRecordClient, 'useCustomerInquiryRecord').mockReturnValue(customerRecordResult())

    renderWithRouter(<AeCustomerRecord threadId="inquiry_thread:review" recordAccessKey="private-record-key" />)

    expect(screen.getByText('This record proves what was sent, when, to whom, and the reply recorded. Acceptance, availability, booking, confirmation, and completed work require separate business evidence.')).toBeTruthy()
  })

  it('renders the governed record fields in supplied order without exposing its digest', () => {
    vi.spyOn(customerRecordClient, 'useCustomerInquiryRecord').mockReturnValue(customerRecordResult())

    const { container } = renderWithRouter(
      <AeCustomerRecord threadId="inquiry_thread:review" recordAccessKey="private-record-key" />,
    )
    const summary = screen.getByRole('heading', { name: 'What you sent' }).closest('section')
    if (summary === null) throw new Error('governed record summary section missing')
    const rows = Array.from(summary.querySelectorAll('dl > div')).map((row) => ({
      label: row.querySelector('dt')?.textContent,
      value: row.querySelector('dd')?.textContent,
    }))

    expect(rows).toEqual([
      { label: 'Business', value: 'business:exact-record' },
      { label: 'Offering', value: 'offering:exact-leak-repair' },
      { label: 'Request', value: 'Replace the isolation valve at exactly 8:30 am.' },
      { label: 'Name', value: 'Alex Exact' },
      { label: 'Email', value: 'alex.exact@example.test' },
      { label: 'Phone', value: 'Not shared' },
      { label: 'Earlier record', value: 'inquiry_thread:earlier-exact' },
    ])
    expect(container.textContent).not.toContain(
      'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    )
  })
})

describe('/i/$threadId legacy redirect', () => {
  it('permanently redirects to the canonical path without forwarding query credentials', () => {
    const beforeLoad = LegacyInquiryRoute.options.beforeLoad
    if (beforeLoad === undefined) throw new Error('legacy redirect beforeLoad is unavailable')
    let thrown: unknown

    try {
      beforeLoad({
        params: { threadId: 'inquiry_thread:legacy' },
        search: { k: 'legacy-query-secret' },
      } as never)
    } catch (error) {
      thrown = error
    }

    expect(isRedirect(thrown)).toBe(true)
    const redirect = thrown as AnyRedirect
    expect(redirect.status).toBe(301)
    expect(redirect.options).toMatchObject({
      to: '/t/$threadId',
      params: { threadId: 'inquiry_thread:legacy' },
      statusCode: 301,
    })
    expect(redirect.options.search).toBeUndefined()
    expect(redirect.options.hash).toBeUndefined()
    expect(JSON.stringify(redirect.options)).not.toContain('legacy-query-secret')
  })
})



function availableInquiryReadback(): Extract<PublicInquiryRouteReadback, { kind: 'available' }> {
  return {
    kind: 'available',
    slug: 'demo-plumbing',
    businessName: 'Demo Plumbing',
    offeringName: 'Emergency plumbing',
    disclosure: 'Shared with Demo Plumbing only.',
    target: {
      businessId: brandNonEmpty('business:review', 'BusinessId'),
      offeringRef: brandNonEmpty('offering:review', 'OfferingRef'),
    },
    maxBodyLength: 1_000,
  }
}

function customerRecordResult(): CustomerInquiryRecordServerResult {
  return {
    kind: 'ok',
    code: 'inquiry_customer_record_read',
    record: {
      schemaVersion: 'inquiry-customer-record:v1',
      threadId: brandNonEmpty('inquiry_thread:review', 'InquiryThreadId'),
      business: { name: 'Demo Plumbing', slug: 'demo-plumbing' },
      submitted: {
        messageSummary: 'Please inspect the leaking isolation valve.',
        submittedAt: 1_900_000_000_000,
      },
      governedSend: {
        posture: 'verified',
        digest: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        fields: [
          { key: 'businessId', label: 'Business', value: 'business:exact-record' },
          { key: 'offeringRef', label: 'Offering', value: 'offering:exact-leak-repair' },
          { key: 'body', label: 'Request', value: 'Replace the isolation valve at exactly 8:30 am.' },
          { key: 'contactName', label: 'Name', value: 'Alex Exact' },
          { key: 'contactEmail', label: 'Email', value: 'alex.exact@example.test' },
          { key: 'contactPhone', label: 'Phone', value: null },
          { key: 'originThreadId', label: 'Earlier record', value: 'inquiry_thread:earlier-exact' },
        ],
      },
      delivery: {
        state: 'sent',
        label: 'Sent to business',
        updatedAt: 1_900_000_000_100,
      },
      timeline: [
        {
          key: 'received',
          label: 'Request recorded',
          detail: 'The request was recorded.',
          status: 'complete',
          timestamp: 1_900_000_000_000,
        },
      ],
      updatedAt: 1_900_000_000_100,
    },
  }
}
