import { createFileRoute } from '@tanstack/react-router'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { discoveryTextResponse } from '@/lib/http/discovery-response'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { buildPublicAgentSkillMarkdown } from '@/modules/discovery/public'

export const Route = createFileRoute('/SKILL.md')({
  staticData: {
    nav: {
      label: 'SKILL.md',
      footer: { column: 'Machines', order: 1 },
    },
  },
  server: {
    handlers: {
      GET: ({ request }) => handlePublicAgentSkillRequest(request),
      POST: () => methodNotAllowed(['GET', 'HEAD']),
      PUT: () => methodNotAllowed(['GET', 'HEAD']),
      PATCH: () => methodNotAllowed(['GET', 'HEAD']),
      DELETE: () => methodNotAllowed(['GET', 'HEAD']),
      HEAD: ({ request }) => handlePublicAgentSkillRequest(request, true),
      OPTIONS: () => methodNotAllowed(['GET', 'HEAD']),
      TRACE: () => methodNotAllowed(['GET', 'HEAD']),
      CONNECT: () => methodNotAllowed(['GET', 'HEAD']),
    },
  },
})

export function handlePublicAgentSkillRequest(request: Request, head = false): Response {
  const { baseUrl } = resolveCanonicalBaseUrl(request)
  const body = buildPublicAgentSkillMarkdown({
    canonicalBaseUrl: baseUrl,
    routingBaseUrl: process.env.AE_ROUTING_PUBLIC_BASE_URL?.trim() || baseUrl,
  })
  const response = discoveryTextResponse(body, 'text/markdown; charset=utf-8')
  return head ? new Response(null, { status: response.status, headers: response.headers }) : response
}

/** Nitro's explicit route keeps `.md` out of the dev asset fallback. */
export default function handlePublicAgentSkillNitroRequest(event: { req: Request }): Response {
  if (event.req.method === 'GET') return handlePublicAgentSkillRequest(event.req)
  if (event.req.method === 'HEAD') return handlePublicAgentSkillRequest(event.req, true)
  return methodNotAllowed(['GET', 'HEAD'])
}
