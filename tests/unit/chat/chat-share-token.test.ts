import { describe, expect, it } from 'vitest'

import {
  CHAT_THREAD_SHARE_TOKEN_PATTERN,
  chatThreadShareAccessId,
  chatThreadShareVerifier,
  mintChatThreadShareToken,
  resolveChatThreadShareKeyring,
  verifyChatThreadShare,
} from '@/modules/chat/share-token'

const keyring = {
  keyId: 'chat-share:test',
  secret: 'chat-share-test-secret-with-at-least-32-characters',
}

describe('chat thread share tokens', () => {
  it('mints a deterministic opaque token and verifies only the exact grant', () => {
    const grantBase = { threadId: 'thread-one', generation: 1, keyId: keyring.keyId }
    const token = mintChatThreadShareToken(grantBase, keyring)
    const grant = {
      ...grantBase,
      accessId: chatThreadShareAccessId(token),
      verifier: chatThreadShareVerifier(token, keyring.secret),
      status: 'active' as const,
      createdAt: 1,
    }

    expect(token).toMatch(CHAT_THREAD_SHARE_TOKEN_PATTERN)
    expect(verifyChatThreadShare({ grant, shareToken: token, keyring })).toBe(true)
    expect(verifyChatThreadShare({ grant, shareToken: 'a'.repeat(64), keyring })).toBe(false)
    expect(verifyChatThreadShare({
      grant: { ...grant, status: 'revoked', revokedAt: 2 },
      shareToken: token,
      keyring,
    })).toBe(false)
  })

  it('requires a 32-character configured secret', () => {
    expect(() => resolveChatThreadShareKeyring({
      AE_CHAT_SHARE_SECRET: 'short',
    })).toThrow('AE_CHAT_SHARE_SECRET must contain at least 32 characters.')
    expect(resolveChatThreadShareKeyring({
      AE_CHAT_SHARE_SECRET: keyring.secret,
      AE_CHAT_SHARE_KEY_ID: keyring.keyId,
    })).toEqual(keyring)
  })
})
