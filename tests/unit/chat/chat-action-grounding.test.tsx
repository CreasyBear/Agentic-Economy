/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CHAT_TOOL_NAME_MAP, projectToolCard } from '@/modules/chat/tool-card'
import { projectGenerativeTurn } from '@/components/ae/chat/presentation'
import { AnswerBlock } from '@/components/ae/chat/generative/AnswerBlock'
import { OptionsGrid } from '@/components/ae/chat/generative/OptionsGrid'
import { ChatTranscript } from '@/components/ae/chat/ChatTranscript'
import { chatSearchResolution } from '../../../convex/lib/chat/tools/step'

afterEach(cleanup)

const selectedRef = `operation:v1:${'b'.repeat(64)}`
const selectedMessages = [{ id: 'selected', role: 'assistant' as const, parts: [{
  type: 'tool-registry_tools_search', state: 'output-available', output: {
    kind: 'match', results: [{ toolRef: selectedRef, title: 'Shared title', source: 'current',
      access: 'setup_required', readiness: 'unavailable' }],
  },
}] }]

it('carries the selected reference and bounded title through the existing text callback', () => {
  const onSuggest = vi.fn()
  render(<ChatTranscript messages={selectedMessages} onSuggest={onSuggest} />)
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this Tool' }))
  expect(onSuggest).toHaveBeenCalledExactlyOnceWith(
    `Inspect Tool ${selectedRef} with this exact title: "Shared title".`,
  )
})

it('offers no enabled Ask action when the transcript has no suggestion handler', () => {
  render(<ChatTranscript messages={selectedMessages} />)
  const ask = screen.queryByRole('button', { name: 'Ask about this Tool' })
  if (ask !== null) expect(ask).toBeDisabled()
})

it('discloses external inspection and never promotes it to input review', () => {
  const card = projectToolCard({ type: 'tool-registry_tools_describe', state: 'output-available', output: {
    kind: 'found', tool: { id: `registry:${'c'.repeat(64)}`, source: 'coinbase',
      access: 'external_listing', title: 'Outside lookup', readiness: 'ready' },
  } })
  if (card === null) throw new Error('Missing external detail card')
  const turn = projectGenerativeTurn({ id: 'external', role: 'assistant', text: '', tools: [card], blocks: [] })
  render(<OptionsGrid view={turn.options} onReview={vi.fn()} onSelect={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'Review inputs' })).not.toBeInTheDocument()
  expect(screen.getByText(/External listing.*not callable through Agentic Economy/iu)).toBeInTheDocument()
})

it.each([
  { readiness: 'unavailable', access: 'setup_required', canReview: false },
  { readiness: 'ready', access: 'ae_callable', canReview: true },
] as const)('keeps search narration consistent with the $readiness Tool card', ({ readiness, access, canReview }) => {
  const output = {
    kind: 'match',
    results: [{
      toolRef: `operation:v1:${'a'.repeat(64)}`,
      title: 'Web Search (SERP)',
      summary: 'Ranked titles, URLs and snippets for a search query.',
      source: 'current', access, readiness,
    }],
  }
  const toolName = CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']
  const markdown = chatSearchResolution([{ toolResults: [{ toolName, output }] }])
  if (markdown === null) throw new Error('Search did not produce an answer')
  const card = projectToolCard({ type: `tool-${toolName}`, state: 'output-available', output })
  if (card === null) throw new Error('Search did not produce a Tool card')
  const turn = projectGenerativeTurn({ id: 'serp', role: 'assistant', text: markdown, tools: [card], blocks: [] })
  render(<>
    <AnswerBlock view={{ markdown }} />
    <OptionsGrid view={turn.options} onReview={vi.fn()} onSelect={vi.fn()} />
  </>)
  expect(screen.getByRole('link', { name: 'Web Search (SERP)' })).toHaveAttribute('href', `/tools/operation%3Av1%3A${'a'.repeat(64)}`)
  const answer = screen.getByRole('region', { name: 'Answer' })
  if (canReview) {
    expect(screen.getByRole('button', { name: 'Review inputs' })).toBeEnabled()
    expect(answer).toHaveTextContent(/review (?:the )?inputs/iu)
  } else {
    expect(screen.getByRole('button', { name: 'Ask about this Tool' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Review inputs' })).not.toBeInTheDocument()
    expect(answer).not.toHaveTextContent(/review (?:the )?inputs/iu)
  }
})
