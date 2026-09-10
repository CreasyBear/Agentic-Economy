import { useReverification } from '@clerk/tanstack-react-start'
import { reverificationError } from '@clerk/shared/authorization-errors'
import { auth } from '@clerk/tanstack-react-start/server'
import { verifyWebhook } from '@clerk/tanstack-react-start/webhooks'
import { describe, expect, it } from 'vitest'

describe('maintained Clerk security exports', () => {
  it('provides the Package 3 client, server, error, and webhook primitives', () => {
    expect(typeof useReverification).toBe('function')
    expect(typeof auth).toBe('function')
    expect(typeof reverificationError).toBe('function')
    expect(typeof verifyWebhook).toBe('function')
  })

  it('types the signed one-command reverification claim', () => {
    const claims: CustomJwtSessionClaims = { reverification_id: 'rev_123' }

    expect(claims.reverification_id).toBe('rev_123')
  })
})
