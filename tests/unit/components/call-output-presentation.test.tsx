/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { CallOutputSection, CallRequestSection } from '@/components/ae/call-receipt/CallTechnicalRecord'
import type { CallResult } from '@/modules/capability-execution/call-contracts'

const completed = (output: Extract<CallResult, { kind: 'completed' }>['output']): CallResult => ({
  kind: 'completed', callRef: 'call:output', toolRef: 'tool:output', evidenceHash: 'sha256:output', output,
  usage: { usageRef: 'usage:output', observedAt: 1, chargeState: 'paid', amount: { currency: 'AUD', units: '1', exponent: 2 }, priceDigest: 'sha256:price' },
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Call result presentation', () => {
  it('presents recorded field names and values without inventing units or interpreting strings', () => {
    render(<CallOutputSection result={completed({ temperature: 17, units: 'celsius', confirmed: false, missing: null, answer: '' })} />)
    expect(screen.getByText('Temperature', { selector: 'dt' })).toBeVisible()
    expect(screen.getByText('17')).toBeVisible()
    expect(screen.getByText('false')).toBeVisible()
    expect(screen.getByText('null')).toBeVisible()
    expect(screen.getByText('Empty text')).toBeVisible()
    expect(screen.queryByText('17°C')).not.toBeInTheDocument()
  })

  it('renders markup, external URLs and code as text with no executable content', () => {
    const output = { answer: '<img src=x onerror=alert(1)>', link: 'javascript:alert(1)', instruction: '$(send-secrets)' }
    const { container } = render(<CallOutputSection result={completed(output)} />)
    expect(screen.getByText(output.answer)).toBeVisible()
    expect(container.querySelectorAll('img, script, a')).toHaveLength(0)
  })

  it('bounds array previews and copies all entries in their recorded order', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const output = Array.from({ length: 30 }, (_, index) => `entry ${index}`)
    render(<CallOutputSection result={completed(output)} />)
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(8)
    expect(screen.getByText('22 more items. View full JSON below.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Copy output' }))
    await screen.findByRole('button', { name: 'Output copied' })
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(output, null, 2))
  })

  it('bounds deeply nested data and long text while retaining exact full JSON', () => {
    const output = { nested: { deeper: { value: 'retained deep value' } }, longText: 'x'.repeat(2_000) }
    const { container } = render(<CallOutputSection result={completed(output)} />)
    expect(screen.getByText('1 field — view full JSON below.')).toBeVisible()
    expect(screen.getByText('Text shortened. View full JSON below.')).toBeVisible()
    const details = container.querySelector('details')!
    expect(details).not.toHaveAttribute('open')
    expect(details.querySelector('code')?.textContent).toBe(JSON.stringify(output, null, 2))
  })

  it.each([{ output: null }, { output: false }, { output: 0 }, { output: [] }, { output: {} }])('does not lose an empty or falsy output: $output', ({ output }) => {
    render(<CallOutputSection result={completed(output)} />)
    expect(screen.getByRole('heading', { name: 'Output' })).toBeVisible()
    expect(screen.getAllByText(JSON.stringify(output), { selector: output !== null && typeof output === 'object' ? 'code' : 'div' })[0]).toBeVisible()
  })

  it('points to full JSON when structured output cannot be copied', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    render(<CallOutputSection result={completed({ value: 'retained' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy output' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Open full JSON below and copy it manually.')
  })

  it('only shows a recorded request and keeps the full input behind a compact disclosure', () => {
    const { container, rerender } = render(<CallRequestSection input={undefined} />)
    expect(container).toBeEmptyDOMElement()
    const input = { location: 'Perth', text: '<script>bad()</script>' }
    rerender(<CallRequestSection input={input} />)
    expect(screen.getByText('Request', { selector: 'summary' })).toBeVisible()
    expect(container.querySelector('details')).not.toHaveAttribute('open')
    expect(container.querySelector('code')?.textContent).toBe(JSON.stringify(input, null, 2))
    expect(container.querySelector('script')).toBeNull()
  })
})
