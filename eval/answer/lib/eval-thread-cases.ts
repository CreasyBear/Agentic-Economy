import type { AnswerThreadEvalCase } from './eval-case-types'

export const ANSWER_THREAD_EVAL_CASES = [
  {
    id: 'thread-follow-up-searches-again',
    description: 'A follow-up stays in the same tool loop and searches the live catalog again.',
    covers: [
      'model-chosen-tool-loop',
      'bounded-tool-loop',
      'persisted-tool-evidence',
      'timing-trace',
      'public-copy-boundary',
      'public-copy-safety-scan',
    ],
    turns: [
      {
        query: 'listed offering parramatta',
        openRouterAgent: {
          toolCalls: [{ toolId: 'registry.search', input: { query: 'listed offering parramatta' } }],
          prose: {
            oneLine: 'Something that matches what you need is listed in Parramatta.',
            summary: 'I found something that matches what you need in Parramatta.',
            whatToDoNow:
              'Review the listing and send an inquiry. Agentic Economy does not book or take payment on this page.',
          },
        },
        expected: {
          status: 'complete',
          expectedModelToolRuns: 1,
          maxModelRequests: 5,
          maxModelToolRuns: 1,
          maxToolRuns: 1,
          slugs: ['demo-listed-provider'],
          toolQueries: ['listed offering parramatta'],
          toolIds: ['registry.search'],
          toolStatuses: ['complete'],
          includeTimingNames: ['model.agent_total', 'sse.emit_snapshot'],
          forbidInternalPublicTerms: true,
          forbidUnsafeClaims: true,
          maxTotalTimingMs: 5_000,
        },
      },
      {
        query: 'which take inquiries?',
        openRouterAgent: {
          toolCalls: [{ toolId: 'registry.search', input: { query: 'which take inquiries parramatta' } }],
          prose: {
            oneLine: 'No businesses accept requests yet.',
            summary: 'A fresh catalog search shows no businesses that accept requests yet.',
            whatToDoNow:
              'Ask about another provider or service. Agentic Economy does not book or take payment on this page.',
          },
        },
        expected: {
          status: 'complete',
          expectedModelToolRuns: 1,
          maxModelRequests: 5,
          maxModelToolRuns: 1,
          maxToolRuns: 1,
          slugs: [],
          toolQueries: ['which take inquiries parramatta'],
          toolIds: ['registry.search'],
          toolStatuses: ['complete'],
          includeTimingNames: ['sse.emit_snapshot', 'model.agent_total'],
          oneLineIncludes: ['No businesses accept requests yet'],
          forbidInternalPublicTerms: true,
          forbidUnsafeClaims: true,
          maxTotalTimingMs: 5_000,
        },
      },
    ],
  },
  {
    id: 'thread-unsupported-follow-up-keeps-boundary',
    description: 'An unsafe follow-up after a provider result returns boundary copy without fresh tools or provider I/O.',
    covers: [
      'model-chosen-tool-loop',
      'bounded-tool-loop',
      'multi-turn-boundary',
      'persisted-tool-evidence',
      'timing-trace',
      'public-copy-boundary',
      'public-copy-safety-scan',
    ],
    turns: [
      {
        query: 'listed offering parramatta',
        openRouterAgent: {
          toolCalls: [{ toolId: 'registry.search', input: { query: 'listed offering parramatta' } }],
          prose: {
            oneLine: 'Something that matches what you need is listed in Parramatta.',
            summary: 'I found something that matches what you need in Parramatta.',
            whatToDoNow:
              'Review the listing and send an inquiry. Agentic Economy does not book or take payment on this page.',
          },
        },
        expected: {
          status: 'complete',
          expectedModelToolRuns: 1,
          maxModelRequests: 5,
          maxModelToolRuns: 1,
          maxToolRuns: 1,
          slugs: ['demo-listed-provider'],
          toolQueries: ['listed offering parramatta'],
          includeTimingNames: ['model.agent_total', 'sse.emit_snapshot'],
          toolIds: ['registry.search'],
          toolStatuses: ['complete'],
          forbidInternalPublicTerms: true,
          forbidUnsafeClaims: true,
          maxTotalTimingMs: 5_000,
        },
      },
      {
        query: 'book the first one and pay now',
        openRouterAgent: {
          toolCalls: [],
          prose: {
            oneLine: 'I cannot book or pay for the Parramatta provider.',
            summary:
              'The Parramatta provider remains listed, but Agentic Economy cannot book or take payment on your behalf.',
            whatToDoNow:
              'Contact the listed Parramatta provider directly to arrange the service and payment.',
          },
        },
        expected: {
          status: 'complete',
          expectedModelRequests: 3,
          expectedModelToolRuns: 0,
          maxToolRuns: 0,
          slugs: [],
          toolQueries: [],
          includeTimingNames: [
            'turn.context_parse',
            'model.agent_total',
            'sse.emit_snapshot',
            'turn.persistence_prepare',
          ],
          excludeTimingNames: ['retrieval.initial_search'],
          forbidInternalPublicTerms: true,
          forbidUnsafeClaims: true,
          maxTotalTimingMs: 5_000,
        },
      },
    ],
  },
] as const satisfies readonly AnswerThreadEvalCase[]

export function findAnswerThreadEvalCase(caseId: string): AnswerThreadEvalCase | undefined {
  return ANSWER_THREAD_EVAL_CASES.find((testCase) => testCase.id === caseId)
}
