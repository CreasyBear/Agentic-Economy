import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

import { constantTimeStringEqual } from '@/lib/server/constant-time'
import { stableStringify } from '@/modules/common/stable-hash'

export const ANSWER_THREAD_SHARE_SCOPE = 'answer_thread' as const
export const ANSWER_THREAD_SHARE_VERSION = 'answer-thread-share:v1' as const
export const ANSWER_THREAD_SHARE_TOKEN_PATTERN = /^[a-f0-9]{64}$/

export type AnswerThreadShareKeyring = Readonly<{
  keyId: string
  secret: string
}>

export type AnswerThreadShareGrant = Readonly<{
  threadId: string
  accessId: string
  generation: number
  verifier: string
  keyId: string
  status: 'active' | 'revoked'
  createdAt: number
  revokedAt?: number
}>

export function resolveAnswerThreadShareKeyring(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AnswerThreadShareKeyring {
  const secret = environment.AE_ANSWER_THREAD_SHARE_SECRET?.trim()
  if (secret === undefined || secret.length < 32) {
    throw new Error('AE_ANSWER_THREAD_SHARE_SECRET must contain at least 32 characters.')
  }

  const keyId = environment.AE_ANSWER_THREAD_SHARE_KEY_ID?.trim() || 'answer-thread-share-primary-v1'
  return { keyId, secret }
}

export function mintAnswerThreadShareToken(
  grant: Pick<AnswerThreadShareGrant, 'threadId' | 'generation' | 'keyId'>,
  keyring: AnswerThreadShareKeyring,
): string {
  assertAnswerThreadShareKeyring(keyring)
  if (grant.keyId !== keyring.keyId || !Number.isSafeInteger(grant.generation) || grant.generation < 1) {
    throw new Error('answer_thread_share_key_mismatch')
  }

  return hmacHex(keyring.secret, stableStringify({
    version: ANSWER_THREAD_SHARE_VERSION,
    scope: ANSWER_THREAD_SHARE_SCOPE,
    threadId: grant.threadId,
    generation: grant.generation,
  }))
}

export function answerThreadShareAccessId(token: string): string {
  return bytesToHex(sha256(token))
}

export function answerThreadShareVerifier(token: string, secret: string): `hmac-sha256:${string}` {
  return `hmac-sha256:${hmacHex(secret, `answer-thread-share-verifier:v1\n${token}`)}`
}

export function verifyAnswerThreadShare(input: Readonly<{
  grant: AnswerThreadShareGrant | undefined
  shareToken: string
  requestedThreadId: string
  keyring: AnswerThreadShareKeyring
}>): boolean {
  const grant = input.grant
  const shareToken = input.shareToken.trim()
  if (
    grant === undefined ||
    !ANSWER_THREAD_SHARE_TOKEN_PATTERN.test(shareToken) ||
    grant.status !== 'active' ||
    grant.revokedAt !== undefined ||
    grant.threadId !== input.requestedThreadId ||
    grant.keyId !== input.keyring.keyId
  ) {
    return false
  }

  if (!constantTimeStringEqual(answerThreadShareAccessId(shareToken), grant.accessId)) {
    return false
  }

  let expectedToken: string
  try {
    expectedToken = mintAnswerThreadShareToken(grant, input.keyring)
  } catch {
    return false
  }

  return (
    constantTimeStringEqual(shareToken, expectedToken) &&
    constantTimeStringEqual(grant.verifier, answerThreadShareVerifier(shareToken, input.keyring.secret))
  )
}

function hmacHex(secret: string, value: string): string {
  return bytesToHex(hmac(sha256, secret, value))
}

function assertAnswerThreadShareKeyring(keyring: AnswerThreadShareKeyring): void {
  if (keyring.secret.trim().length < 32 || keyring.keyId.trim().length === 0) {
    throw new Error('answer_thread_share_keyring_invalid')
  }
}
