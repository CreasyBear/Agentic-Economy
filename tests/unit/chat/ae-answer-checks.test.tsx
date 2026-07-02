/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeAnswerChecks } from '@/components/ae/chat/AeAnswerChecks'
import { toThreadViewModel } from '@/components/ae/chat/thread-turn-view'
import type { PublicThreadTurn } from '@/modules/answer-thread/public'

describe('AeAnswerChecks', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders sanitized answer checks from the replay view model', () => {
    const viewModel = toThreadViewModel(turn())

    expect(viewModel.answerCheckSummary).toEqual({
      catalogSearches: 1,
      listingsRead: 2,
      listedBusinesses: 2,
      checksPassed: 5,
      checksFailed: 0,
      elapsedMs: 1250,
    })

    render(<AeAnswerChecks summary={viewModel.answerCheckSummary} />)

    expect(screen.getByRole('region', { name: 'Answer checks' })).not.toBeNull()
    expect(screen.getByText('Catalog searches')).not.toBeNull()
    expect(screen.getByText('Listings read')).not.toBeNull()
    expect(screen.getByText('Listed businesses')).not.toBeNull()
    expect(screen.getByText('Checks passed')).not.toBeNull()
    expect(screen.getByText('Checks failed')).not.toBeNull()
    expect(screen.getByText('1.3s')).not.toBeNull()
  })

  it('renders nothing when a saved turn has no check summary', () => {
    const { container } = render(<AeAnswerChecks />)
    expect(container.textContent).toBe('')
  })
})

function turn(): PublicThreadTurn {
  return {
    turnId: 'turn-1',
    seq: 1,
    query: 'plumber Preston',
    intent: 'refine_search',
    status: 'complete',
    oneLine: 'Two listed businesses match.',
    workLog: [],
    artifacts: [],
    answerCheckSummary: {
      catalogSearches: 1,
      listingsRead: 2,
      listedBusinesses: 2,
      checksPassed: 5,
      checksFailed: 0,
      elapsedMs: 1250,
    },
  }
}
