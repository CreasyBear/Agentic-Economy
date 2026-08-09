import { bearerChallenge } from '@/lib/http/oauth-challenge'
import { authenticateCustomerRequestAgent } from '@/lib/server/customer-request-agent-auth'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { problem } from '@/lib/server/problem'
import { readCustomerRequestRelease } from '@/modules/customer-request/release-readback'

type HandlerOptions = Readonly<{
  authenticate?: NonNullable<Parameters<typeof authenticateCustomerRequestAgent>[0]>['authenticate']
  env?: Record<string, string | undefined>
  observedAt?: () => number
}>

export async function handleAgentCustomerRequestReleaseGet(options: HandlerOptions = {}): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({
    ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
  })
  if (admitted.kind === 'refused') {
    const base = resolveCanonicalBaseUrl().baseUrl
    return problem(
      {
        status: admitted.status,
        kind: admitted.status === 401 ? 'UNAUTHENTICATED' : 'PERMISSION_DENIED',
        code: admitted.reason,
        detail: admitted.reason,
      },
      { 'WWW-Authenticate': bearerChallenge(base), 'Vary': 'Authorization' },
    )
  }

  const release = readCustomerRequestRelease({
    env: options.env ?? process.env,
    ...(options.observedAt === undefined ? {} : { observedAt: options.observedAt }),
  })
  if (release.kind === 'release_readback') return response(release, 200)
  return problem(
    { kind: 'UNAVAILABLE', code: release.reason, detail: 'Authoritative release identity unavailable.' },
    { Vary: 'Authorization' },
  )
}

function response(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      Vary: 'Authorization',
    },
  })
}
