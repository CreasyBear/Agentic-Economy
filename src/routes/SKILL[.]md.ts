import { createFileRoute } from '@tanstack/react-router'

import { availabilityStatement } from '@/content/availability-copy'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { discoveryTextResponse } from '@/lib/http/discovery-response'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { buildPublicAgentSkillMarkdown } from '@/modules/discovery/public'
import { readPublicAvailabilityThroughSource } from '@/modules/money/server'

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

/** Same source as the other public pages; an unreadable source reads as 'soon'. */
const readPaidCalls = () => readPublicAvailabilityThroughSource().then((a) => a.paidCalls, () => 'soon' as const)

export async function handlePublicAgentSkillRequest(request: Request, head = false): Promise<Response> {
  const { baseUrl } = resolveCanonicalBaseUrl(request)
  const body = buildPublicAgentSkillMarkdown({
    canonicalBaseUrl: baseUrl,
    availabilityStatement: availabilityStatement(await readPaidCalls()),
  })
  const response = discoveryTextResponse(body, 'text/markdown; charset=utf-8')
  return head ? new Response(null, { status: response.status, headers: response.headers }) : response
}

/** Nitro's explicit route keeps `.md` out of the dev asset fallback. */
export default function handlePublicAgentSkillNitroRequest(event: { req: Request }): Response | Promise<Response> {
  if (event.req.method === 'GET') return handlePublicAgentSkillRequest(event.req)
  if (event.req.method === 'HEAD') return handlePublicAgentSkillRequest(event.req, true)
  return methodNotAllowed(['GET', 'HEAD'])
}
