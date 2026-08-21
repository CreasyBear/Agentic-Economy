/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeGenerativeAnswer } from '@/components/ae/artifacts/AeGenerativeAnswer'
import type { AnswerArtifact, AnswerWorkStep } from '@/modules/answer/public'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import type { ReactElement } from 'react'

describe('AeGenerativeAnswer kernel transcript', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders prose, next step, and the MCP/key handoff', () => {
    const artifacts: AnswerArtifact[] = [
      { kind: 'one-line', text: 'The seed-only test quote for bitcoin is $94,213.00 USD.' },
      {
        kind: 'prose',
        block: 'summary',
        text: 'The seed-only test response returned 94213.00 USD.',
      },
      {
        kind: 'what-to-do-now',
        text: 'Use the returned test quote. Agentic Economy does not book or take payment on this page.',
      },
      { kind: 'agent-json', url: '/api/businesses/search?q=bitcoin' },
    ]

    renderWithRouter(
      <AeGenerativeAnswer
        artifacts={artifacts}
        query="what is the current price of bitcoin in USD"
        layoutProfile="data_answer"
        phase="complete"
        threadId="thread-123"
      />,
    )

    expect(screen.getByText('The seed-only test response returned 94213.00 USD.')).toBeTruthy()
    expect(screen.getByText(/Use the returned test quote/)).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Sources' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Selected business' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Data for AI assistants' })).toBeTruthy()
  })

  it('leads terminal errors with one alert and keeps durable work collapsed', () => {
    const workSteps: AnswerWorkStep[] = [{
      id: 'step-error',
      phase: 'read',
      status: 'error',
      title: 'Reading provider evidence',
      summary: 'The provider could not be reached.',
      detailRows: [{ label: 'Source', value: 'operation:v1:demo.read' }],
    }]

    const { container } = renderWithRouter(
      <AeGenerativeAnswer
        artifacts={[]}
        query="Find a plumber"
        phase="error"
        errorMessage="The provider timed out."
        workSteps={workSteps}
      />,
    )

    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByText('Unable to finish this response.')).toBeTruthy()
    expect(screen.getByText('The provider timed out.')).toBeTruthy()
    expect(screen.queryByText("Checking what's available")).toBeNull()

    const trigger = screen.getByRole('button', { name: 'How this was checked' })
    expect(container.querySelector('[data-ae-work-step]')).toBeNull()
    expect(
      screen.getByRole('alert').compareDocumentPosition(trigger) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'How this was checked' })
    expect(dialog.querySelector('[data-ae-work-step][data-status="error"]')).toBeTruthy()
    expect(dialog.textContent).toContain('The provider could not be reached.')
  })

  it('keeps plain action URLs as copyable text', () => {
    const artifacts: AnswerArtifact[] = [
      { kind: 'one-line', text: 'A source is available.' },
      {
        kind: 'what-to-do-now',
        text: 'Click this URL: https://provider.example/results.',
      },
    ]

    renderWithRouter(
      <AeGenerativeAnswer
        artifacts={artifacts}
        query="find a plumber"
        layoutProfile="data_answer"
        phase="complete"
      />,
    )

    expect(screen.getByText('Copy this URL: https://provider.example/results')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /provider\.example/iu })).toBeNull()
  })
})

function renderWithRouter(ui: ReactElement) {
  const rootRoute = createRootRoute()
  const slugRoute = createRoute({ getParentRoute: () => rootRoute, path: '/$slug' })
  const inquiryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/$slug/inquiry' })
  const routeTree = rootRoute.addChildren([slugRoute, inquiryRoute])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}
