import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'

export const Route = createFileRoute('/api/answer/turn')({
  server: {
    handlers: {
      POST: ({ request }) => handleAnswerTurnRequest(request),
      GET: () => methodNotAllowed(['POST']),
      PUT: () => methodNotAllowed(['POST']),
      PATCH: () => methodNotAllowed(['POST']),
      DELETE: () => methodNotAllowed(['POST']),
      HEAD: () => methodNotAllowed(['POST']),
      OPTIONS: () => methodNotAllowed(['POST']),
      TRACE: () => methodNotAllowed(['POST']),
      CONNECT: () => methodNotAllowed(['POST']),
    },
  },
})

export function handleAnswerTurnRequest(
  request: Request,
  ignored?: Readonly<Record<string, (
    input: never,
    send: (frame: Readonly<{ seq: number; event: Readonly<Record<string, unknown>> }>) => void,
  ) => unknown>>,
): Promise<Response>
export function handleAnswerTurnRequest<T>(request: Request, ignored?: T): Promise<Response>
export async function handleAnswerTurnRequest(
  _request: Request,
  ..._legacyArguments: readonly unknown[]
): Promise<Response> {
  return problem({
    status: 410,
    kind: 'NOT_FOUND',
    code: 'answer_api_retired',
    title: 'Answer API retired',
    detail: 'This endpoint is retired. Browser users can continue at /t/new.',
    retryable: false,
  })
}
