import { createFileRoute } from '@tanstack/react-router'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { discoveryTextResponse } from '@/lib/http/discovery-response'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { buildPublicAgentSkillMarkdown } from '@/modules/discovery/public'

export const Route = createFileRoute('/SKILL.md')({
  server: {
    handlers: {
      GET: ({ request }) => handlePublicAgentSkillRequest(request),
      POST: () => methodNotAllowed(['GET']),
      PUT: () => methodNotAllowed(['GET']),
      PATCH: () => methodNotAllowed(['GET']),
      DELETE: () => methodNotAllowed(['GET']),
      HEAD: () => methodNotAllowed(['GET']),
      OPTIONS: () => methodNotAllowed(['GET']),
      TRACE: () => methodNotAllowed(['GET']),
      CONNECT: () => methodNotAllowed(['GET']),
    },
  },
})

export function handlePublicAgentSkillRequest(request: Request): Response {
  const { baseUrl } = resolveCanonicalBaseUrl(request)
  const body = buildPublicAgentSkillMarkdown({
    canonicalBaseUrl: baseUrl,
    routingBaseUrl: process.env.AE_ROUTING_PUBLIC_BASE_URL?.trim() || baseUrl,
  })
  return discoveryTextResponse(body, 'text/markdown; charset=utf-8')
}

/** Nitro's explicit route keeps `.md` out of the dev asset fallback. */
export default function handlePublicAgentSkillNitroRequest(event: { req: Request }): Response {
  return handlePublicAgentSkillRequest(event.req)
}
