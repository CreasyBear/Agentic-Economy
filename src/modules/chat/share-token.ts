import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

import { constantTimeStringEqual } from '@/lib/server/constant-time'
import { stableStringify } from '@/modules/common/stable-hash'

export const CHAT_THREAD_SHARE_SCOPE = 'chat_thread' as const
export const CHAT_THREAD_SHARE_VERSION = 'chat-thread-share:v1' as const
export const CHAT_THREAD_SHARE_TOKEN_PATTERN = /^[a-f0-9]{64}$/

export type ChatThreadShareKeyring = Readonly<{
  keyId: string
  secret: string
}>

export type ChatThreadShareGrant = Readonly<{
  threadId: string
  accessId: string
  generation: number
  verifier: string
  keyId: string
  status: 'active' | 'revoked'
  createdAt: number
  revokedAt?: number
}>

export function resolveChatThreadShareKeyring(
  environment: Readonly<Record<string, string | undefined>>,
): ChatThreadShareKeyring {
  const secret = environment.AE_CHAT_SHARE_SECRET?.trim()
  if (secret === undefined || secret.length < 32) {
    throw new Error('AE_CHAT_SHARE_SECRET must contain at least 32 characters.')
  }

  const keyId = environment.AE_CHAT_SHARE_KEY_ID?.trim() || 'chat-thread-share-primary-v1'
  return { keyId, secret }
}

export function mintChatThreadShareToken(
  grant: Pick<ChatThreadShareGrant, 'threadId' | 'generation' | 'keyId'>,
  keyring: ChatThreadShareKeyring,
): string {
  assertChatThreadShareKeyring(keyring)
  if (
    grant.keyId !== keyring.keyId
    || !Number.isSafeInteger(grant.generation)
    || grant.generation < 1
  ) {
    throw new Error('chat_thread_share_key_mismatch')
  }

  return hmacHex(keyring.secret, stableStringify({
    version: CHAT_THREAD_SHARE_VERSION,
    scope: CHAT_THREAD_SHARE_SCOPE,
    threadId: grant.threadId,
    generation: grant.generation,
  }))
}

export function chatThreadShareAccessId(token: string): string {
  return bytesToHex(sha256(token))
}

export function chatThreadShareVerifier(token: string, secret: string): `hmac-sha256:${string}` {
  return `hmac-sha256:${hmacHex(secret, `chat-thread-share-verifier:v1\n${token}`)}`
}

export function verifyChatThreadShare(input: Readonly<{
  grant: ChatThreadShareGrant | undefined
  shareToken: string
  keyring: ChatThreadShareKeyring
}>): boolean {
  const grant = input.grant
  const shareToken = input.shareToken.trim()
  if (
    grant === undefined
    || !CHAT_THREAD_SHARE_TOKEN_PATTERN.test(shareToken)
    || grant.status !== 'active'
    || grant.revokedAt !== undefined
    || grant.keyId !== input.keyring.keyId
  ) {
    return false
  }

  if (!constantTimeStringEqual(chatThreadShareAccessId(shareToken), grant.accessId)) {
    return false
  }

  let expectedToken: string
  try {
    expectedToken = mintChatThreadShareToken(grant, input.keyring)
  } catch {
    return false
  }

  return constantTimeStringEqual(shareToken, expectedToken)
    && constantTimeStringEqual(
      grant.verifier,
      chatThreadShareVerifier(shareToken, input.keyring.secret),
    )
}

function hmacHex(secret: string, value: string): string {
  return bytesToHex(hmac(sha256, secret, value))
}

function assertChatThreadShareKeyring(keyring: ChatThreadShareKeyring): void {
  if (keyring.secret.trim().length < 32 || keyring.keyId.trim().length === 0) {
    throw new Error('chat_thread_share_keyring_invalid')
  }
}
