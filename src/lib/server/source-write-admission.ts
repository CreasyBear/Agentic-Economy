import { createMiddleware } from '@tanstack/react-start'

import {
  createSourceWriteAdmission,
  resolveActiveSourceWriteSigningKey,
  sourceWriteBodyDigest,
  SourceWriteAdmissionError,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
  type SourceWriteAdmissionScope,
} from '@/modules/security/source-write-admission'
import { isRecord } from '@/modules/common/is-record'

type Env = Record<string, string | undefined>

type SourceWriteRequestContext = {
  sourceWriteRequest?: SourceWriteAdmissionRequest
}


export function createSourceWriteAdmissionMiddleware() {
  return createMiddleware().server((ctx) => {
    if (ctx.handlerType !== 'serverFn') {
      return ctx.next()
    }

    return ctx.next({
      context: {
        sourceWriteRequest: requestAdmissionContext(ctx.request),
      } satisfies SourceWriteRequestContext,
    })
  })
}

export async function sourceWriteAdmissionFromContext(input: {
  context: unknown
  scope: SourceWriteAdmissionScope
  operationKey: string
  correlationId: string
  env?: Env
}): Promise<SourceWriteAdmission> {
  const request = sourceWriteRequestFromContext(input.context)
  if (request === undefined) {
    throw new SourceWriteAdmissionError('missing_source_write_request', 'Server request admission is missing.')
  }

  return createSourceWriteAdmission({
    ...(input.env === undefined ? {} : { env: input.env }),
    request,
    scope: input.scope,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
  })
}

export async function sourceWriteAdmissionFromRequest(input: {
  request: Request
  scope: SourceWriteAdmissionScope
  operationKey: string
  correlationId: string
  bodyText?: string
  bodyDigest?: string
  env?: Env
}): Promise<SourceWriteAdmission> {
  return createSourceWriteAdmission({
    ...(input.env === undefined ? {} : { env: input.env }),
    request: requestAdmissionContext(input.request, {
      bodyDigest: input.bodyDigest ?? sourceWriteBodyDigest(input.bodyText),
    }),
    scope: input.scope,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
  })
}

function readRequiredSourceWriteSigningKey(
  scope: SourceWriteAdmissionScope,
  env: Env = process.env
): { keyId: string; secret: string } {
  const key = resolveActiveSourceWriteSigningKey(scope, env)
  return { keyId: key.keyId, secret: key.secret }
}

export function readRequiredSourceWriteSecret(scope: SourceWriteAdmissionScope, env: Env = process.env): string {
  return readRequiredSourceWriteSigningKey(scope, env).secret
}


function sourceWriteRequestFromContext(context: unknown): SourceWriteAdmissionRequest | undefined {
  if (!isRecord(context)) {
    return undefined
  }

  const request = context.sourceWriteRequest
  if (!isRecord(request)) {
    return undefined
  }

  return typeof request.method === 'string' &&
    typeof request.origin === 'string' &&
    typeof request.pathname === 'string' &&
    typeof request.bodyDigest === 'string'
    ? {
        method: request.method,
        origin: request.origin,
        pathname: request.pathname,
        bodyDigest: request.bodyDigest,
      }
    : undefined
}

function requestAdmissionContext(
  request: Request,
  options: { bodyDigest?: string } = {},
): SourceWriteAdmissionRequest {
  const url = new URL(request.url)
  return {
    method: request.method.toUpperCase(),
    origin: request.headers.get('Origin') ?? refererOrigin(request.headers.get('Referer')) ?? url.origin,
    pathname: url.pathname,
    bodyDigest: options.bodyDigest ?? sourceWriteBodyDigest(undefined),
  }
}

function refererOrigin(referer: string | null): string | undefined {
  if (referer === null) {
    return undefined
  }

  try {
    return new URL(referer).origin
  } catch {
    return undefined
  }
}


