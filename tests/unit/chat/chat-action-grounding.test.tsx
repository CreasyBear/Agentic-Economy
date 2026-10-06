/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CHAT_TOOL_NAME_MAP, projectToolCard } from '@/modules/chat/tool-card'
import { projectGenerativeTurn } from '@/components/ae/chat/presentation'
import { AnswerBlock } from '@/components/ae/chat/generative/AnswerBlock'
import { OptionsGrid } from '@/components/ae/chat/generative/OptionsGrid'
import { chatSearchResolution } from '../../../convex/lib/chat/tools/step'

afterEach(cleanup)

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
