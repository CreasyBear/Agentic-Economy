/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { SupplyCandidateSection } from '@/components/ae/supply/SupplyCandidateSection'
import { SUPPLY_PUBLICATION_ERROR_ID, SUPPLY_PUBLICATION_FIELD_IDS } from '@/components/ae/supply/supply-source-native-start-presentation'
import type { SupplyToolCandidate } from '@/modules/capability-supply/source-preview'

afterEach(cleanup)

const candidate: SupplyToolCandidate = {
  candidateRef: `sha256:${'a'.repeat(64)}`,
  sourceSelector: { resourceUrl: 'https://api.example/block', method: 'GET' },
  title: 'Block number',
  description: 'Current block from the source',
  inputSchema: { type: 'object' },
  authentication: { kind: 'x402_wallet' },
  validationExampleAvailable: true,
  x402: {
    scheme: 'exact', network: 'eip155:8453', amount: '1000',
    asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    payTo: '0x1111111111111111111111111111111111111111', environment: 'production',
  },
  disposition: { kind: 'supported' },
}
const unsupported: SupplyToolCandidate = {
  ...candidate, candidateRef: `sha256:${'b'.repeat(64)}`, title: 'Unsupported version',
  disposition: { kind: 'unsupported', reason: 'source_version_unsupported' },
}
const second: SupplyToolCandidate = {
  ...candidate, candidateRef: `sha256:${'c'.repeat(64)}`, title: 'Latest block',
}

describe('Source candidate selection with actual Arc RadioCards', () => {
  it('keeps exact source facts visible without making an automatic selection', () => {
    const onSelect = vi.fn()
    render(<SupplyCandidateSection candidates={[candidate, unsupported]} selectedRef="" onSelect={onSelect} />)
    const group = screen.getByRole('radiogroup', { name: 'Select a Tool' })
    expect(within(group).getAllByRole('radio').every(radio => radio.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(onSelect).not.toHaveBeenCalled()
    const blocked = within(group).getByRole('radio', { name: 'Select Unsupported version' })
    expect(blocked).toHaveAttribute('aria-disabled', 'true')
    expect(blocked).toHaveTextContent(candidate.description)
    expect(blocked).toHaveTextContent('Price 1000 · payTo 0x1111111111111111111111111111111111111111 · eip155:8453')
    expect(blocked).toHaveTextContent('Input schema declared · Output not declared')
    expect(blocked).toHaveTextContent('Use a supported OpenAPI or source protocol version, then find Tools again.')
    expect(blocked).toHaveAccessibleDescription(/Current block from the source.*Price 1000.*supported OpenAPI/)
    fireEvent.click(blocked)
    fireEvent.keyDown(blocked, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('uses one tab stop and skips unsupported options when selecting with arrows', () => {
    const onSelect = vi.fn()
    const props = { candidates: [candidate, unsupported, second], onSelect }
    const view = render(<SupplyCandidateSection {...props} selectedRef={candidate.candidateRef} />)
    const first = screen.getByRole('radio', { name: 'Select Block number' })
    const next = screen.getByRole('radio', { name: 'Select Latest block' })
    expect(screen.getAllByRole('radio').filter(radio => radio.tabIndex === 0)).toEqual([first])
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(next).toHaveFocus()
    expect(onSelect).toHaveBeenLastCalledWith(second.candidateRef)
    expect(first).toHaveAttribute('aria-checked', 'true')
    view.rerender(<SupplyCandidateSection {...props} selectedRef={second.candidateRef} />)
    expect(next).toHaveAttribute('aria-checked', 'true')
    expect(screen.getAllByRole('radio').filter(radio => radio.tabIndex === 0)).toEqual([next])
    fireEvent.keyDown(next, { key: 'Home' })
    expect(first).toHaveFocus()
    expect(onSelect).toHaveBeenLastCalledWith(candidate.candidateRef)
  })

  it('keeps missing payment facts honest and refreshes a selected refusal without choosing another', () => {
    const onSelect = vi.fn()
    const view = render(<SupplyCandidateSection candidates={[candidate]} selectedRef={candidate.candidateRef} onSelect={onSelect} />)
    const refused = { ...unsupported, candidateRef: candidate.candidateRef, x402: undefined }
    view.rerender(<SupplyCandidateSection candidates={[refused]} selectedRef={candidate.candidateRef} onSelect={onSelect} />)
    const radio = screen.getByRole('radio', { name: 'Select Unsupported version' })
    expect(radio).toHaveTextContent('Payment challenge incomplete')
    expect(radio).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(radio)
    fireEvent.keyDown(radio, { key: ' ' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('preserves the validation target, error association and group focus', () => {
    render(<>
      <p id={SUPPLY_PUBLICATION_ERROR_ID}>Choose a supported Tool.</p>
      <SupplyCandidateSection candidates={[candidate]} selectedRef="" invalidField="candidate" fieldError="Choose a supported Tool." onSelect={vi.fn()} />
    </>)
    const group = screen.getByRole('radiogroup', { name: 'Select a Tool' })
    expect(group).toHaveAttribute('id', SUPPLY_PUBLICATION_FIELD_IDS.candidate)
    expect(group).toHaveAttribute('aria-invalid', 'true')
    expect(group).toHaveAccessibleDescription('Choose a supported Tool.')
    expect(group).toHaveFocus()
  })

  it('renders the real candidate and refusal on the server without inferred selection', () => {
    const html = renderToString(<SupplyCandidateSection candidates={[unsupported]} selectedRef="" onSelect={vi.fn()} />)
    const serverDOM = document.createElement('div')
    serverDOM.innerHTML = html
    document.body.append(serverDOM)
    try {
      const radio = within(serverDOM).getByRole('radio', { name: 'Select Unsupported version' })
      expect(radio).toHaveAttribute('aria-disabled', 'true')
      expect(radio).toHaveAttribute('aria-checked', 'false')
      expect(radio).toHaveAccessibleDescription(/Use a supported OpenAPI/)
    } finally {
      serverDOM.remove()
    }
  })
})
