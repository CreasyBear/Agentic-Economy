// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@clerk/tanstack-react-start', () => ({
  SignInButton: ({ children }: { children: ReactNode }) => children,
}))

import { chatComposer, chatHistory, chatSuggestions } from '@/lib/public/chat-ia'
import { providerSafeActionToolName } from '@/modules/actions/tool-contract'

import type { ChatSessionModel } from '../chat-session.contracts'
import { ChatLayout } from './ChatLayout'
afterEach(cleanup)

function buildModel(overrides: Partial<ChatSessionModel> = {}): ChatSessionModel {
  return {
    showHistoryRail: false,
    createHistoryPanel: () => null,
    header: {
      authenticated: false,
      threadId: null,
      threadTitle: null,
      busy: false,
      sharePath: null,
      copied: false,
      onNewChat: vi.fn(),
      onIssueShare: vi.fn(),
      onRevokeShare: vi.fn(),
      onCopyShare: vi.fn(),
    },
    composer: {
      prompt: '',
      busy: false,
      disabled: false,
      error: '',
      browseMarketOnError: false,
      status: '',
      anonymousMessageLimitReached: false,
      onPromptChange: vi.fn(),
      onSubmit: vi.fn(),
    },
    transcript: {
      messages: [],
    },
    pageBusy: false,
    ...overrides,
  }
}

describe('ChatLayout', () => {
  it('keeps the greeting in the message area and suggestions immediately above the docked composer', () => {
    render(<ChatLayout model={buildModel({ transcript: { messages: [], onStarter: vi.fn() } })} />)
    const greeting = screen.getByText('What can I find for you?')
    const starters = screen.getByTestId('suggested-actions')
    const composer = screen.getByRole('textbox', { name: chatComposer.promptLabel })
    expect(greeting.compareDocumentPosition(starters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(starters.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the saved thread title instead of a generic Chat label', () => {
    render(<ChatLayout model={buildModel({
      header: { ...buildModel().header, threadId: 'thread-1', threadTitle: 'Find a weather API for Sydney' },
    })} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Find a weather API for Sydney')
  })

  it('opens the desktop history rail by default and collapses it with the header control', () => {
    render(<ChatLayout model={buildModel({
      showHistoryRail: true,
      header: {
        authenticated: true,
        threadId: null,
        threadTitle: null,
        busy: false,
        sharePath: null,
        copied: false,
        onNewChat: vi.fn(),
        onIssueShare: vi.fn(),
        onRevokeShare: vi.fn(),
        onCopyShare: vi.fn(),
      },
      createHistoryPanel: () => <p>Saved threads</p>,
    })} />)

    const rail = screen.getByRole('complementary', { name: 'Conversation history', hidden: true })
    expect(rail.textContent).toContain('Saved threads')
    const toggle = screen.getByRole('button', { name: 'Toggle conversation history' })
    fireEvent.click(toggle)
    expect(rail.textContent).not.toContain('Saved threads')
    expect(within(rail).getByRole('button', { name: chatHistory.newChat })).toBeTruthy()
    expect(document.cookie).toContain('chat_sidebar_state=false')
  })

  it('sends the full prompt from an empty-state starter', () => {
    const onStarter = vi.fn()
    const { container } = render(<ChatLayout model={buildModel({
      transcript: { messages: [], onStarter },
    })} />)
    fireEvent.click(within(container).getByRole('button', { name: chatSuggestions[0].prompt }))
    expect(onStarter).toHaveBeenCalledWith(chatSuggestions[0].prompt)
  })

  it('does not suggest options after a completed zero-result search', () => {
    render(<ChatLayout model={buildModel({ transcript: {
      messages: [
        { id: 'ask', role: 'user', parts: [{ type: 'text', text: 'Find a non-existent Tool' }] },
        { id: 'reply', role: 'assistant', parts: [
          { type: `tool-${providerSafeActionToolName('registry.tools.search')}`, state: 'output-available',
            output: { kind: 'noMatch', results: [], assessed: { source: 'current', scope: 'complete', examined: 0, coverage: 'complete' },
              next: [{ action: 'broaden', args: { query: 'non-existent Tool' }, authority: 'public' }] } },
          { type: 'text', text: 'No suitable Tool in the assessed catalogue.' },
        ] },
      ],
      onSuggest: vi.fn(),
    } })} />)
    expect(screen.queryByRole('region', { name: 'Related questions' })).toBeNull()
  })

  it('shows one collapsed work line, answer, choices and compare actions without repeated search cards', () => {
    const onSuggest = vi.fn()
    const onRefine = vi.fn()
    const onCompareRequest = vi.fn()
    const onCopyAnswer = vi.fn()
    const onEditQuestion = vi.fn()
    const messages = [
      { id: 'user', role: 'user' as const, parts: [{ type: 'text', text: 'Find weather in Sydney' }] },
      { id: 'assistant', role: 'assistant' as const, parts: [
        { type: `tool-${providerSafeActionToolName('registry.tools.search')}`, state: 'output-available',
          output: { kind: 'match', results: [
            { toolRef: `operation:v1:${'a'.repeat(64)}`, title: 'Sydney Weather', price: { kind: 'indicative', label: 'USD 0.005' } },
            { toolRef: `operation:v1:${'b'.repeat(64)}`, title: 'Forecast API', price: { kind: 'indicative', label: 'USD 0.008' } },
            { toolRef: `operation:v1:${'c'.repeat(64)}`, title: 'Climate Data', price: { kind: 'indicative', label: 'USD 0.009' } },
          ] } },
        { type: 'text', text: 'Here are two weather APIs for Sydney.' },
      ] },
    ]
    render(<ChatLayout model={buildModel({
      transcript: { messages, onSuggest, onRefine, onCompareRequest, onCopyAnswer, onEditQuestion },
    })} />)
    expect(document.querySelector('details')?.open).toBe(false)
    expect(screen.getByRole('region', { name: 'Answer' }).textContent).toContain('Here are two weather APIs')
    expect(screen.getByRole('region', { name: 'Options' }).textContent).toContain('Sydney Weather')
    expect(screen.queryByText('Search tools', { selector: 'h3' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ready only' }))
    expect(screen.getByRole('button', { name: 'Ready only' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Reset' }).hasAttribute('disabled')).toBe(false)
    expect(onRefine).toHaveBeenCalledWith(expect.stringContaining('only ready-to-use tools'))
    fireEvent.click(screen.getByRole('button', { name: 'Price: under 1¢' }))
    expect(onRefine).toHaveBeenLastCalledWith('Refine the previous options: only ready-to-use tools, under 1¢ per call.')
    fireEvent.click(screen.getAllByRole('button', { name: 'Select' })[0]!)
    expect(screen.getAllByRole('button', { name: 'Select' })[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(onSuggest).toHaveBeenCalledWith('Tell me more about Sydney Weather')
    for (const button of screen.getAllByRole('button', { name: /^Compare$/ }).slice(0, 2)) fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: 'Compare 2 selected' }))
    expect(onCompareRequest).toHaveBeenCalledWith(expect.stringContaining('Sydney Weather and Forecast API'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(onCopyAnswer).toHaveBeenCalledWith('Here are two weather APIs for Sydney.')
    fireEvent.click(screen.getByRole('button', { name: 'Edit question' }))
    expect(onEditQuestion).toHaveBeenCalledWith('Find weather in Sydney')
    fireEvent.click(screen.getByRole('button', { name: 'Which of these is ready to use?' }))
    expect(onSuggest).toHaveBeenCalledWith('Which of these is ready to use?')
  })
  it('shows answer progress above options and defers answer actions until generation settles', () => {
    const user = { id: 'user', role: 'user' as const, parts: [{ type: 'text', text: 'Find weather in Sydney' }] }
    const tool = { type: `tool-${providerSafeActionToolName('registry.tools.search')}`, state: 'output-available',
      output: { kind: 'match', results: [
        { toolRef: `operation:v1:${'a'.repeat(64)}`, title: 'Sydney Weather', price: { kind: 'indicative', label: 'USD 0.005' } },
      ] } }
    const assistant = { id: 'assistant', role: 'assistant' as const, parts: [tool] }
    const onEditQuestion = vi.fn(), onCopyAnswer = vi.fn()
    const { rerender } = render(<ChatLayout model={buildModel({
      transcript: { messages: [user, assistant], generating: true, onEditQuestion, onCopyAnswer },
    })} />)
    const progress = screen.getByText('Writing an answer…')
    const options = screen.getByRole('region', { name: 'Options' })
    expect(progress.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit question' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    rerender(<ChatLayout model={buildModel({
      transcript: { messages: [user, { ...assistant, parts: [tool, { type: 'text', text: '**Sydney Weather** is available. Next: Check its Tool card.' }] }], onEditQuestion, onCopyAnswer },
    })} />)
    expect(screen.getByRole('region', { name: 'Answer' }).textContent).toContain('Sydney Weather')
    expect(screen.getByRole('button', { name: 'Edit question' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
  })

  it('omits refinement for two options and comparison for a single option', () => {
    const ref = `operation:v1:${'a'.repeat(64)}`
    const tool = (results: unknown[]) => [
      { id: 'user', role: 'user' as const, parts: [{ type: 'text', text: 'Find weather' }] },
      { id: 'assistant', role: 'assistant' as const, parts: [
        { type: `tool-${providerSafeActionToolName('registry.tools.search')}`, state: 'output-available', output: { kind: 'match', results } },
        { type: 'text', text: 'Weather tools.' },
      ] },
    ]
    const one = { toolRef: ref, title: 'Weather', price: { kind: 'indicative', label: 'USD 0.005' } }
    const two = { toolRef: `operation:v1:${'b'.repeat(64)}`, title: 'Forecast', price: { kind: 'indicative', label: 'USD 0.008' } }
    const rendered = render(<ChatLayout model={buildModel({ transcript: { messages: tool([one]), onRefine: vi.fn() } })} />)
    expect(screen.queryByRole('button', { name: 'Ready only' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull()
    rendered.rerender(<ChatLayout model={buildModel({ transcript: { messages: tool([one, two]), onRefine: vi.fn() } })} />)
    expect(screen.queryByRole('button', { name: 'Ready only' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Compare' })).toHaveLength(2)
  })
  it('renders a returned comparison as an actual comparison table', () => {
    const firstRef = `operation:v1:${'a'.repeat(64)}`
    const secondRef = `operation:v1:${'b'.repeat(64)}`
    render(<ChatLayout model={buildModel({
      transcript: { messages: [
        { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Compare Sydney Weather and Forecast API' }] },
        { id: 'assistant', role: 'assistant', parts: [
          { type: `tool-${providerSafeActionToolName('registry.tools.compare')}`, state: 'output-available',
            output: { kind: 'ok', tools: [
              { toolRef: firstRef, listing: { label: 'Sydney Weather' }, commercial: { price: { kind: 'fixed', amount: { currency: 'USD', units: '5', exponent: 3 } } } },
              { toolRef: secondRef, listing: { label: 'Forecast API' }, commercial: { price: { kind: 'fixed', amount: { currency: 'USD', units: '8', exponent: 3 } } } },
            ], facts: [] } },
          { type: 'text', text: 'Here is the comparison.' },
        ] },
      ] },
    })} />)
    const comparison = screen.getByRole('region', { name: 'Compare details' })
    expect(comparison.textContent).toContain('Sydney Weather')
    expect(comparison.textContent).toContain('Forecast API')
    expect(comparison.textContent).toContain('Price')
  })
})
