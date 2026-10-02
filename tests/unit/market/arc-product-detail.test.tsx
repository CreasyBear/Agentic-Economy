/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import '../../setup/jsdom-platform'
import { ProductDetail, type ProductDetailProps } from '@/components/arc/market/ProductDetail'

afterEach(cleanup)

function props(overrides: Partial<ProductDetailProps> = {}): ProductDetailProps {
  return {
    id: 'exact-tool-a',
    title: 'Invoice extraction',
    breadcrumb: <a href="/market">Market</a>,
    surfaceLabel: 'Directory listing',
    priceLabel: 'A$0.01 per Call',
    facts: <p>Readiness unknown</p>,
    context: <p>Directory listing only. No AE Quote or Call is available.</p>,
    primary: { label: 'Search callable alternatives', onSelect: vi.fn() },
    slides: [
      { id: 'input-a', label: 'Input example', description: 'Provider-published input', content: <input aria-label="Example text" defaultValue="published content" /> },
      { id: 'output-a', label: 'Output contract', description: 'Schema, not an example', content: <button type="button">Copy output contract</button> },
    ],
    sections: [{ id: 'technical', title: 'Technical', content: <p>Exact endpoint and schema</p> }],
    ...overrides,
  }
}

function activeSlide() {
  return within(screen.getByRole('region', { name: 'Invoice extraction published examples' })).getByRole('group')
}

describe('Arc Tool detail published-content interactions', () => {
  it('keeps inactive content inert and never invokes the continuation while inspecting examples', () => {
    const detail = props()
    render(<ProductDetail {...detail} />)
    expect(activeSlide().getAttribute('aria-label')).toBe('Input example, 1 of 2')
    const inactive = screen.getAllByRole('group', { hidden: true }).find(group => group.getAttribute('aria-label') === 'Output contract, 2 of 2')
    if (inactive === undefined) throw new Error('Published output panel missing')
    expect(inactive.hasAttribute('inert')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Next example' }))
    expect(activeSlide().getAttribute('aria-label')).toBe('Output contract, 2 of 2')
    expect(activeSlide().hasAttribute('inert')).toBe(false)
    expect(screen.getByRole('button', { name: 'Copy output contract' })).toBeTruthy()
    expect(detail.primary.onSelect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Search callable alternatives' }))
    expect(detail.primary.onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/Added|success|purchased/i)).toBeNull()
  })

  it('preserves child control keys while gallery keys and rapid reversals settle on the intended panel', () => {
    render(<ProductDetail {...props()} />)
    const carousel = screen.getByRole('region', { name: 'Invoice extraction published examples' })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Example text' }), { key: 'ArrowRight' })
    expect(activeSlide().getAttribute('aria-label')).toBe('Input example, 1 of 2')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      fireEvent.keyDown(carousel, { key: 'ArrowRight' })
      fireEvent.keyDown(carousel, { key: 'ArrowLeft' })
    }
    expect(activeSlide().getAttribute('aria-label')).toBe('Input example, 1 of 2')
    fireEvent.keyDown(carousel, { key: 'End' })
    expect(activeSlide().getAttribute('aria-label')).toBe('Output contract, 2 of 2')
    fireEvent.keyDown(carousel, { key: 'Home' })
    expect(activeSlide().getAttribute('aria-label')).toBe('Input example, 1 of 2')
  })

  it('resets the gallery when the exact Tool identity changes and keeps disclosure before actions', () => {
    const detail = props({ disclosure: <section aria-label="Input recipient">Provider receives approved input.</section> })
    const { rerender } = render(<ProductDetail {...detail} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show Output contract' }))
    expect(activeSlide().getAttribute('aria-label')).toBe('Output contract, 2 of 2')
    rerender(<ProductDetail {...detail} id="exact-tool-b" />)
    expect(activeSlide().getAttribute('aria-label')).toBe('Input example, 1 of 2')
    expect(screen.getByRole('region', { name: 'Input recipient' }).compareDocumentPosition(screen.getByRole('button', { name: 'Search callable alternatives' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('clamps selection if published panels disappear without changing the Tool identity', () => {
    const detail = props()
    const { rerender } = render(<ProductDetail {...detail} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show Output contract' }))
    const input = detail.slides[0]
    if (input === undefined) throw new Error('Published input missing')
    rerender(<ProductDetail {...detail} slides={[input]} />)
    expect(activeSlide().getAttribute('aria-label')).toBe('Input example, 1 of 1')
    expect(activeSlide().hasAttribute('inert')).toBe(false)
  })

  it('exposes the exact technical contract through an interruptible named disclosure', () => {
    render(<ProductDetail {...props()} />)
    const trigger = screen.getByRole('button', { name: 'Technical' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(within(screen.getByRole('region', { name: 'Technical' })).getByText('Exact endpoint and schema')).toBeTruthy()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      fireEvent.click(trigger)
      fireEvent.click(trigger)
    }
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('region', { name: 'Technical' })).toHaveLength(1)
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region', { name: 'Technical' })).toBeNull()
    const collapsed = screen.getAllByRole('region', { hidden: true }).find(region => region.id === trigger.getAttribute('aria-controls'))
    expect(collapsed?.hasAttribute('inert')).toBe(true)
  })
})
