import { createFileRoute } from '@tanstack/react-router'
import glossaryMarkdown from '../../docs/glossary.md?raw'

import { discoveryTextResponse } from '@/lib/http/discovery-response'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/glossary.md')({
  staticData: {
    nav: {
      label: 'glossary.md',
      footer: { column: 'Machines', order: 3 },
    },
  },
  server: {
    handlers: {
      GET: () => handlePublicGlossaryRequest(),
      POST: () => methodNotAllowed(['GET', 'HEAD']),
      PUT: () => methodNotAllowed(['GET', 'HEAD']),
      PATCH: () => methodNotAllowed(['GET', 'HEAD']),
      DELETE: () => methodNotAllowed(['GET', 'HEAD']),
      HEAD: () => handlePublicGlossaryRequest(true),
      OPTIONS: () => methodNotAllowed(['GET', 'HEAD']),
      TRACE: () => methodNotAllowed(['GET', 'HEAD']),
      CONNECT: () => methodNotAllowed(['GET', 'HEAD']),
    },
  },
})

export function handlePublicGlossaryRequest(head = false): Response {
  const response = discoveryTextResponse(glossaryMarkdown, 'text/markdown; charset=utf-8')
  return head ? new Response(null, { status: response.status, headers: response.headers }) : response
}

/** Nitro's explicit route keeps `.md` out of the dev asset fallback. */
export default function handlePublicGlossaryNitroRequest(event: { req: Request }): Response {
  if (event.req.method === 'GET') return handlePublicGlossaryRequest()
  if (event.req.method === 'HEAD') return handlePublicGlossaryRequest(true)
  return methodNotAllowed(['GET', 'HEAD'])
}
