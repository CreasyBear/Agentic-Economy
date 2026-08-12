import { createMiddleware } from '@tanstack/react-start'

import {
  createSourceWriteAdmission,
  resolveActiveSourceWriteSigningKey,
  sourceWriteBodyDigest as computeSourceWriteBodyDigest,
  sourceWriteCommandBodyDigest,
  sourceWriteCommandDigest,
  sourceWriteRequestFromAdmission,
  SOURCE_WRITE_NO_BODY_DIGEST,
  SourceWriteAdmissionError,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
  type SourceWriteAdmissionScope,
} from '@/modules/security/source-write-admission'
import { isRecord } from '@/modules/common/is-record'

export { sourceWriteRequestFromAdmission }

type Env = Record<string, string | undefined>
type SourceWriteRequestContext = { sourceWriteRequest?: SourceWriteAdmissionRequest }
type SourceWriteBody = string | Uint8Array

export function createSourceWriteAdmissionMiddleware() {
  return createMiddleware().server((ctx) => {
    if (ctx.handlerType !== 'serverFn') return ctx.next()

    return ctx.next({
      context: { sourceWriteRequest: requestAdmissionContext(ctx.request) } satisfies SourceWriteRequestContext,
    })
  })
}

export async function sourceWriteAdmissionFromContext(input: {
  context: unknown
  command: unknown
  scope: SourceWriteAdmissionScope
  operationKey: string
  correlationId: string
  env?: Env
}): Promise<SourceWriteAdmission> {
  if (input.command === undefined) {
    throw new SourceWriteAdmissionError('missing_source_write_request', 'The exact Convex command object is required for source-write admission.')
  }
  const request = sourceWriteRequestFromContext(input.context)
  if (request === undefined) {
    throw new SourceWriteAdmissionError('missing_source_write_request', 'Server request admission is missing.')
  }

  return await createSourceWriteAdmission({
    ...(input.env === undefined ? {} : { env: input.env }),
    request: { ...request, bodyDigest: sourceWriteCommandBodyDigest(input.command) },
    scope: input.scope,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    commandDigest: sourceWriteCommandDigest(input.command),
  })
}

export function sourceWriteRequestFromRequest(input: {
  request: Request
  body: SourceWriteBody
}): SourceWriteAdmissionRequest {
  return requestAdmissionContext(input.request, {
    bodyDigest: computeSourceWriteBodyDigest(input.body),
  })
}

export async function sourceWriteAdmissionFromRequest(input: {
  request: Request
  command: unknown
  body: SourceWriteBody
  scope: SourceWriteAdmissionScope
  operationKey: string
  correlationId: string
  env?: Env
}): Promise<SourceWriteAdmission> {
  if (input.command === undefined) {
    throw new SourceWriteAdmissionError('missing_source_write_request', 'The exact Convex command object is required for source-write admission.')
  }
  return await createSourceWriteAdmission({
    ...(input.env === undefined ? {} : { env: input.env }),
    request: sourceWriteRequestFromRequest({ request: input.request, body: input.body }),
    scope: input.scope,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    commandDigest: sourceWriteCommandDigest(input.command),
  })
}

export function readRequiredSourceWriteSecret(scope: SourceWriteAdmissionScope, env: Env = process.env): string {
  return resolveActiveSourceWriteSigningKey(scope, env).secret
}

function sourceWriteRequestFromContext(context: unknown): SourceWriteAdmissionRequest | undefined {
  if (!isRecord(context) || !isRecord(context.sourceWriteRequest)) return undefined
  const request = context.sourceWriteRequest
  return typeof request.method === 'string'
    && typeof request.initiatorOrigin === 'string'
    && typeof request.targetOrigin === 'string'
    && typeof request.targetPath === 'string'
    && typeof request.targetQuery === 'string'
    && typeof request.bodyDigest === 'string'
    ? {
        method: request.method,
        initiatorOrigin: request.initiatorOrigin,
        targetOrigin: request.targetOrigin,
        targetPath: request.targetPath,
        targetQuery: request.targetQuery,
        bodyDigest: request.bodyDigest,
      }
    : undefined
}

function requestAdmissionContext(
  request: Request,
  options: { bodyDigest: string } = { bodyDigest: SOURCE_WRITE_NO_BODY_DIGEST },
): SourceWriteAdmissionRequest {
  const url = new URL(request.url)
  return {
    method: request.method,
    initiatorOrigin: request.headers.get('Origin') ?? refererOrigin(request.headers.get('Referer')) ?? url.origin,
    targetOrigin: url.origin,
    targetPath: url.pathname,
    targetQuery: url.search,
    bodyDigest: options.bodyDigest,
  }
}

function refererOrigin(referer: string | null): string | undefined {
  if (referer === null) return undefined
  try {
    return new URL(referer).origin
  } catch {
    return undefined
  }
}
