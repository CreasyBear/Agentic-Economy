/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { AeSiteFaq } from '@/components/ae/website/AeSiteFaq'
import { AGENT_PAGE } from '@/content/brand-copy'

afterEach(cleanup)

describe('site FAQ', () => {
  it('preserves the supplied questions and the page heading identity', () => {
    render(
      <AeSiteFaq
        labelledBy="agent-faq"
        title={AGENT_PAGE.faqHeading}
        questions={AGENT_PAGE.faqQuestions}
      />,
    )

    const section = screen.getByRole('region', { name: AGENT_PAGE.faqHeading })
    const heading = screen.getByRole('heading', { level: 2, name: AGENT_PAGE.faqHeading })
    expect(heading.id).toBe('agent-faq')
    expect(section.getAttribute('aria-labelledby')).toBe('agent-faq')

    for (const item of AGENT_PAGE.faqQuestions) {
      expect(screen.getByRole('button', { name: item.question })).toBeTruthy()
      expect(screen.queryByText(item.answer)).toBeNull()
    }
  })

  it('starts with every answer closed, opens one at a time, and closes the current answer', async () => {
    render(
      <AeSiteFaq
        labelledBy="agent-faq"
        title={AGENT_PAGE.faqHeading}
        questions={AGENT_PAGE.faqQuestions}
      />,
    )

    const [first, second, third] = AGENT_PAGE.faqQuestions.map(item =>
      screen.getByRole('button', { name: item.question }),
    )
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(third).toBeTruthy()
    expect(first?.getAttribute('aria-expanded')).toBe('false')
    expect(second?.getAttribute('aria-expanded')).toBe('false')
    expect(third?.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(first!)
    expect(first?.getAttribute('aria-expanded')).toBe('true')
    expect(second?.getAttribute('aria-expanded')).toBe('false')
    const firstAnswer = screen.getByRole('region', { name: AGENT_PAGE.faqQuestions[0].question })
    expect(firstAnswer.id).toBe(first?.getAttribute('aria-controls'))
    expect(firstAnswer.getAttribute('aria-labelledby')).toBe(first?.id)
    expect(screen.getByText(AGENT_PAGE.faqQuestions[0].answer)).toBeTruthy()

    fireEvent.click(second!)
    expect(second?.getAttribute('aria-expanded')).toBe('true')
    expect(first?.getAttribute('aria-expanded')).toBe('false')
    await waitFor(() => expect(screen.queryByText(AGENT_PAGE.faqQuestions[0].answer)).toBeNull())
    expect(screen.getByText(AGENT_PAGE.faqQuestions[1].answer)).toBeTruthy()

    fireEvent.click(second!)
    expect(second?.getAttribute('aria-expanded')).toBe('false')
    await waitFor(() => expect(screen.queryByText(AGENT_PAGE.faqQuestions[1].answer)).toBeNull())
  })

  it('keeps questions that differ only by punctuation tied to their own answers', async () => {
    const questions = [
      { question: 'Is AUD Credit a crypto wallet?', answer: 'The question mark answer.' },
      { question: 'Is AUD Credit a crypto wallet!', answer: 'The exclamation mark answer.' },
    ] as const
    render(<AeSiteFaq labelledBy="credit-faq" title="AUD Credit" questions={questions} />)

    const questionMark = screen.getByRole('button', { name: questions[0].question })
    const exclamationMark = screen.getByRole('button', { name: questions[1].question })
    const questionMarkAnswerId = questionMark.getAttribute('aria-controls')
    const exclamationMarkAnswerId = exclamationMark.getAttribute('aria-controls')
    expect(questionMarkAnswerId).not.toBe(exclamationMarkAnswerId)

    fireEvent.click(questionMark)
    const firstAnswer = screen.getByRole('region', { name: questions[0].question })
    expect(firstAnswer.id).toBe(questionMarkAnswerId)
    expect(firstAnswer.getAttribute('aria-labelledby')).toBe(questionMark.id)
    expect(screen.getByText(questions[0].answer)).toBeTruthy()

    fireEvent.click(exclamationMark)
    await waitFor(() => expect(screen.queryByText(questions[0].answer)).toBeNull())
    const secondAnswer = screen.getByRole('region', { name: questions[1].question })
    expect(secondAnswer.id).toBe(exclamationMarkAnswerId)
    expect(secondAnswer.getAttribute('aria-labelledby')).toBe(exclamationMark.id)
    expect(screen.getByText(questions[1].answer)).toBeTruthy()
  })

  it('moves question focus with ArrowDown, ArrowUp, Home, and End', () => {
    render(
      <AeSiteFaq
        labelledBy="agent-faq"
        title={AGENT_PAGE.faqHeading}
        questions={AGENT_PAGE.faqQuestions}
      />,
    )

    const [first, second, third] = AGENT_PAGE.faqQuestions.map(item =>
      screen.getByRole('button', { name: item.question }),
    )
    first?.focus()
    fireEvent.keyDown(first!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(second!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(third)
    fireEvent.keyDown(third!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(second!, { key: 'End' })
    expect(document.activeElement).toBe(third)
    fireEvent.keyDown(third!, { key: 'Home' })
    expect(document.activeElement).toBe(first)
  })

  it('keeps the native status link and renders its optional lead only when supplied', () => {
    const router = createStatusRouter()
    const renderStatusFaq = (statusLinkLead?: string) => (
      <RouterContextProvider router={router}>
        <AeSiteFaq
          labelledBy="agent-faq"
          title={AGENT_PAGE.faqHeading}
          questions={AGENT_PAGE.faqQuestions}
          statusLinkLabel={AGENT_PAGE.faqStatusLinkLabel}
          {...(statusLinkLead === undefined ? {} : { statusLinkLead })}
        />
      </RouterContextProvider>
    )

    const { rerender } = render(renderStatusFaq(AGENT_PAGE.faqStatusLinkLead))
    expect(screen.getByText(AGENT_PAGE.faqStatusLinkLead)).toBeTruthy()
    expect(screen.getByRole('link', { name: AGENT_PAGE.faqStatusLinkLabel }).getAttribute('href')).toBe('/status')

    rerender(renderStatusFaq())
    expect(screen.queryByText(AGENT_PAGE.faqStatusLinkLead)).toBeNull()
    expect(screen.getByRole('link', { name: AGENT_PAGE.faqStatusLinkLabel }).getAttribute('href')).toBe('/status')
  })

  it('omits an absent title without leaving a dangling section label', () => {
    render(<AeSiteFaq labelledBy="agent-faq" questions={AGENT_PAGE.faqQuestions} />)

    const section = screen.getByRole('list').closest('section')
    expect(section).not.toBeNull()
    expect(section?.getAttribute('aria-labelledby')).toBeNull()
    expect(document.getElementById('agent-faq')).toBeNull()
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Frequently asked questions' })).toBeNull()
  })

  it('keeps Arc example content out of an empty FAQ', () => {
    render(
      <AeSiteFaq
        labelledBy="empty-faq"
        title="Available answers"
        questions={[]}
      />,
    )

    expect(screen.getByRole('region', { name: 'Available answers' })).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('What is Arc?')).toBeNull()
    expect(screen.queryByText('Everything you need to know before you install your first component.')).toBeNull()
    expect(screen.queryByText('Still have a question?')).toBeNull()
    expect(screen.queryByText('Our team replies within a day.')).toBeNull()
  })
})

function createStatusRouter() {
  const rootRoute = createRootRoute()
  return createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/status' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}
