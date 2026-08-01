import { createFileRoute } from '@tanstack/react-router'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { discoveryTextResponse } from '@/lib/http/discovery-response'
import { listMcpActions, mcpToolName } from '@/modules/actions'
import { buildPublicAgentSkillMarkdown } from '@/modules/discovery/public'

export const Route = createFileRoute('/SKILL.md')({
  server: {
    handlers: {
      GET: ({ request }) => handlePublicAgentSkillRequest(request),
    },
  },
})

export function handlePublicAgentSkillRequest(request: Request): Response {
  const { baseUrl } = resolveCanonicalBaseUrl(request)
  const body = buildPublicAgentSkillMarkdown({
    canonicalBaseUrl: baseUrl,
    routingBaseUrl: process.env.AE_ROUTING_PUBLIC_BASE_URL?.trim() || baseUrl,
    mcpToolNames: listMcpActions().map(mcpToolName),
  })
  return discoveryTextResponse(body, 'text/markdown; charset=utf-8')
}
