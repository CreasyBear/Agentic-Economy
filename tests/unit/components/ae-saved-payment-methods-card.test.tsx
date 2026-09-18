/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeSavedPaymentMethodsCard } from '@/components/ae/console/AeSavedPaymentMethodsCard'

type SavedPaymentMethodsSummary =
  | Readonly<{ kind: 'missing'; hasPaymentMethod: false }>
  | Readonly<{
      kind: 'ready'
      hasPaymentMethod: true
      card: Readonly<{
        brand: string
        last4: string
        expMonth: number
        expYear: number
        isDefault: true
      }>
    }>

type AeSavedPaymentMethodsCardProps = Readonly<{
  summary?: SavedPaymentMethodsSummary
  isLoading?: boolean
  onManage: () => Promise<{ portalUrl: string }>
}>

const emptySummary: SavedPaymentMethodsSummary = {
  kind: 'missing',
  hasPaymentMethod: false,
}

const readySummary: SavedPaymentMethodsSummary = {
  kind: 'ready',
  hasPaymentMethod: true,
  card: {
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2030,
    isDefault: true,
  },
}

function renderCard(props: Partial<AeSavedPaymentMethodsCardProps> = {}) {
  const onManage = props.onManage ?? vi.fn().mockResolvedValue({
    portalUrl: 'https://billing.stripe.com/session/test_portal',
  })
  return render(
    <AeSavedPaymentMethodsCard
      summary={props.summary ?? emptySummary}
      isLoading={props.isLoading ?? false}
      onManage={onManage}
    />,
  )
}

function cardNumberOrCvcInputs(container: HTMLElement): (HTMLInputElement | HTMLTextAreaElement)[] {
  const inputs = Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
  return inputs.filter((element) => {
    const name = (element.getAttribute('name') ?? '').toLowerCase()
    const autocomplete = (element.getAttribute('autocomplete') ?? '').toLowerCase()
    const ariaLabel = (element.getAttribute('aria-label') ?? '').toLowerCase()
    const placeholder = (element.getAttribute('placeholder') ?? '').toLowerCase()
    const haystack = `${name} ${autocomplete} ${ariaLabel} ${placeholder}`
    return /card.?number|cc-number|pan|cvc|cvv|security.?code/u.test(haystack)
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AeSavedPaymentMethodsCard (W-22)', () => {
  it('U1: empty summary renders payment methods empty state', () => {
    renderCard()

    expect(screen.getByRole('heading', { name: 'Payment methods' })).toBeInTheDocument()
    expect(screen.getByText('No saved payment methods on file.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add card' })).toBeInTheDocument()
  })

  it('U2: ready summary renders default Visa card details', () => {
    renderCard({ summary: readySummary })

    expect(screen.getByText('Visa')).toBeInTheDocument()
    expect(screen.getByText('Ending in 4242')).toBeInTheDocument()
    expect(screen.getByText('Expires 12/30')).toBeInTheDocument()
    expect(screen.getByText('Default')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage in Stripe' })).toBeInTheDocument()
  })

  it('U3: manage actions call onManage once without card inputs', async () => {
    const onManage = vi.fn().mockResolvedValue({
      portalUrl: 'https://billing.stripe.com/session/test_portal',
    })
    const { container } = renderCard({ summary: readySummary, onManage })

    fireEvent.click(screen.getByRole('button', { name: 'Manage in Stripe' }))
    await waitFor(() => {
      expect(onManage).toHaveBeenCalledOnce()
    })
    expect(cardNumberOrCvcInputs(container)).toHaveLength(0)

    cleanup()
    const emptyRender = renderCard({ onManage })
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }))
    await waitFor(() => {
      expect(onManage).toHaveBeenCalledTimes(2)
    })
    expect(cardNumberOrCvcInputs(emptyRender.container)).toHaveLength(0)
  })

  it('U4: onManage redirect assigns portal URL', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign },
    })
    const onManage = vi.fn().mockResolvedValue({
      portalUrl: 'https://billing.stripe.com/session/redirect_one',
    })
    renderCard({ onManage })

    fireEvent.click(screen.getByRole('button', { name: 'Add card' }))

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://billing.stripe.com/session/redirect_one')
    })
  })

  it('U5: loading state shows accessible busy indicator without card facts', () => {
    renderCard({ isLoading: true })

    expect(screen.getByRole('status', { name: /loading payment methods/i })).toBeInTheDocument()
    expect(screen.queryByText(/ending in/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/4242/u)).not.toBeInTheDocument()
  })

  it('U6: document contains zero card number or CVC inputs', () => {
    const { container: emptyContainer } = renderCard()
    expect(cardNumberOrCvcInputs(emptyContainer)).toHaveLength(0)

    cleanup()
    const { container: readyContainer } = renderCard({ summary: readySummary })
    expect(cardNumberOrCvcInputs(readyContainer)).toHaveLength(0)
  })
})
