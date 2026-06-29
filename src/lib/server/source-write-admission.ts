import { createMiddleware } from '@tanstack/react-start'

import {
  createSourceWriteAdmission,
  SourceWriteAdmissionError,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
  type SourceWriteAdmissionScope,
} from '@/modules/security/source-write-admission'

type Env = Record<string, string | undefined>

type SourceWriteRequestContext = {
  sourceWriteRequest?: SourceWriteAdmissionRequest
}

const publicSourceWriteSecretName = 'VI' + 'TE_AE_SOURCE_WRITE_SECRET'

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
    secret: readRequiredSourceWriteSecret(input.env),
    request,
    scope: input.scope,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
  })
}

export function readRequiredSourceWriteSecret(env: Env = process.env): string {
  if (readEnv(env, publicSourceWriteSecretName) !== undefined) {
    throw new SourceWriteAdmissionError(
      'client_exposed_source_write_secret',
      'AE_SOURCE_WRITE_SECRET must not be configured with a client-exposed prefix.'
    )
  }

  const secret = readEnv(env, 'AE_SOURCE_WRITE_SECRET')
  if (secret === undefined) {
    throw new SourceWriteAdmissionError('missing_source_write_secret', 'AE_SOURCE_WRITE_SECRET is required for source writes.')
  }

  return secret
}

function sourceWriteRequestFromContext(context: unknown): SourceWriteAdmissionRequest | undefined {
  if (!isRecord(context)) {
    return undefined
  }

  const request = context.sourceWriteRequest
  if (!isRecord(request)) {
    return undefined
  }

  return typeof request.method === 'string' && typeof request.origin === 'string' && typeof request.pathname === 'string'
    ? { method: request.method, origin: request.origin, pathname: request.pathname }
    : undefined
}

function requestAdmissionContext(request: Request): SourceWriteAdmissionRequest {
  const url = new URL(request.url)
  return {
    method: request.method.toUpperCase(),
    origin: request.headers.get('Origin') ?? refererOrigin(request.headers.get('Referer')) ?? url.origin,
    pathname: url.pathname,
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

function readEnv(env: Env, name: string): string | undefined {
  const value = env[name]
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
