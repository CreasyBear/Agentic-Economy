import { describe, expect, it } from 'vitest'
import { activityReturnHref, activityReturnScopeSchema, buyerReturnDestination, scopedCallHref } from '@/lib/call-recovery/activity-return-scope'
import { readFundingReturnScope, saveFundingReturnScope } from '@/lib/call-recovery/funding-return-scope'
describe('buyer return scope', () => {
  it('round trips only bounded navigation context through exact Call links', () => {
    const href = scopedCallHref('/calls/call_1', { returnTo: 'chat', returnThread: 'thread_1', returnRange: '7d', returnStatus: 'outcome_unknown' })
    const scope = activityReturnScopeSchema.parse(Object.fromEntries(new URL(href, 'https://example.test').searchParams))
    expect(buyerReturnDestination(scope)).toEqual({ href: '/t/thread_1', label: 'Return to conversation' })
    expect(activityReturnHref(scope)).toBe('/activity?range=7d&status=outcome_unknown')
  })
  it('drops URL, raw input, credential and invalid destination fields', () => {
    const scope = activityReturnScopeSchema.parse({ returnTo: 'https://evil.test', returnThread: '../secret', returnTool: 'raw input', redirect: 'https://evil.test', secret: 'credential', input: { private: true } })
    expect(buyerReturnDestination(scope)).toBeUndefined()
    expect(scopedCallHref('/calls/call_1', scope)).toBe('/calls/call_1')
    expect(JSON.stringify(scope)).not.toContain('credential')
  })
  it('preserves known Agent selection without carrying OAuth grants or login state', () => {
    const scope = activityReturnScopeSchema.parse({ returnTo: 'agent', returnCaller: 'prn_agent', returnTool: 'operation:v1:one', grantRef: 'grant_1', userCode: 'ABCD', state: 'secret' })
    expect(buyerReturnDestination(scope)?.href).toBe('/agent-access?caller=prn_agent&resumeTool=operation%3Av1%3Aone')
    expect(scopedCallHref('/plans/plan_1', scope)).not.toMatch(/grantRef|userCode|state=/u)
  })
  it('binds a saved funding return to the exact session and expires it', () => {
    const values = new Map<string, string>()
    const storage = { setItem: (key: string, value: string) => { values.set(key, value) }, getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => { values.delete(key) } }
    saveFundingReturnScope('cs_one', { returnTo: 'chat', returnThread: 'thread_1' }, storage)
    expect(readFundingReturnScope('cs_other', storage)).toBeUndefined()
    expect(buyerReturnDestination(readFundingReturnScope('cs_one', storage))?.href).toBe('/t/thread_1')
    values.set('ae.funding.return.v1.cs_one', JSON.stringify({ savedAt: 0, scope: { returnTo: 'chat', returnThread: 'thread_1' } }))
    expect(readFundingReturnScope('cs_one', storage)).toBeUndefined()
    expect(values.size).toBe(0)
  })
})
