export const ResultKindValues = ['ok', 'error'] as const

export type ResultKind = (typeof ResultKindValues)[number]

export type OkResult<Code extends string, Payload extends object = Record<never, never>> = Readonly<
  {
    kind: 'ok'
    code: Code
  } & Payload
>

export type ErrorResult<Code extends string, Payload extends object = Record<never, never>> = Readonly<
  {
    kind: 'error'
    code: Code
    retryable: boolean
  } & Payload
>

export type ModuleResult<
  OkCode extends string,
  ErrorCode extends string,
  OkPayload extends object = Record<never, never>,
  ErrorPayload extends object = Record<never, never>,
> = OkResult<OkCode, OkPayload> | ErrorResult<ErrorCode, ErrorPayload>

export function ok<Code extends string, Payload extends object>(
  code: Code,
  payload: Payload
): OkResult<Code, Payload> {
  return { kind: 'ok', code, ...payload }
}

export function error<Code extends string, Payload extends object>(
  code: Code,
  retryable: boolean,
  payload: Payload
): ErrorResult<Code, Payload> {
  return { kind: 'error', code, retryable, ...payload }
}
