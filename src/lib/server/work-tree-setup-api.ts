import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { constantTimeStringEqual } from '@/lib/server/constant-time'
import { response } from '@/lib/server/no-store-response'
import { readCustomerRequestRelease } from '@/modules/customer-request/release-readback'
import {
  seedWorkTreeCohortThroughSource,
  verifyWorkTreeSetupIdentity,
  workTreeSetupIdentitySchema,
  workTreeSetupInputSchema,
  WORK_TREE_SETUP_MAX_BODY_BYTES,
  type WorkTreeSetupIdentity,
  type WorkTreeSetupInput,
  type WorkTreeSetupResult,
} from '@/modules/work-tree/setup.functions'

const SETUP_TOKEN_ENV = 'AE_WORK_TREE_SETUP_TOKEN'

type HandlerOptions = Readonly<{
  env?: Record<string, string | undefined>
  now?: () => number
  seed?: (input: Readonly<{ request: WorkTreeSetupInput; env: Record<string, string | undefined>; now?: () => number }>) => Promise<WorkTreeSetupResult>
  observedIdentity?: WorkTreeSetupIdentity
}>

type JsonBody = Readonly<{ ok: true; value: unknown }> | Readonly<{ ok: false; status: 400 | 413 }>

/**
 * Deployment-only seed boundary. It is intentionally not a registered agent
 * operation: setup credentials never become an actor principal and the source
 * function owns every WorkTree write.
 */
export async function handleWorkTreeSetup(request: Request, options: HandlerOptions = {}): Promise<Response> {
  const env = options.env ?? process.env
  const configuredToken = env[SETUP_TOKEN_ENV]?.trim()
  if (configuredToken === undefined || configuredToken.length === 0) {
    return response({ kind: 'refused', code: 'setup_unavailable' }, 503, { Vary: 'Authorization' })
  }
  const suppliedToken = readBearerToken(request.headers.get('authorization'))
  if (suppliedToken === undefined || !constantTimeStringEqual(suppliedToken, configuredToken)) {
    return response({ kind: 'refused', code: 'authentication_required' }, 401, { Vary: 'Authorization', 'WWW-Authenticate': 'Bearer' })
  }

  const body = await readBody(request)
  if (!body.ok) {
    return response({ kind: 'refused', code: body.status === 413 ? 'request_too_large' : 'invalid_input' }, body.status, { Vary: 'Authorization' })
  }
  const parsed = workTreeSetupInputSchema.safeParse(body.value)
  if (!parsed.success) {
    return response({ kind: 'refused', code: 'invalid_input', reason: parsed.error.issues[0]?.message ?? 'Input did not match the setup schema.' }, 400, { Vary: 'Authorization' })
  }

  const requestInput = parsed.data
  try {
    const observed = options.observedIdentity ?? readWorkTreeObservedIdentity(env)
    if (observed === undefined) throw new Error('hosted_release_identity_unavailable')
    verifyWorkTreeSetupIdentity({
      expected: {
        sourceRevision: requestInput.sourceRevision,
        vercelDeploymentId: requestInput.vercelDeploymentId,
        convexDeploymentId: requestInput.convexDeploymentId,
        convexUrl: requestInput.convexUrl,
      },
      observed,
    })
    const seeded = await (options.seed ?? seedWorkTreeCohortThroughSource)({
      request: requestInput,
      env,
      ...(options.now === undefined ? {} : { now: options.now }),
    })
    return setupResultResponse(seeded)
  } catch (error) {
    if (error instanceof Error && error.message === 'hosted_release_identity_mismatch') {
      return response({ kind: 'refused', code: 'release_identity_mismatch' }, 409, { Vary: 'Authorization' })
    }
    if (error instanceof Error && error.message === 'hosted_release_identity_unavailable') {
      return response({ kind: 'refused', code: 'release_identity_unavailable' }, 503, { Vary: 'Authorization' })
    }
    return response({ kind: 'refused', code: 'source_unavailable' }, 503, { Vary: 'Authorization' })
  }
}
export function readWorkTreeObservedIdentity(env: Record<string, string | undefined>): WorkTreeSetupIdentity | undefined {
  const release = readCustomerRequestRelease({ env })
  if (release.kind === 'unavailable' || release.deployment.convex === undefined) return undefined
  const observed = workTreeSetupIdentitySchema.safeParse({
    sourceRevision: release.source.revision,
    vercelDeploymentId: release.deployment.id,
    convexDeploymentId: release.deployment.convex.id,
    convexUrl: release.deployment.convex.url,
  })
  return observed.success ? observed.data : undefined
}


function setupResultResponse(result: WorkTreeSetupResult): Response {
  switch (result.kind) {
    case 'accepted':
    case 'replayed':
      return response(result, 200, { Vary: 'Authorization' })
    case 'refused':
      return response(result, result.code === 'idempotency_conflict' || result.code === 'release_identity_mismatch' ? 409 : result.code === 'invalid_input' ? 400 : 503, { Vary: 'Authorization' })
  }
}

function readBearerToken(value: string | null): string | undefined {
  if (value === null) return undefined
  const match = /^Bearer ([^\s]+)$/u.exec(value.trim())
  return match?.[1]
}

async function readBody(request: Request): Promise<JsonBody> {
  const bounded = await readBoundedRequestJson(request, WORK_TREE_SETUP_MAX_BODY_BYTES)
  if (!bounded.ok) return { ok: false, status: bounded.code === 'payload_too_large' ? 413 : 400 }
  return { ok: true, value: bounded.value }
}
