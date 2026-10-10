/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { projectOwnerChatCards } from '@/components/ae/chat/chat-session/owner-chat-cards'
import { ChatApprovalCards } from '@/components/ae/chat/chat-session/components/ChatApprovalCards'
import { ToolPanel } from '@/components/ae/chat/tool-panel/ToolPanel'
import { ToolPanelActions } from '@/components/ae/chat/tool-panel/components/ToolPanelActions'
import { ToolPanelForm } from '@/components/ae/chat/tool-panel/components/ToolPanelForm'
import type { ToolPanelView } from '@/components/ae/chat/tool-panel/tool-panel.contracts'
import { QuoteConfirmation } from '@/components/ae/shared/QuoteConfirmation'
import { CallOutcome } from '@/components/ae/shared/CallOutcome'
import type { QuoteConfirmationView } from '@/components/ae/shared/object-family.contracts'
import { chatToolPanel } from '@/lib/public/chat-ia'

vi.mock('convex/react', () => ({ useQuery: () => undefined }))

const quote: QuoteConfirmationView = {
  toolName: 'Weather lookup', provider: { kind: 'host', name: 'weather.example' },
  callRef: 'call:v1:weather', quoteRef: 'quote:v1:weather',
  quoteAmount: { currency: 'AUD', exponent: 6, units: '1' },
  expiresAt: 2_000_000_000_000, inputSummary: 'Sydney',
  remainingCap: { amount: { currency: 'AUD', exponent: 2, units: '1250' }, window: 'month' },
  decisionContext: {
    agent: { principalRef: 'agent:weather', applicationRef: 'ae-owner-chat', currentDisplayName: 'Weather Agent' },
    purpose: null,
    acceptedQuote: { kind: 'available', quoteRef: 'quote:v1:weather',
      tool: { name: 'Weather lookup', description: 'Accepted weather lookup contract.' },
      provider: { ref: 'provider:weather', name: null },
      maximumSpend: { currency: 'AUD', exponent: 6, units: '1' },
      effects: [{ effectId: 'release_city', class: 'data_release', authority: 'explicit', reversibility: 'irreversible' }],
      dataUse: [{ effectId: 'release_city', inputPointer: '/city', classification: 'personal', phase: 'execution',
        recipient: { kind: 'selected_binding' }, purposes: ['weather_lookup'] }],
    },
  },
  expired: false, pending: false,
}
const review: ToolPanelView = {
  heading: 'Weather lookup', price: 'A$0.01', readiness: 'Ready', bestMatch: false,
  phase: 'json', inputText: '{"city":"Sydney"}', canRun: true,
  consequence: 'A Call is charged when it runs.', priceNote: 'Price is confirmed by the Quote.', submission: 'idle',
}

afterEach(cleanup)

describe('Arc Call decision presentation', () => {
  it('preserves native pending approval guards and the exact Call reference on callbacks', () => {
    const onApprove = vi.fn()
    const onDeny = vi.fn()
    const props = { onApprove, onDeny, onFreshQuote: vi.fn() }
    const { rerender } = render(<QuoteConfirmation view={{ ...quote, pending: true }} {...props} />)
    expect(screen.getByRole('button', { name: 'Approve this Call' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Not now' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Approve this Call' }))
    expect(onApprove).not.toHaveBeenCalled()
    rerender(<QuoteConfirmation view={quote} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve this Call' }))
    expect(onApprove).toHaveBeenCalledExactlyOnceWith(quote.callRef)
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(onDeny).toHaveBeenCalledExactlyOnceWith(quote.callRef)
    expect(screen.getByRole('region', { name: 'Confirm this Call' })).toHaveAttribute('data-call-ref', quote.callRef)
  })

  it('shows accepted effects and data release while preserving historical unknowns', () => {
    const [card] = projectOwnerChatCards([{ kind: 'pending', turnRef: 'turn:weather',
      toolRef: 'tool:weather', toolName: 'Current renamed Tool', provider: quote.provider,
      callRef: quote.callRef, quoteRef: quote.quoteRef, quoteAmount: quote.quoteAmount,
      expiresAt: quote.expiresAt, inputSummary: quote.inputSummary, remainingCap: quote.remainingCap,
      decisionContext: quote.decisionContext! }], 0, false)
    if (card?.kind !== 'pending') throw new Error('pending fixture missing')
    render(<QuoteConfirmation view={card.view} onApprove={vi.fn()} onDeny={vi.fn()} onFreshQuote={vi.fn()} />)
    expect(screen.queryByText('Current renamed Tool')).toBeNull()
    expect(screen.getByText('Releases data · irreversible')).toBeInTheDocument()
    expect(screen.getByText('Personal data: city to selected Provider during execution for weather lookup')).toBeInTheDocument()
    expect(screen.getByText('Weather Agent (current Account label)')).toBeInTheDocument()
    expect(screen.getByText('provider:weather (name not recorded)')).toBeInTheDocument()
    expect(screen.getByText('Not established by this Quote record.')).toBeInTheDocument()
  })

  it('withholds approval for missing or mismatched accepted facts and keeps decline available', () => {
    const onApprove = vi.fn()
    const props = { onApprove, onDeny: vi.fn(), onFreshQuote: vi.fn() }
    const { decisionContext: _omitted, ...historical } = quote
    const { rerender } = render(<QuoteConfirmation view={historical} {...props} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Approval stays unavailable')
    expect(screen.queryByRole('button', { name: 'Approve this Call' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Not now' })).toBeEnabled()
    const context = quote.decisionContext!
    rerender(<QuoteConfirmation view={{ ...quote, decisionContext: { ...context,
      acceptedQuote: { kind: 'unavailable', reason: 'quote_mismatch' } } }} {...props} />)
    expect(screen.queryByRole('button', { name: 'Approve this Call' })).toBeNull()
    expect(onApprove).not.toHaveBeenCalled()
  })

  it('gives an expired Quote only the current fresh-Quote action', () => {
    const onFreshQuote = vi.fn()
    const onApprove = vi.fn()
    render(<QuoteConfirmation view={{ ...quote, expired: true }} onFreshQuote={onFreshQuote} onApprove={onApprove} onDeny={vi.fn()} />)
    expect(screen.getByText('Quote expired')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve this Call' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Get a fresh Quote' }))
    expect(onFreshQuote).toHaveBeenCalledOnce()
    expect(onApprove).not.toHaveBeenCalled()
  })

  it('keeps approval heading focus and moves to the fresh action when that same Quote expires', () => {
    const props = { onApprove: vi.fn(), onDeny: vi.fn(), onFreshQuote: vi.fn() }
    const { rerender } = render(<ChatApprovalCards cards={[{ kind: 'pending', turnRef: 'turn:weather', view: quote }]} {...props} />)
    expect(screen.getByRole('heading', { name: 'Confirm this Call' })).toHaveFocus()
    rerender(<ChatApprovalCards cards={[{ kind: 'pending', turnRef: 'turn:weather', view: { ...quote, expired: true } }]} {...props} />)
    expect(screen.getByRole('button', { name: 'Get a fresh Quote' })).toHaveFocus()
  })

  it('keeps unavailable approval explicit and focuses its existing recovery card', () => {
    const onFreshQuote = vi.fn()
    render(<ChatApprovalCards cards={[{ kind: 'unavailable', turnRef: 'turn:weather', callRef: quote.callRef, toolName: quote.toolName, quoteLabel: 'Quote unavailable', inputSummary: 'Sydney', reason: 'Get a fresh Quote to review current terms.' }]} onApprove={vi.fn()} onDeny={vi.fn()} onFreshQuote={onFreshQuote} />)
    expect(screen.getByRole('heading', { name: 'Approval unavailable' })).toHaveFocus()
    expect(screen.getByRole('alert')).toHaveTextContent('Get a fresh Quote to review current terms.')
    fireEvent.click(screen.getByRole('button', { name: 'Get a fresh Quote' }))
    expect(onFreshQuote).toHaveBeenCalledExactlyOnceWith(quote.callRef)
  })

  it('keeps delivery separate from settled payment while the purchase is uncertain', () => {
    render(<CallOutcome view={{ callRef: quote.callRef, label: 'Outcome uncertain', detail: 'Check the Call before another attempt.', purchaseKind: 'uncertain', payment: 'Settled', delivery: 'Unknown', receiptHref: '/calls/call:v1:weather' }} />)
    const region = screen.getByRole('region', { name: 'Call outcome' })
    expect(within(region).getByText('Outcome uncertain')).toBeInTheDocument()
    expect(within(region).getByText('Payment').nextElementSibling).toHaveTextContent('Settled')
    expect(within(region).getByText('Delivery').nextElementSibling).toHaveTextContent('Unknown')
    expect(within(region).queryByText('Amount')).toBeNull()
    expect(within(region).queryByRole('button')).toBeNull()
    expect(within(region).getByRole('link', { name: 'View Call receipt' })).toHaveAttribute('href', '/calls/call:v1:weather')
  })

  it('focuses the result heading through the unchanged outcome reference wrapper', () => {
    render(<ChatApprovalCards cards={[{ kind: 'result', turnRef: 'turn:weather', view: { callRef: quote.callRef, label: 'Outcome uncertain', detail: 'Check the Call before another attempt.', purchaseKind: 'uncertain', payment: 'Settled', delivery: 'Unknown' } }]} onApprove={vi.fn()} onDeny={vi.fn()} onFreshQuote={vi.fn()} />)
    const heading = screen.getByRole('heading', { name: 'Call outcome' })
    expect(heading).toHaveFocus()
    expect(heading.closest('[data-outcome-ref]')).toHaveAttribute('data-outcome-ref', quote.callRef)
  })
})

describe('Arc Tool input review', () => {
  it('never offers another Run when the prior outcome is unknown', () => {
    render(<ToolPanelActions view={{ ...review, canRun: false, submission: 'outcome_unknown', runFailure: 'outcome_unknown' }} statusId="review-status" onRun={vi.fn()} onRunAgain={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(chatToolPanel.runOutcomeUnknown)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('exposes submitting state and disables Run while preserving every disclosure', () => {
    const onRun = vi.fn()
    render(<ToolPanelActions view={{ ...review, canRun: false, submission: 'submitting', disclosure: 'Recommended by the current search result.' }} statusId="review-status" onRun={onRun} onRunAgain={vi.fn()} />)
    const button = screen.getByRole('button', { name: chatToolPanel.submitting })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('type', 'button')
    fireEvent.click(button)
    expect(onRun).not.toHaveBeenCalled()
    expect(screen.getByText(review.consequence)).toBeInTheDocument()
    expect(screen.getByText(review.priceNote)).toBeInTheDocument()
    expect(screen.getByText('Recommended by the current search result.')).toBeInTheDocument()
  })

  it('allows Run again only for the submitted state and leaves its callback authoritative', () => {
    const onRunAgain = vi.fn()
    render(<ToolPanelActions view={{ ...review, submission: 'submitted', canRun: false }} statusId="review-status" onRun={vi.fn()} onRunAgain={onRunAgain} />)
    fireEvent.click(screen.getByRole('button', { name: chatToolPanel.runAgain }))
    expect(onRunAgain).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent(chatToolPanel.submitted)
  })

  it('retains the native JSON field, exact edited value and fieldset freeze during submission', () => {
    const onInputTextChange = vi.fn()
    const { rerender } = render(<ToolPanelForm view={review} idPrefix="review-form" onInputTextChange={onInputTextChange} />)
    const input = screen.getByRole('textbox', { name: chatToolPanel.jsonLabel })
    expect(input).toHaveValue(review.inputText)
    const descriptionId = 'review-form-json-description'
    expect(input.getAttribute('aria-describedby')?.split(/\s+/)).toEqual([descriptionId])
    expect(document.getElementById(descriptionId)).toHaveTextContent(chatToolPanel.jsonHelp)
    fireEvent.change(input, { target: { value: '{"city":"Perth"}' } })
    expect(onInputTextChange).toHaveBeenCalledExactlyOnceWith('{"city":"Perth"}')
    rerender(<ToolPanelForm view={{ ...review, incomplete: 'unfinished' }} idPrefix="review-form" onInputTextChange={onInputTextChange} />)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')?.split(/\s+/).sort()).toEqual([descriptionId, 'review-form-incomplete'].sort())
    rerender(<ToolPanelForm view={{ ...review, submission: 'submitting' }} idPrefix="review-form" onInputTextChange={onInputTextChange} />)
    expect(input).toBeDisabled()
    expect(screen.getByRole('group', { name: chatToolPanel.inputLegend })).toHaveAttribute('aria-busy', 'true')
    rerender(<ToolPanelForm view={{ ...review, submission: 'outcome_unknown' }} idPrefix="review-form" onInputTextChange={onInputTextChange} />)
    expect(input).toBeDisabled()
    expect(screen.getByRole('group', { name: chatToolPanel.inputLegend })).toHaveAttribute('aria-busy', 'false')
  })

  it('marks an incomplete JSON field invalid only after the user edits it', () => {
    render(<ToolPanelForm view={{ ...review, incomplete: 'unfinished' }} idPrefix="touch-form" onInputTextChange={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: chatToolPanel.jsonLabel })
    expect(input).not.toHaveAttribute('aria-invalid')
    fireEvent.change(input, { target: { value: '{' } })
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('retains the Tool heading focus and makes a closed loading panel inert', () => {
    const props = { option: { id: 'tool:weather', name: 'Weather lookup', href: '/tools/tool:weather', price: 'A$0.01', readiness: 'ready' as const, selectable: true }, message: 'Sydney', open: true, runMode: 'run' as const, generating: false, focusOnOpen: true, onRun: vi.fn(), onAddCredit: vi.fn(), onClose: vi.fn(), panelId: 'weather-review' }
    const { rerender } = render(<ToolPanel {...props} />)
    const heading = screen.getByRole('heading', { level: 3 })
    expect(heading).toHaveFocus()
    const panel = document.getElementById('weather-review')!
    expect(panel).toHaveAttribute('aria-labelledby', heading.id)
    expect(panel).toHaveAttribute('aria-busy', 'true')
    const pending = within(panel).getByRole('status', { name: chatToolPanel.loading })
    expect(within(pending).queryByRole('button')).toBeNull()
    expect(within(pending).queryByRole('textbox')).toBeNull()
    rerender(<ToolPanel {...props} open={false} />)
    expect(panel).toHaveAttribute('aria-hidden', 'true')
    expect(panel).toHaveAttribute('inert')
    expect(screen.queryByRole('status', { name: chatToolPanel.loading })).toBeNull()
  })
})
