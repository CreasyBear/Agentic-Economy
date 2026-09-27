/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnswerBlock } from './AnswerBlock'
import { ComparisonTable } from './ComparisonTable'
import { FilterChips } from './FilterChips'
import { FollowUps } from './FollowUps'
import { MessageActions } from './MessageActions'
import { OptionsGrid } from './OptionsGrid'
import { SourcesInline } from './SourcesInline'
import { WorkDisclosure } from './WorkDisclosure'
import { projectComparison, projectOptionsFromCard, projectSourcesFromCards, projectWorkFromCards } from './generative.view-model'
import type { OptionView } from './generative.contracts'

const options: readonly OptionView[] = [
  { id: 'tool:fx', name: 'Currency exchange', href: '/tools/tool%3Afx', outcome: 'Convert currencies', price: 'AUD 0.01 per Call', usage: 'Used 1,200× this month', readiness: 'ready', seller: { kind: 'provider', name: 'Acme' }, selectable: true, facts: { Price: { value: 'AUD 0.01 per Call', source: 'AE-observed' }, Readiness: { value: 'Ready to use', source: 'AE-observed' } } },
  { id: 'tool:geo', name: 'Place lookup', href: '/tools/tool%3Ageo', price: 'Price to be confirmed', readiness: 'unverified', seller: { kind: 'host', name: 'example.com' }, selectable: false, facts: { Price: { value: 'Price to be confirmed', source: 'Directory-reported' } } },
]

afterEach(cleanup)

describe('generative chat leaves', () => {
  it('renders streaming markdown answer as the primary text', () => {
    render(<AnswerBlock view={{ markdown: '**Live answer** about exchange', streaming: true }} />)
    expect(screen.getByRole('region', { name: 'Answer' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Live answer')).toHaveTextContent('Live answer')
  })
  it('preserves structured markdown in an answer', () => {
    render(<AnswerBlock view={{ markdown: '## Current weather\n\n**Sydney** has `22°C`.\n\n- Sunny\n- Breezy\n\n| Day | High |\n| --- | --- |\n| Today | 22°C |' }} />)
    const answer = screen.getByRole('region', { name: 'Answer' })
    expect(answer.querySelector('h2')?.textContent).toBe('Current weather')
    expect(answer.querySelectorAll('li')).toHaveLength(2)
    expect(answer.querySelector('strong')?.textContent).toBe('Sydney')
    expect(answer.querySelector('code')?.textContent).toBe('22°C')
    expect(answer.querySelector('table')?.textContent).toContain('Today')
  })
  it('keeps real work collapsed until expanded', () => {
    render(<WorkDisclosure view={{ summary: 'Searched 12 tools · compared 2', steps: [{ id: 'search', label: 'Searched tools', status: 'complete' }] }} />)
    expect(screen.getByText(/Searched 12 tools/)).toBeInTheDocument()
    expect(screen.getByText('Searched tools').closest('details')).not.toHaveAttribute('open')
    fireEvent.click(screen.getByText(/Searched 12 tools/))
    expect(screen.getByText('Searched tools').closest('details')).toHaveAttribute('open')
  })
  it('links numbered sources to exact Tool pages', () => {
    render(<SourcesInline view={{ sources: [{ toolRef: 'tool:fx', title: 'Currency exchange', href: '/tools/tool%3Afx' }] }} />)
    expect(screen.getByRole('link', { name: 'Source 1: Currency exchange' })).toHaveAttribute('href', '/tools/tool%3Afx')
  })
  it('picks a suggestion for editing without submitting', () => {
    const onPick = vi.fn()
    render(<FollowUps view={{ suggestions: ['Compare these tools', 'What is cheaper?', 'Show details'] }} onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compare these tools' }))
    expect(onPick).toHaveBeenCalledExactlyOnceWith('Compare these tools')
  })
  it('emits copy and edit as distinct intents', () => {
    const onCopy = vi.fn(), onEditQuestion = vi.fn()
    render(<MessageActions view={{ canCopy: true, canEditQuestion: true }} onCopy={onCopy} onEditQuestion={onEditQuestion} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit question' }))
    expect(onCopy).toHaveBeenCalledOnce()
    expect(onEditQuestion).toHaveBeenCalledOnce()
  })
  it('renders seller and readiness honestly; selection and comparison remain separate', () => {
    const onSelect = vi.fn(), onCompare = vi.fn()
    render(<OptionsGrid view={{ options, comparedIds: [] }} onSelect={onSelect} onCompare={onCompare} />)
    expect(screen.getByText('Sold by Acme')).toBeInTheDocument()
    expect(screen.getByText('Listed on example.com')).toBeInTheDocument()
    expect(screen.getByText('Used 1,200× this month')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Compare' })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: 'Select' })[0]!)
    expect(onCompare).toHaveBeenCalledExactlyOnceWith('tool:fx')
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('tool:fx')
    expect(screen.getAllByRole('button', { name: 'Select' })[1]).toBeDisabled()
  })
  it('changes price, readiness, network and category through callbacks', () => {
    const onChange = vi.fn()
    render(<FilterChips view={{ value: { readyOnly: false }, prices: ['Under 1¢'], networks: ['Base'], categories: ['Finance'], count: 2 }} onChange={onChange} />)
    for (const [label, key, expected] of [['Price: Under 1¢', 'price', 'Under 1¢'], ['Ready only', 'readyOnly', true], ['Network: Base', 'network', 'Base'], ['Category: Finance', 'category', 'Finance']] as const) {
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(onChange).toHaveBeenLastCalledWith({ readyOnly: false, [key]: expected })
    }
  })
  it('keeps values aligned by dimensions and hides unsourced Best for claims', () => {
    const view = projectComparison(options)
    render(<ComparisonTable view={{ ...view, rows: [...view.rows, { label: 'Best for', cells: { 'tool:fx': { value: 'Everything' }, 'tool:geo': { value: 'Nothing' } } }] }} />)
    expect(screen.getByRole('region', { name: 'Compare details' })).toBeInTheDocument()
    expect(screen.queryByText('Everything')).not.toBeInTheDocument()
    expect(screen.getAllByText('Not provided').length).toBeGreaterThan(0)
    expect(screen.getAllByText('AE-observed').length).toBeGreaterThan(0)
  })
  it('projects only observed facts from chat cards, not imagined prices, usage, sellers or readiness', () => {
    const card = { kind: 'choices', toolId: 'registry.tools.search', title: 'Search', state: 'complete', toolRefs: ['tool:fx'], count: 12, choices: [{ toolRef: 'tool:fx', title: 'Currency exchange' }] } as const
    const option = projectOptionsFromCard(card).options[0]!
    expect(option).toMatchObject({ price: 'Price to be confirmed', readiness: 'unverified', selectable: true })
    expect(option.seller).toBeUndefined()
    expect(projectSourcesFromCards([card]).sources).toHaveLength(1)
    expect(projectWorkFromCards([card]).summary).toBe('Found 1 tool')
  })
  it('counts a Tool once when repeated searches return the same result', () => {
    const result = { kind: 'choices', toolId: 'registry.tools.search', title: 'Search', state: 'complete', toolRefs: ['tool:weather'], count: 1, choices: [{ toolRef: 'tool:weather', title: 'Weather Current' }] } as const
    expect(projectWorkFromCards([result, result]).summary).toBe('Found 1 tool')
  })
})
