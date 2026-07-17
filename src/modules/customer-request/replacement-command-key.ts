export type ReplacementCommandPayload = Readonly<{
  requestRef: string
  expectedRevision: number
  message: string
  mode: 'replace'
}>

export type ReplacementCommandIdentity = ReplacementCommandPayload & Readonly<{
  idempotencyKey: string
}>

export function resolveReplacementCommandKey(
  previous: ReplacementCommandIdentity | undefined,
  payload: ReplacementCommandPayload,
  createId: () => string,
): ReplacementCommandIdentity {
  if (previous !== undefined
    && previous.requestRef === payload.requestRef
    && previous.expectedRevision === payload.expectedRevision
    && previous.message === payload.message
    && previous.mode === payload.mode) return previous

  return {
    ...payload,
    idempotencyKey: `replace:${payload.requestRef}:${payload.expectedRevision}:${createId()}`,
  }
}
