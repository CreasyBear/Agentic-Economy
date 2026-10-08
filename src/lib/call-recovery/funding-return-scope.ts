import { z } from 'zod'
import { activityReturnScopeSchema, buyerReturnDestination, type ActivityReturnScope } from './activity-return-scope'

const SESSION_ID = /^cs_[A-Za-z0-9_]{1,190}$/u
const PREFIX = 'ae.funding.return.v1.'
const MAX_AGE_MS = 24 * 60 * 60 * 1_000
const storedScope = z.strictObject({ savedAt: z.number().int().nonnegative(), scope: activityReturnScopeSchema })
/** Only a navigation hint bound to the exact checkout session. Never persists a pending Call/input/action. */
export function saveFundingReturnScope(sessionId: string, scope: ActivityReturnScope | undefined, storage?: Pick<Storage, 'setItem'>): void {
  if (!SESSION_ID.test(sessionId) || buyerReturnDestination(scope) === undefined) return
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.sessionStorage)
    target?.setItem(`${PREFIX}${sessionId}`, JSON.stringify({ savedAt: Date.now(), scope: activityReturnScopeSchema.parse(scope ?? {}) }))
  } catch { /* Navigation remains optional when browser storage is unavailable. */ }
}
export function readFundingReturnScope(sessionId: string, storage?: Pick<Storage, 'getItem' | 'removeItem'>): ActivityReturnScope | undefined {
  if (!SESSION_ID.test(sessionId)) return undefined
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.sessionStorage)
    const value = target?.getItem(`${PREFIX}${sessionId}`)
    if (value == null) return undefined
    const result = storedScope.safeParse(JSON.parse(value))
    if (!result.success || result.data.savedAt > Date.now() || Date.now() - result.data.savedAt > MAX_AGE_MS) {
      target?.removeItem(`${PREFIX}${sessionId}`); return undefined
    }
    return result.data.scope
  } catch { return undefined }
}
