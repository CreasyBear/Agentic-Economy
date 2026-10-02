/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { projectToolCard, CHAT_TOOL_NAME_MAP, serializeToolCard } from '@/modules/chat/tool-card'
import { ToolCard } from '../ToolCard'
import { ChatTranscript } from '../ChatTranscript'
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
  it.each(['completed', 'pending', 'needs_authority', 'refused', 'reconciliation_required'] as const)(
    'keeps Trust accessible on a %s Call without adding an unsafe retry', (state) => {
      render(<ToolCard projection={{ kind: 'execute', toolId: 'tool.call', title: 'Lookup',
        state, toolRefs: ['tool:lookup'], callRef: 'call:lookup', facts: [], summary: 'Recorded Call status',
        suggestedNextAction: { kind: 'navigate', label: 'View receipt', href: '/calls/call%3Alookup' },
      }} />)
      const trust = screen.getByRole('link', { name: 'Trust centre (opens in a new tab)' })
      expect(trust).toHaveAttribute('href', '/trust')
      expect(trust).toHaveAttribute('target', '_blank')
      if (state === 'refused' || state === 'reconciliation_required') {
        expect(screen.queryByRole('link', { name: 'View receipt' })).not.toBeInTheDocument()
      } else {
        expect(screen.getByRole('link', { name: 'View receipt' })).toHaveAttribute('href', '/calls/call%3Alookup')
      }
    },
  )
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
  it('updates the real work rail without inventing execution, time, or approval events', () => {
    const { rerender } = render(<WorkDisclosure view={{ summary: 'Finding Tools', steps: [{ id: 'search', label: 'Registry search', status: 'working' }] }} />)
    fireEvent.click(screen.getByText('Finding Tools'))
    expect(screen.getByRole('list', { name: 'Discovery work' })).toHaveTextContent('Registry searchWorking')
    rerender(<WorkDisclosure view={{ summary: 'Found 2 Tools', steps: [{ id: 'search', label: 'Registry search', status: 'complete' }, { id: 'compare', label: 'Compare reported facts', status: 'attention' }] }} />)
    const timeline = screen.getByRole('list', { name: 'Discovery work' })
    expect(timeline).toHaveTextContent('Registry searchDone')
    expect(timeline).toHaveTextContent('Compare reported factsNeeds attention')
    expect(screen.queryByText('Working')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve|pause|restart|pull request/i })).not.toBeInTheDocument()
    expect(timeline).not.toHaveTextContent(/seconds|tokens|tests passed/)
    fireEvent.click(screen.getByText('Found 2 Tools'))
    expect(screen.queryByRole('list', { name: 'Discovery work' })).not.toBeInTheDocument()
  })
  it('renders no run when no discovery work was reported', () => {
    const { container } = render(<WorkDisclosure view={{ summary: 'No work', steps: [] }} />)
    expect(container).toBeEmptyDOMElement()
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
  it('renders no follow-up row when there are no suggestions', () => {
    const { container } = render(<FollowUps view={{ suggestions: [] }} onPick={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
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
    expect(screen.getByText('Provider: Acme')).toBeInTheDocument()
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
  it('preserves price/readiness and different attribution when filtering comparison facts', () => {
    render(<ComparisonTable view={{ options, rows: [
      { label: 'Price', cells: { 'tool:fx': { value: 'AUD 0.01 per Call', source: 'AE-observed' }, 'tool:geo': { value: 'AUD 0.01 per Call', source: 'AE-observed' } } },
      { label: 'Readiness', cells: { 'tool:fx': { value: 'Unverified', source: 'Provider-reported' }, 'tool:geo': { value: 'Unverified', source: 'Provider-reported' } } },
      { label: 'Usage', cells: { 'tool:fx': { value: '1,200 calls', source: 'AE-observed' }, 'tool:geo': { value: '1,200 calls', source: 'Directory-reported' } } },
      { label: 'Same contract', cells: { 'tool:fx': { value: 'JSON' }, 'tool:geo': { value: 'JSON' } } },
    ] }} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Only differences' }))
    expect(screen.getByRole('rowheader', { name: 'Price' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Readiness' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Usage' })).toBeInTheDocument()
    expect(screen.getByText('Directory-reported')).toBeInTheDocument()
    expect(screen.queryByRole('rowheader', { name: 'Same contract' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Inspect option' }).map(link => link.getAttribute('href'))).toEqual(options.map(option => option.href))
  })
  it('keeps external inspection, missing price and read-only results honest', () => {
    const external = [{ ...options[1]!, selectable: true, providerListedPrice: '0.002000 USDC' }]
    const onReview = vi.fn()
    const { rerender } = render(<OptionsGrid view={{ options: external, comparedIds: [] }} onReview={onReview} />)
    expect(screen.getByText('Price to be confirmed')).toBeInTheDocument()
    expect(screen.getByText('Provider-listed price: 0.002000 USDC')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review and run' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select' })).toBeDisabled()
    expect(onReview).not.toHaveBeenCalled()
    rerender(<OptionsGrid view={{ options, comparedIds: ['tool:fx'], selectedId: 'tool:fx' }} readOnly />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Currency exchange' })).toHaveAttribute('href', '/tools/tool%3Afx')
  })
  it('renders complete listing details for long values in read-only results', () => {
    const host = `region-${'catalog-'.repeat(10)}.api.example`
    const resourcePath = '/v2/resource/with/a/long/path/segment'
    const networkLabel = 'Ethereum mainnet public registry network label for long display'
    const providerListedPrice = '0.002000 USDC per request, plus a variable execution surcharge based on selected network'
    render(<OptionsGrid view={{ options: [{ ...options[1]!, host, resourcePath, networkLabel, providerListedPrice }], comparedIds: [] }} readOnly />)
    expect(screen.getByText(`${host}${resourcePath}`)).toBeInTheDocument()
    expect(screen.getByText(networkLabel)).toBeInTheDocument()
    expect(screen.getByText(`Provider-listed price: ${providerListedPrice}`)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Place lookup' })).toHaveAttribute('href', '/tools/tool%3Ageo')
  })
  it('projects only observed facts from chat cards, not imagined prices, usage, sellers or readiness', () => {
    const card = { kind: 'choices', toolId: 'registry.tools.search', title: 'Search', state: 'complete', toolRefs: ['tool:fx'], count: 12, choices: [{ toolRef: 'tool:fx', title: 'Currency exchange' }] } as const
    const option = projectOptionsFromCard(card).options[0]!
    expect(option).toMatchObject({ price: 'Price to be confirmed', selectable: true })
    expect(option.readiness).toBe('unverified')
    expect(option.seller).toBeUndefined()
    expect(projectSourcesFromCards([card]).sources).toHaveLength(1)
    expect(projectWorkFromCards([card]).summary).toBe('Found 1 tool')
  })
  it('shows scoped external listing details and continuation without enabling purchase selection', () => {
    const output = {
      kind: 'scoped', results: [{ id: 'external-7', source: 'coinbase', access: 'external_listing',
        title: 'External Timezone', provider: 'Another provider' }],
      next: [{ action: 'next-page', args: { query: 'timezone', cursor: 'x402:next' }, authority: 'public' }],
    }
    const card = projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available', output,
    })
    expect(card?.kind).toBe('choices')
    if (card === null) throw new Error('missing scoped search card')
    render(<ToolCard projection={card} />)
    expect(screen.getByRole('link', { name: /External Timezone/ })).toHaveAttribute('href',
      '/api/v1/registry/detail?id=external-7')
    expect(screen.getByText(/not callable through AE/)).toBeInTheDocument()
    expect(screen.queryByText('x402:next')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse Tools in the Market' })).toHaveAttribute('href', '/market?query=timezone')
    cleanup()
    const onContinue = vi.fn()
    render(<ToolCard projection={card} onContinueSearch={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onContinue).toHaveBeenCalledExactlyOnceWith(output.next[0])
    expect(screen.queryByText('x402:next')).not.toBeInTheDocument()
    const view = projectOptionsFromCard(card)
    expect(projectWorkFromCards([card]).summary).toContain('external listing')
    expect(projectSourcesFromCards([card]).sources[0]?.href).toBe('/api/v1/registry/detail?id=external-7')
    expect(view.options).toMatchObject([{ selectable: true, href: '/api/v1/registry/detail?id=external-7' }])
  })
  it('distinguishes same-title directory listings by host and path with honest metadata', () => {
    const card = projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available',
      output: {
        kind: 'scoped',
        results: [
          { id: 'listing-one', source: 'coinbase', access: 'external_listing', title: 'Weather lookup',
            host: 'weather-one.example', resourcePath: '/v1/current', networkLabel: 'Base',
            sourcePrice: '0.002000 USDC', readiness: 'unverified' },
          { id: 'listing-two', source: 'coinbase', access: 'external_listing', title: 'Weather lookup',
            host: 'weather-two.example', resourcePath: '/v2/forecast', networkLabel: 'Ethereum',
            sourcePrice: '0.003000 USDC', readiness: 'unverified' },
        ],
      },
    })
    if (card === null) throw new Error('missing_directory_card')
    const view = projectOptionsFromCard(card)
    expect(view.options.every(option => option.quoteable !== true)).toBe(true)
    render(<OptionsGrid view={view} onReview={vi.fn()} />)
    expect(screen.getAllByRole('link', { name: 'Weather lookup' })).toHaveLength(2)
    expect(screen.getByText('weather-one.example/v1/current')).toBeInTheDocument()
    expect(screen.getByText('weather-two.example/v2/forecast')).toBeInTheDocument()
    expect(screen.getByText('Base')).toBeInTheDocument()
    expect(screen.getByText('Ethereum')).toBeInTheDocument()
    expect(screen.getAllByText('Unverified')).toHaveLength(2)
    expect(screen.getByText('Provider-listed price: 0.002000 USDC')).toBeInTheDocument()
    expect(screen.getByText('Provider-listed price: 0.003000 USDC')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument()
  })
  it('keeps the opaque cursor out of prose while continuing the original thread and query', () => {
    const next = { action: 'next-page' as const, args: { query: 'timezone', cursor: 'x402:opaque-next' }, authority: 'public' as const }
    const card = projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available', output: { kind: 'scoped', results: [], next: [next] },
    })
    if (card === null) throw new Error('missing search card')
    const onContinueSearch = vi.fn()
    render(<ChatTranscript messages={[
      { id: 'question', role: 'user', parts: [{ type: 'text', text: 'timezone' }] },
      { id: 'answer', role: 'assistant', parts: [
        serializeToolCard(card), { type: 'text', text: 'Next: x402:opaque-next' },
      ] },
    ]} onContinueSearch={onContinueSearch} />)
    expect(screen.queryByText(/x402:opaque-next/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onContinueSearch).toHaveBeenCalledExactlyOnceWith(next)
  })
  it('restarts a legacy signed search honestly without sending its native cursor', () => {
    const card = projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available', output: { kind: 'scoped', results: [],
        next: [{ action: 'next-page', authority: 'public', args: { query: 'timezone', cursor: 'x402:old-native' } }] },
    })
    if (card === null) throw new Error('missing search card')
    const onContinueSearch = vi.fn(), onRepeatSearch = vi.fn()
    render(<ChatTranscript messages={[{ id: 'answer', role: 'assistant', parts: [
      serializeToolCard(card), { type: 'text', text: 'Legacy x402:old-native' },
    ] }]} ownerChatThreadId="owned-thread" onContinueSearch={onContinueSearch} onRepeatSearch={onRepeatSearch} />)
    expect(screen.queryByText(/x402:old-native/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Search again in this chat' }))
    expect(onRepeatSearch).toHaveBeenCalledExactlyOnceWith('timezone')
    expect(onContinueSearch).not.toHaveBeenCalled()
  })
  it('continues a signed cursor in its original thread', () => {
    const next = { action: 'next-page' as const, authority: 'public' as const,
      args: { query: 'timezone', cursor: 'sc1.turn_123.signature' } }
    const card = projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available', output: { kind: 'scoped', results: [], next: [next] },
    })
    if (card === null) throw new Error('missing search card')
    const onContinueSearch = vi.fn(), onRepeatSearch = vi.fn()
    render(<ChatTranscript messages={[{ id: 'answer', role: 'assistant', parts: [serializeToolCard(card)] }]}
      ownerChatThreadId="owned-thread" onContinueSearch={onContinueSearch} onRepeatSearch={onRepeatSearch} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onContinueSearch).toHaveBeenCalledExactlyOnceWith(next)
    expect(onRepeatSearch).not.toHaveBeenCalled()
  })
  it('reviews a single callable Tool before running and removes the old edit-input action', () => {
    const toolRef = `operation:v1:${'a'.repeat(64)}`
    const card = projectToolCard({
      type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available',
      output: { kind: 'match', results: [{
        toolRef, title: 'Currency exchange', access: 'ae_callable', readiness: 'ready',
        price: { kind: 'indicative', label: 'A$0.01 per Call', validUntil: 2_000_000_000_000 },
      }] },
    })
    if (card === null) throw new Error('missing search card')
    const onReview = vi.fn()
    render(<OptionsGrid view={{ ...projectOptionsFromCard(card), comparedIds: [] }} onReview={onReview} />)
    expect(screen.getByRole('button', { name: 'Review and run' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review and run' }))
    expect(onReview).toHaveBeenCalledExactlyOnceWith(toolRef)
    expect(screen.queryByText(['Edit', 'input'].join(' '))).not.toBeInTheDocument()
  })
  it('does not retain an expired AUD estimate from chat history', () => {
    const toolRef = `operation:v1:${'b'.repeat(64)}`
    const card = projectToolCard({ type: `tool-${CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']}`,
      state: 'output-available', output: { kind: 'match', results: [{
        toolRef, title: 'Historic lookup', access: 'ae_callable', readiness: 'ready',
        price: { kind: 'indicative', label: 'A$0.01', validUntil: 1 },
      }] } })
    if (card === null || card.kind !== 'choices') throw new Error('missing choices')
    expect(card.choices[0]?.price).toBeUndefined()
    expect(projectOptionsFromCard(card).options[0]?.price).toBe('Price to be confirmed')
  })
  it('keeps a supplied choice price after its estimate window passes', () => {
    const card = {
      kind: 'choices',
      toolId: 'registry.tools.search',
      title: 'Search',
      state: 'complete',
      toolRefs: ['tool:fx'],
      count: 1,
      choices: [{ toolRef: 'tool:fx', title: 'Currency exchange', price: 'US$0.01', priceValidUntil: 1 }],
    } as const
    expect(projectOptionsFromCard(card, [], 2).options)
      .toMatchObject([{ price: 'US$0.01', priceValidUntil: 1 }])
  })
  it('counts a Tool once when repeated searches return the same result', () => {
    const result = { kind: 'choices', toolId: 'registry.tools.search', title: 'Search', state: 'complete', toolRefs: ['tool:weather'], count: 1, choices: [{ toolRef: 'tool:weather', title: 'Weather Current' }] } as const
    expect(projectWorkFromCards([result, result]).summary).toBe('Found 1 tool')
  })
})
