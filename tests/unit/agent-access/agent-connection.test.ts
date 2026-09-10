import { describe, expect, it } from 'vitest'

import { presentConnectionProblem } from '@/modules/agent-access/public'

describe('connection problem presentation', () => {
  it.each([
    ['expired_token', 'No connection or authority changed.', 'start the connection again'],
    ['access_denied', 'No connection or authority changed.', 'continue without this connection'],
    ['invalid_grant', 'cannot be used or refreshed.', 'Reconnect from your agent client'],
    ['authentication_required', 'No connection or authority changed.', 'Sign in as the Account owner'],
    ['connection_revision_conflict', 'did not apply this stale change.', 'Refresh the connection record'],
    ['source_unavailable', 'could not confirm whether the requested state changed.', 'Refresh the connection record'],
    ['provider_cleanup', 'can no longer authorize protected AE actions.', 'Retry cleanup'],
    ['outcome_unknown', 'Do not assume the connection or authority changed.', 'check its status'],
    ['reconnect_required', 'expired or revoked', 'reconnect action'],
  ])('gives %s one outcome and one safe next action', (code, outcome, nextAction) => {
    const result = presentConnectionProblem({ code, instance: 'correlation:test' })
    expect(result.outcome).toContain(outcome)
    expect(result.nextAction).toContain(nextAction)
    expect(result.technicalReference).toBe('correlation:test')
  })
})
