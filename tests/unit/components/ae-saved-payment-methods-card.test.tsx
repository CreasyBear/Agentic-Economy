/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeSavedPaymentMethodsCard } from '@/components/ae/console/AeSavedPaymentMethodsCard'
import type { SavedPaymentMethodsSummary } from '@/modules/money/saved-payment-methods.view-model'
import { toast } from '@/lib/ui/toast'

vi.mock('@/lib/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

type AeSavedPaymentMethodsCardProps = Readonly<{
  summary?: SavedPaymentMethodsSummary
  isLoading?: boolean
  onManage: () => Promise<{ portalUrl?: string } | void>
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
    expect(
      screen.getByText(
        'No saved card. Add a card to enable automatic credit recharge and seamless tool calls.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add card' })).toBeInTheDocument()
    expect(screen.getByText('Stored securely by Stripe, never touches our servers.')).toBeInTheDocument()
  })

  it('U2: ready summary renders default Visa card details', () => {
    renderCard({ summary: readySummary })

    expect(screen.getByText('Visa')).toBeInTheDocument()
    expect(screen.getByText('•••• 4242')).toBeInTheDocument()
    expect(screen.getByText('Expires 12/30')).toBeInTheDocument()
    expect(screen.getByText('Default')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage in Stripe' })).toBeInTheDocument()
    expect(screen.getByText('Stored securely by Stripe, never touches our servers.')).toBeInTheDocument()
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
    const { container } = renderCard({ isLoading: true })

    expect(screen.getByRole('status', { name: /loading payment methods/i })).toBeInTheDocument()
    expect(screen.queryByText(/ending in/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/4242/u)).not.toBeInTheDocument()
    expect(container.querySelector('.min-h-\\[4\\.5rem\\]')).toBeInTheDocument()
  })

  it('U6: document contains zero card number or CVC inputs', () => {
    const { container: emptyContainer } = renderCard()
    expect(cardNumberOrCvcInputs(emptyContainer)).toHaveLength(0)

    cleanup()
    const { container: readyContainer } = renderCard({ summary: readySummary })
    expect(cardNumberOrCvcInputs(readyContainer)).toHaveLength(0)
  })

  it('U7: portal failure shows diagnostic alert and toast error', async () => {
    const onManageReject = vi.fn().mockRejectedValue(new Error('network'))
    renderCard({ onManage: onManageReject })

    fireEvent.click(screen.getByRole('button', { name: 'Add card' }))

    await waitFor(() => {
      expect(screen.getByText('Could not open Stripe billing portal.')).toBeInTheDocument()
    })
    expect(
      screen.getByText('A$0.00 charged — your payment methods are unchanged.'),
    ).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith('Could not open Stripe billing portal.', {
      description: 'Please check your network connection or try again in a few moments.',
    })

    cleanup()
    const onManageMissingUrl = vi.fn().mockResolvedValue({ portalUrl: '' })
    renderCard({ onManage: onManageMissingUrl })
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }))

    await waitFor(() => {
      expect(screen.getByText('Could not open Stripe billing portal.')).toBeInTheDocument()
    })
  })

  it('U8: masked pan and expiry use mono tabular typography', () => {
    const { container } = renderCard({ summary: readySummary })

    const mask = screen.getByText('•••• 4242')
    expect(mask).toHaveClass('font-mono', 'tabular-nums')

    const expiry = screen.getByText('Expires 12/30')
    expect(expiry).toHaveClass('font-mono', 'tabular-nums')

    const glyphWell = container.querySelector('.size-9.font-mono')
    expect(glyphWell).toBeInTheDocument()
    expect(glyphWell).toHaveTextContent('V')
  })

  it('U9: PCI reassurance line appears in empty and ready states', () => {
    renderCard()
    expect(screen.getByText('Stored securely by Stripe, never touches our servers.')).toBeInTheDocument()

    cleanup()
    renderCard({ summary: readySummary })
    expect(screen.getByText('Stored securely by Stripe, never touches our servers.')).toBeInTheDocument()
  })

  it('U10: CTAs include external link affordance and portal helper copy', () => {
    const { container: emptyContainer } = renderCard()
    expect(
      screen.getByText("Opens Stripe's hosted customer portal to add, update, or remove cards."),
    ).toBeInTheDocument()
    expect(emptyContainer.querySelector('svg.lucide-external-link')).toBeInTheDocument()

    cleanup()
    const { container: readyContainer } = renderCard({ summary: readySummary })
    expect(
      screen.getByText("Opens Stripe's hosted customer portal to add, update, or remove cards."),
    ).toBeInTheDocument()
    expect(readyContainer.querySelector('svg.lucide-external-link')).toBeInTheDocument()
  })

  it('U11: expiry badges reflect expired and expiring-soon cards', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'))

    const expiredSummary: SavedPaymentMethodsSummary = {
      kind: 'ready',
      hasPaymentMethod: true,
      card: {
        brand: 'visa',
        last4: '1111',
        expMonth: 2,
        expYear: 2026,
        isDefault: false,
      },
    }
    renderCard({ summary: expiredSummary })
    expect(screen.getByText('Expired')).toBeInTheDocument()

    cleanup()

    const soonSummary: SavedPaymentMethodsSummary = {
      kind: 'ready',
      hasPaymentMethod: true,
      card: {
        brand: 'visa',
        last4: '2222',
        expMonth: 3,
        expYear: 2026,
        isDefault: false,
      },
    }
    renderCard({ summary: soonSummary })
    expect(screen.getByText('Expires next month')).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('U12: loading skeleton reserves all layout regions', () => {
    const { container } = renderCard({ isLoading: true })

    expect(container.querySelector('.h-5.w-40')).toBeInTheDocument()
    expect(container.querySelector('.min-h-\\[4\\.5rem\\]')).toBeInTheDocument()
    expect(container.querySelector('.h-4.w-72')).toBeInTheDocument()
    expect(container.querySelector('.min-h-\\[2\\.5rem\\]')).toBeInTheDocument()
    expect(container.querySelector('.min-h-\\[5\\.5rem\\]')).toBeInTheDocument()
    expect(container.querySelector('.h-10.w-44')).toBeInTheDocument()
  })

  it("U13: eftpos_au brand shows Eftpos label and EF glyph", () => {
    const eftposSummary: SavedPaymentMethodsSummary = {
      kind: 'ready',
      hasPaymentMethod: true,
      card: {
        brand: 'eftpos_au',
        last4: '9999',
        expMonth: 6,
        expYear: 2028,
        isDefault: false,
      },
    }
    const { container } = renderCard({ summary: eftposSummary })

    expect(screen.getByText('Eftpos')).toBeInTheDocument()
    const glyphWell = container.querySelector('.size-9.font-mono')
    expect(glyphWell).toHaveTextContent('EF')
  })
})
