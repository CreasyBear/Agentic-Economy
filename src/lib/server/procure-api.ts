import { degrade } from '@/lib/observability/degrade'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { isJsonContentType } from '@/lib/server/json-content-type'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { response } from '@/lib/server/no-store-response'
import {
  authenticateCallGateway,
  createCallService,
  type CallHandlerOptions,
} from '@/lib/server/call-api'
import {
  toolProcureAction,
} from '@/modules/capability-execution/procure.actions'
import { projectProcureNext } from '@/modules/actions/contract'
import {
  CapabilityProcurementEngine,
  createProcureIdentityPort,
  defaultProductionCatalogSearcher,
  ProcureAuthorityError,
  ProcureConflictError,
  ProcureInProgressError,
  type ProcurementEngineDependencies,
} from '@/modules/capability-execution/procure-engine'

const MAX_PROCURE_BODY_BYTES = 64 * 1024
const procureResponseHeaders = {
  'Content-Type': 'application/json',
} as const

export function createProcurementEngine(
  deps: ProcurementEngineDependencies,
): CapabilityProcurementEngine {
  return new CapabilityProcurementEngine(deps)
}

export async function handleToolProcurePost(
  request: Request,
  optionsOrEngine?: CallHandlerOptions | CapabilityProcurementEngine,
  engineOverride?: CapabilityProcurementEngine,
): Promise<Response> {
  const isEngine = optionsOrEngine instanceof CapabilityProcurementEngine
  const options: CallHandlerOptions = isEngine ? {} : (optionsOrEngine ?? {})
  const engine = isEngine ? optionsOrEngine : engineOverride

  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    return await withHttpRateLimit(request, 'public-mutation', async () => {
      const bounded = await readBoundedRequestText(request, MAX_PROCURE_BODY_BYTES)
      if (!bounded.ok) {
        return withRequestCorrelationHeader(
          problem({
            status: 413,
            kind: 'PAYLOAD_TOO_LARGE',
            code: bounded.code,
            detail: 'The capability procurement body is too large.',
          }),
          correlationId,
        )
      }

      if (!(await isJsonContentType(request.headers.get('content-type')))) {
        return withRequestCorrelationHeader(
          problem({
            status: 415,
            kind: 'UNSUPPORTED_MEDIA_TYPE',
            code: 'invalid_content_type',
            detail: 'The request content-type must be application/json.',
          }),
          correlationId,
        )
      }

      let rawBody: unknown
      try {
        rawBody = JSON.parse(bounded.text)
      } catch (cause) {
        return degrade(cause, withRequestCorrelationHeader(
          problem({
            status: 400,
            kind: 'INVALID_ARGUMENT',
            code: 'invalid_json',
            detail: 'The request body must be valid JSON.',
          }),
          correlationId,
        ), { site: 'handleToolProcurePost', reason: 'invalid_response' })
      }

      const parsed = toolProcureAction.schema.safeParse(rawBody)
      if (!parsed.success) {
        return withRequestCorrelationHeader(
          problem({
            status: 400,
            kind: 'INVALID_ARGUMENT',
            code: 'invalid_request',
            detail: parsed.error.issues[0]?.message ?? 'The request did not match the procurement schema.',
          }),
          correlationId,
        )
      }

      try {
        let procurementEngine = engine
        if (procurementEngine === undefined) {
          const admitted = await authenticateCallGateway(request, correlationId, options, bounded.text)
          if (admitted instanceof Response) return admitted

          const callService = options.callService ?? createCallService(request, bounded.text)
          procurementEngine = new CapabilityProcurementEngine({
            catalogSearcher: defaultProductionCatalogSearcher,
            callService,
            principal: admitted.principal,
            correlationId,
            identity: createProcureIdentityPort(request, bounded.text, correlationId),
          })
        }

        const result = await procurementEngine.procure(parsed.data)
        const projected = toolProcureAction.outputSchema.parse(result)
        const next = projected.status === 'needs_input' ? projected.next : projectProcureNext(projected)
        if (projected.status === 'refused' && projected.code === 'budget_exceeded') {
          return withRequestCorrelationHeader(
            problem({
              kind: 'RESOURCE_EXHAUSTED',
              code: projected.code,
              detail: projected.detail,
              retryable: projected.retryable,
              extras: {
                requestId: correlationId,
                next,
                refs: {
                  idempotencyKey: projected.idempotencyKey,
                  ...(projected.quoteRef === undefined ? {} : { quoteRef: projected.quoteRef }),
                },
              },
            }),
            correlationId,
          )
        }
        return withRequestCorrelationHeader(
          response({ ...projected, next }, 200, procureResponseHeaders),
          correlationId,
        )
      } catch (error) {
        const known = error instanceof ProcureConflictError
          ? { status: 409, kind: 'ALREADY_EXISTS' as const, code: 'idempotency_conflict' }
          : error instanceof ProcureInProgressError
            ? { status: 503, kind: 'UNAVAILABLE' as const, code: 'procurement_in_progress' }
            : error instanceof ProcureAuthorityError
              ? { status: 403, kind: 'PERMISSION_DENIED' as const, code: 'principal_denied' }
              : { status: 500, kind: 'INTERNAL' as const, code: 'procurement_failed' }
        return withRequestCorrelationHeader(
          problem({
            ...known,
            detail: known.status === 500 ? 'Capability procurement failed unexpectedly.' : error instanceof Error ? error.message : 'Procurement refused.',
            ...(error instanceof ProcureInProgressError && parsed.data.kind === 'exact' ? {
              retryable: true,
              extras: {
                requestId: correlationId,
                next: [],
                refs: { idempotencyKey: parsed.data.idempotencyKey, toolRef: parsed.data.toolRef, identityPreserved: true },
              },
            } : {}),
          }),
          correlationId,
        )
      }
    })
  })
}
