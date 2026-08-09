import type { ProblemDetails } from '@/lib/errors'
import type { AnswerTurnTransportError } from './answer-stream'
import { copyTextToClipboard } from '@/lib/ui/copy-text-to-clipboard'
import { toast } from '@/lib/ui/toast'
import { isRecord } from '@/modules/common/is-record'
import type { JsonValue } from '@/modules/capability-contract/public'

export type ShareProblem = Readonly<Pick<ProblemDetails, 'code' | 'retryable'>>

export type ShareOperationFailure =
  | { kind: 'problem'; problem: ShareProblem }
  | { kind: 'transport_error'; error: AnswerTurnTransportError }

export type IssueShareResult =
  | { kind: 'issued'; sharePath: string }
  | ShareOperationFailure

export type RevokeShareResult =
  | { kind: 'revoked' }
  | { kind: 'already_revoked' }
  | ShareOperationFailure

export type CopyShareResult =
  | { kind: 'copied'; sharePath: string }
  | { kind: 'clipboard_error' }
  | ShareOperationFailure

export async function issueAnswerThreadShare(threadId: string): Promise<IssueShareResult> {
  try {
    const response = await fetch(`/api/answer/threads/${encodeURIComponent(threadId)}/share`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
    const body = await parseJson(response)
    if (!response.ok) {
      return problemOrTransport(body, 'The share link could not be issued.')
    }
    if (!isRecord(body) || typeof body.sharePath !== 'string' || !/^\/s\/[0-9a-f]{64}$/.test(body.sharePath)) {
      return transportError('The share link response was malformed.')
    }
    return { kind: 'issued', sharePath: body.sharePath }
  } catch {
    return networkError('The share link could not be issued.')
  }
}

export async function revokeAnswerThreadShare(threadId: string): Promise<RevokeShareResult> {
  try {
    const response = await fetch(`/api/answer/threads/${encodeURIComponent(threadId)}/share`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
    const body = await parseJson(response)
    if (response.ok) {
      if (!isRecord(body) || typeof body.revoked !== 'boolean') {
        return transportError('The revoke response was malformed.')
      }
      return body.revoked ? { kind: 'revoked' } : { kind: 'already_revoked' }
    }
    const problem = parseShareProblem(body)
    if (problem?.code === 'share_already_revoked' || problem?.code === 'share_not_found') {
      return { kind: 'already_revoked' }
    }
    return problem === undefined
      ? transportError('The revoke response was malformed.')
      : { kind: 'problem', problem }
  } catch {
    return networkError('The share link could not be revoked.')
  }
}

export async function copyAnswerThreadShareLink(threadId: string): Promise<CopyShareResult> {
  const issued = await issueAnswerThreadShare(threadId)
  if (issued.kind !== 'issued') {
    announceShareFailure(issued, 'copy')
    return issued
  }

  try {
    await copyTextToClipboard(`${window.location.origin}${issued.sharePath}`)
    toast.success('Share link copied.')
    return { kind: 'copied', sharePath: issued.sharePath }
  } catch {
    toast.error('Could not copy the share link.', { description: 'Use your browser share controls or try again.' })
    return { kind: 'clipboard_error' }
  }
}

export function announceShareFailure(
  failure: ShareOperationFailure,
  action: 'copy' | 'revoke',
): void {
  if (failure.kind === 'transport_error') {
    toast.error(action === 'copy' ? 'Could not prepare the share link.' : 'Could not revoke the share link.', {
      description: failure.error.detail,
    })
    return
  }
  toast.error(action === 'copy' ? 'Could not prepare the share link.' : 'Could not revoke the share link.', {
    description: shareProblemCopy(failure.problem),
  })
}

function shareProblemCopy(problem: ShareProblem): string {
  switch (problem.code) {
    case 'missing_share_secret':
      return 'Sharing is not configured on this deployment.'
    case 'thread_forbidden':
    case 'thread_not_found':
      return 'This thread is not available in this browser.'
    case 'share_already_revoked':
      return 'The share link is already revoked. Copying will issue a new one.'
    default:
      return problem.retryable === true ? 'Try again in a moment.' : 'The share link request was not accepted.'
  }
}

async function parseJson(response: Response): Promise<JsonValue | undefined> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function parseShareProblem(value: unknown): ShareProblem | undefined {
  if (!isRecord(value) || typeof value.code !== 'string' || value.code.trim().length === 0) {
    return undefined
  }
  return {
    code: value.code.trim(),
    ...(typeof value.retryable === 'boolean' ? { retryable: value.retryable } : {}),
  }
}

function problemOrTransport(value: unknown, detail: string): ShareOperationFailure {
  const problem = parseShareProblem(value)
  return problem === undefined ? transportError(detail) : { kind: 'problem', problem }
}

function transportError(detail: string): ShareOperationFailure {
  return {
    kind: 'transport_error',
    error: { kind: 'protocol', code: 'malformed_problem', detail },
  }
}

function networkError(detail: string): ShareOperationFailure {
  return {
    kind: 'transport_error',
    error: { kind: 'network', code: 'network_error', detail },
  }
}
