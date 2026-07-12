import { z } from 'zod'

import { readBoundedRequestText } from '@/lib/server/bounded-request-body'

import type { KernelCaller, NeutralRoutingKernel } from './application'
import { ROUTING_PROTOCOL_VERSION, type RoutingOperation } from './contract'

const MAX_BODY_BYTES = 64 * 1024

const protocolVersion = z.literal(ROUTING_PROTOCOL_VERSION)
const routeBody = z.object({
  protocolVersion,
  networkId: z.string().min(1).max(200),
  query: z.string().trim().min(1).max(8_000),
  constraints: z.object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    maximumSpendMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    optimizeFor: z.enum(['cost', 'latency']).optional(),
  }).strict(),
}).strict()
const executeBody = z.object({
  protocolVersion,
  quoteId: z.string().min(1).max(200),
  quoteDigest: z.string().min(1).max(200),
  authorizationRef: z.string().min(1).max(200).optional(),
  approval: z.object({
    maximumSpendMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().regex(/^[A-Z]{3}$/),
    expiresAt: z.number().int().positive(),
    allowedDataFields: z.array(z.string().min(1).max(200)).max(128),
  }).strict().optional(),
  idempotencyKey: z.string().min(1).max(200),
  data: z.record(z.string().min(1).max(200), z.string().max(8_000)).optional(),
  executionPurpose: z.literal('incident_canary').optional(),
  canaryRecoveryGrantId: z.string().min(1).max(200).optional(),
}).strict().refine((value) => (value.authorizationRef === undefined) !== (value.approval === undefined), {
  message: 'Exactly one authorization source is required.',
}).refine((value) => (value.executionPurpose === 'incident_canary') === (value.canaryRecoveryGrantId !== undefined), {
  message: 'Canary purpose and recovery authority must be supplied together.',
})
const authorizeBody = z.object({
  protocolVersion, quoteId: z.string().min(1).max(200), quoteDigest: z.string().min(1).max(200),
  maximumSpendMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/), expiresAt: z.number().int().positive(),
  allowedDataFields: z.array(z.string().min(1).max(200)).max(128),
  idempotencyKey: z.string().min(1).max(200),
}).strict()
const runBody = z.object({
  protocolVersion,
  rootRunId: z.string().min(1).max(200),
}).strict()
const reconcileBody = z.object({
  protocolVersion,
  rootRunId: z.string().min(1).max(200),
  recoveryGrantId: z.string().min(1).max(200).optional(),
}).strict()

export type RoutingKernelAuthenticationResult =
  | Readonly<{ kind: 'authenticated'; caller: KernelCaller; grant?: RoutingKernelCallerGrant }>
  | Readonly<{ kind: 'unauthenticated' }>

export type RoutingKernelCallerGrant = Readonly<{
  grantId: string
  networkIds: readonly string[]
  maximumSpendMinor: number
  currency: string
  allowedDataFields: readonly string[]
  protectedFieldSetId: string
  maximumDisclosureAttempts: number
  maximumDisclosureExposures: number
  allowedRecipientBindingIds: readonly string[]
  allowedDisclosurePurposes: readonly string[]
  expiresAt: number
}>

export type RoutingKernelHttpDependencies = Readonly<{
  operations: NeutralRoutingKernel['operations']
  authenticate: (request: Request, bodyText: string) => Promise<RoutingKernelAuthenticationResult>
  authorize?: (input: Readonly<{
    caller: KernelCaller
    quoteId: string
    quoteDigest: string
    maximumSpendMinor: number
    currency: string
    expiresAt: number
    allowedDataFields: readonly string[]
    idempotencyKey: string
    sourceGrantId: string
  }>) => Promise<Readonly<{ kind: 'authorized'; authorizationRef: string }> | Readonly<{ kind: 'authorization_refused'; reason: string }>>
  admission?: Readonly<{
    admit: (input: Readonly<{ requestId: string; agentId: string; operation: RoutingAdmissionOperation; admittedAt: number }>) => Promise<RoutingAdmissionResult>
    release: (input: Readonly<{ requestId: string; releasedAt: number }>) => Promise<void>
  }>
}>

type Operation = RoutingOperation
export type RoutingAdmissionOperation = RoutingOperation | 'mcp_control'
export type RoutingAdmissionResult =
  | Readonly<{ kind: 'admitted'; requestId: string; expiresAt: number }>
  | Readonly<{ kind: 'refused'; reason: string; retryAfterMs: number }>

export async function handleRoutingKernelHttpRequest(
  request: Request,
  dependencies: RoutingKernelHttpDependencies,
): Promise<Response> {
  const operation = operationFromPath(new URL(request.url).pathname)
  if (operation === undefined) return errorResponse('unknown', 'operation_not_found', 404)
  if (request.method !== 'POST') return errorResponse(operation, 'method_not_allowed', 405)
  if (!isJsonContentType(request)) return errorResponse(operation, 'invalid_content_type', 415)

  const declaredLength = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return errorResponse(operation, 'payload_too_large', 413)
  }
  const body = await readBoundedRequestText(request, MAX_BODY_BYTES)
  if (!body.ok) return errorResponse(operation, 'payload_too_large', 413)

  const authentication = await dependencies.authenticate(request, body.text)
  if (authentication.kind !== 'authenticated') {
    return errorResponse(operation, 'authentication_required', 401)
  }

  const admission = await admitRequest(request, dependencies, authentication.caller, operation)
  if (admission.kind === 'refused') return admissionErrorResponse(operation, admission)

  try {
    let untrusted: unknown
    try {
      untrusted = JSON.parse(body.text)
    } catch {
      return errorResponse(operation, 'invalid_json', 400)
    }

    switch (operation) {
    case 'route': {
      const parsed = routeBody.safeParse(untrusted)
      if (!parsed.success) return errorResponse(operation, 'invalid_request', 400)
      if (authentication.grant !== undefined && (
        !authentication.grant.networkIds.includes(parsed.data.networkId)
        || authentication.grant.currency !== parsed.data.constraints.currency
        || authentication.grant.maximumSpendMinor < parsed.data.constraints.maximumSpendMinor
        || authentication.grant.expiresAt <= Date.now()
      )) return errorResponse(operation, 'grant_constraints_exceeded', 403)
      const result = await dependencies.operations.route({
        networkId: parsed.data.networkId,
        caller: authentication.caller,
        query: parsed.data.query,
        constraints: {
          currency: parsed.data.constraints.currency,
          maximumSpendMinor: parsed.data.constraints.maximumSpendMinor,
          ...(parsed.data.constraints.optimizeFor === undefined ? {} : { optimizeFor: parsed.data.constraints.optimizeFor }),
        },
      })
      return successResponse(operation, result)
    }
    case 'execute': {
      const parsed = executeBody.safeParse(untrusted)
      if (!parsed.success) return errorResponse(operation, 'invalid_request', 400)
      let authorizationRef = parsed.data.authorizationRef
      if (parsed.data.approval !== undefined) {
        if (dependencies.authorize === undefined) return errorResponse(operation, 'authorization_unavailable', 503)
        const grant = authentication.grant
        if (grant === undefined
          || grant.currency !== parsed.data.approval.currency
          || grant.maximumSpendMinor < parsed.data.approval.maximumSpendMinor
          || grant.expiresAt < parsed.data.approval.expiresAt
          || parsed.data.approval.allowedDataFields.some((field) => !grant.allowedDataFields.includes(field))) {
          return errorResponse(operation, 'grant_constraints_exceeded', 403)
        }
        const authorization = await dependencies.authorize({
          caller: authentication.caller,
          quoteId: parsed.data.quoteId,
          quoteDigest: parsed.data.quoteDigest,
          ...parsed.data.approval,
          idempotencyKey: parsed.data.idempotencyKey,
          sourceGrantId: grant.grantId,
        })
        if (authorization.kind !== 'authorized') return errorResponse(operation, authorization.reason, 403)
        authorizationRef = authorization.authorizationRef
      }
      if (authorizationRef === undefined) return errorResponse(operation, 'authorization_required', 403)
      const result = await dependencies.operations.execute({
        caller: authentication.caller,
        quoteId: parsed.data.quoteId,
        quoteDigest: parsed.data.quoteDigest,
        authorizationRef,
        idempotencyKey: parsed.data.idempotencyKey,
        ...(parsed.data.data === undefined ? {} : { data: parsed.data.data }),
        ...(parsed.data.executionPurpose === undefined ? {} : { executionPurpose: parsed.data.executionPurpose }),
        ...(parsed.data.canaryRecoveryGrantId === undefined ? {} : { canaryRecoveryGrantId: parsed.data.canaryRecoveryGrantId }),
      })
      return successResponse(operation, result)
    }
    case 'authorize': {
      const parsed = authorizeBody.safeParse(untrusted)
      if (!parsed.success) return errorResponse(operation, 'invalid_request', 400)
      if (dependencies.authorize === undefined) return errorResponse(operation, 'authorization_unavailable', 503)
      const grant = authentication.grant
      if (grant === undefined || grant.currency !== parsed.data.currency
        || grant.maximumSpendMinor < parsed.data.maximumSpendMinor || grant.expiresAt < parsed.data.expiresAt
        || parsed.data.allowedDataFields.some((field) => !grant.allowedDataFields.includes(field))) {
        return errorResponse(operation, 'grant_constraints_exceeded', 403)
      }
      return successResponse(operation, await dependencies.authorize({
        caller: authentication.caller, ...parsed.data, sourceGrantId: grant.grantId,
      }))
    }
    case 'inspect': {
      const parsed = runBody.safeParse(untrusted)
      if (!parsed.success) return errorResponse(operation, 'invalid_request', 400)
      return successResponse(operation, await dependencies.operations.inspect({
        caller: authentication.caller,
        rootRunId: parsed.data.rootRunId,
      }))
    }
    case 'reconcile': {
      const parsed = reconcileBody.safeParse(untrusted)
      if (!parsed.success) return errorResponse(operation, 'invalid_request', 400)
      return successResponse(operation, await dependencies.operations.reconcileProviderOutcome({
        caller: authentication.caller,
        rootRunId: parsed.data.rootRunId,
        ...(parsed.data.recoveryGrantId === undefined ? {} : { recoveryGrantId: parsed.data.recoveryGrantId }),
      }))
    }
    case 'cancel': {
      const parsed = runBody.safeParse(untrusted)
      if (!parsed.success) return errorResponse(operation, 'invalid_request', 400)
      return successResponse(operation, await dependencies.operations.cancel({
        caller: authentication.caller,
        rootRunId: parsed.data.rootRunId,
      }))
    }
    }
  } finally {
    await releaseRequest(dependencies, admission)
  }
}

export async function admitRequest(
  request: Request,
  dependencies: RoutingKernelHttpDependencies,
  caller: KernelCaller,
  operation: RoutingAdmissionOperation,
): Promise<RoutingAdmissionResult> {
  if (dependencies.admission === undefined) return { kind: 'admitted', requestId: request.headers.get('X-AE-Edge-Request-Id') ?? crypto.randomUUID(), expiresAt: Date.now() + 30_000 }
  return await dependencies.admission.admit({
    requestId: request.headers.get('X-AE-Edge-Request-Id') ?? crypto.randomUUID(),
    agentId: caller.agentId,
    operation,
    admittedAt: Date.now(),
  })
}

export async function releaseRequest(dependencies: RoutingKernelHttpDependencies, admission: RoutingAdmissionResult): Promise<void> {
  if (admission.kind === 'admitted' && dependencies.admission !== undefined) {
    await dependencies.admission.release({ requestId: admission.requestId, releasedAt: Date.now() })
  }
}

function operationFromPath(pathname: string): Operation | undefined {
  switch (pathname) {
    case '/v1/route': return 'route'
    case '/v1/authorize': return 'authorize'
    case '/v1/execute': return 'execute'
    case '/v1/reconcile': return 'reconcile'
    case '/v1/inspect': return 'inspect'
    case '/v1/cancel': return 'cancel'
    default: return undefined
  }
}

function successResponse(operation: Operation, result: unknown): Response {
  return jsonResponse({ protocolVersion: ROUTING_PROTOCOL_VERSION, operation, result }, 200)
}

function errorResponse(operation: Operation | 'unknown', code: string, status: number): Response {
  return jsonResponse({
    protocolVersion: ROUTING_PROTOCOL_VERSION,
    operation,
    error: { code, retryable: false },
  }, status)
}

function admissionErrorResponse(operation: Operation, admission: Extract<RoutingAdmissionResult, { kind: 'refused' }>): Response {
  const status = admission.reason.includes('saturated') ? 503 : 429
  const response = errorResponse(operation, admission.reason, status)
  response.headers.set('Retry-After', String(Math.max(1, Math.ceil(admission.retryAfterMs / 1_000))))
  return response
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function isJsonContentType(request: Request): boolean {
  return (request.headers.get('Content-Type') ?? '').toLowerCase().includes('application/json')
}
