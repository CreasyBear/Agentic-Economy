import { createFileRoute, Link } from '@tanstack/react-router'

import { AeAnswerStream } from '@/components/ae/landing/AeAnswerStream'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { decodeAnswerId } from '@/modules/answer/public'

export const Route = createFileRoute('/q/$answerId')({
  head: ({ params }) => {
    const query = decodeAnswerId(params.answerId)
    const title = query.length > 0 ? `${query} | Agentic Economy` : 'Answer | Agentic Economy'
    return {
      meta: [
        { title },
        {
          name: 'description',
          content:
            'A cited answer naming listed local businesses, what they handle, where they work, and your next step. No booking, no payment.',
        },
      ],
    }
  },
  component: AnswerRoute,
})

function AnswerRoute() {
  const { answerId } = Route.useParams()
  const query = decodeAnswerId(answerId)

  if (query.length === 0) {
    return (
      <AePublicShell>
        <section className="ae-answer-page ae-answer-page--missing" aria-label="Answer">
          <p className="ae-answer-page__query">That answer link is not recognised.</p>
          <Link to="/" className="ae-answer-page__back">Ask again</Link>
        </section>
      </AePublicShell>
    )
  }

  return (
    <AePublicShell>
      <section className="ae-answer-page" aria-label="Answer">
        <header className="ae-answer-page__head">
          <p className="ae-answer-page__query">{query}</p>
          <Link to="/" className="ae-answer-page__back">Ask another</Link>
        </header>
        <AeAnswerStream query={query} />
      </section>
    </AePublicShell>
  )
}
