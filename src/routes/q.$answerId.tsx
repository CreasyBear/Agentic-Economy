import { createFileRoute, redirect } from '@tanstack/react-router'

import { decodeAnswerId, encodeAnswerId } from '@/modules/answer/public'

/**
 * Legacy share links (`/q/$answerId`) redirect to the primary chat shell on `/`.
 * See `.planning/ANSWER-AI-CONTRACT.md`.
 */
export const Route = createFileRoute('/q/$answerId')({
  beforeLoad: ({ params }) => {
    const query = decodeAnswerId(params.answerId)
    if (query.length === 0 || encodeAnswerId(query) !== params.answerId) {
      throw redirect({ to: '/' })
    }
    throw redirect({ to: '/', search: { q: query } })
  },
  component: LegacyAnswerRedirect,
})

function LegacyAnswerRedirect() {
  return null
}
