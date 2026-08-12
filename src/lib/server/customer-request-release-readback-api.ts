import { bearerChallenge } from '@/lib/http/oauth-challenge'
import { authenticateAgentAccess } from '@/lib/server/agent-access-auth'
import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { problem } from '@/lib/server/problem'
import { isRecord } from '@/modules/common/is-record'
import { readCustomerRequestRelease } from '@/modules/customer-request/release-readback'
import { CUSTOMER_REQUEST_AGENT_SCOPE } from '@/modules/customer-request/agent-contract'

type ConvexSourceRevisionResult = Readonly<
  | { kind: 'ok'; sourceRevision: string }
  | { kind: 'unavailable'; reason: 'source_revision_unconfigured' }
>

const convexSourceRevisionQuery = sourceQuery<Record<string, never>, ConvexSourceRevisionResult>('settings:readReleaseIdentity')
const gitRevision = /^[a-f0-9]{40}$/u

type HandlerOptions = Readonly<{
  authenticate?: NonNullable<Parameters<typeof authenticateAgentAccess>[0]>['authenticate']
  env?: Record<string, string | undefined>
  observedAt?: () => number
}>
 
export async function handleAgentCustomerRequestReleaseGet(options: HandlerOptions = {}): Promise<Response> {
  const admitted = await authenticateAgentAccess({
    requiredScope: CUSTOMER_REQUEST_AGENT_SCOPE,
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

  const env = options.env ?? process.env
  const release = readCustomerRequestRelease({
    env,
    ...(options.observedAt === undefined ? {} : { observedAt: options.observedAt }),
  })
  if (release.kind !== 'release_readback') {
    return problem(
      { kind: 'UNAVAILABLE', code: release.reason, detail: 'Authoritative release identity unavailable.' },
      { Vary: 'Authorization' },
    )
  }
  const convex = release.deployment.convex
  if (convex === undefined) return response(release, 200)
  let runtime: ConvexSourceRevisionResult
  try {
    runtime = await callPublicSourceQuery(convexSourceRevisionQuery, {}, { env })
  } catch {
    return problem(
      { kind: 'UNAVAILABLE', code: 'convex_source_revision_unavailable', detail: 'Authoritative Convex release identity unavailable.' },
      { Vary: 'Authorization' },
    )
  }
  const sourceRevision = isRecord(runtime) && runtime.kind === 'ok' && typeof runtime.sourceRevision === 'string'
    ? runtime.sourceRevision.trim()
    : undefined
  if (
    sourceRevision === undefined
    || !gitRevision.test(sourceRevision)
    || sourceRevision !== release.source.revision
  ) {
    return problem(
      { kind: 'UNAVAILABLE', code: 'convex_source_revision_unavailable', detail: 'Authoritative Convex release identity unavailable.' },
      { Vary: 'Authorization' },
    )
  }
  return response({
    ...release,
    deployment: {
      ...release.deployment,
      convex: { ...convex, sourceRevision },
    },
  }, 200)
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
