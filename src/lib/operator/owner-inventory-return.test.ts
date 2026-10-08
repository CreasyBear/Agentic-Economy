import { describe, expect, it } from 'vitest'
import { appendOwnerInventoryReturnContext, inventoryQueryFromReturnSearch, ownerInventoryReturnHref, ownerInventoryReturnSchema, ownerInventoryReturnSearch, ownerToolSetupHref } from './owner-inventory-return'
import { ownerInventoryHref } from './owner-inventory-search'
import { newOperationSearchSchema, ownerNewOperationSearch } from '@/modules/capability-supply/supplier-onboarding.contracts'
import { parseOwnerToolsX402ConnectionSearch } from './supply-compatibility'
const query = { q: 'weather & forecast', sort: 'relevance' as const, cursor: 'opaque:+/=%?&#' }
describe('validated owner inventory return context', () => {
  it('round trips query/order/cursor without treating the opaque cursor as a URL', () => {
    const href = appendOwnerInventoryReturnContext('/owner/operations/offering%3Abusiness%3Atool', query)
    const url = new URL(href, 'https://aecon.test')
    expect(url.pathname).toBe('/owner/operations/offering%3Abusiness%3Atool')
    const search = Object.fromEntries(url.searchParams)
    expect(inventoryQueryFromReturnSearch(search)).toEqual(query)
    expect(ownerInventoryReturnHref(search)).toBe(ownerInventoryHref(query))
  })
  it('preserves global indexed sort on an unfiltered later page and the exact draft/connection references', () => {
    const globalQuery = { sort: 'name_desc' as const, cursor: 'opaque:name-page-two' }
    const url = new URL(ownerToolSetupHref({ draft: 'sha256:exact-candidate', connection: 'connection:exact', environment: 'sandbox' }, globalQuery), 'https://aecon.test')
    expect(url.searchParams.get('draft')).toBe('sha256:exact-candidate')
    expect(url.searchParams.get('connection')).toBe('connection:exact')
    expect(url.searchParams.get('environment')).toBe('sandbox')
    const search = newOperationSearchSchema.parse(Object.fromEntries(url.searchParams))
    expect(inventoryQueryFromReturnSearch(ownerNewOperationSearch(search))).toEqual(globalQuery)
  })
  it('rejects invalid inventory values and never accepts arbitrary return destinations', () => {
    expect(ownerInventoryReturnSchema.safeParse({ inventorySort: 'price_desc' }).success).toBe(false)
    expect(ownerInventoryReturnSchema.safeParse({ inventoryCursor: 'x'.repeat(10_001) }).success).toBe(false)
    expect(ownerInventoryReturnHref({ returnTo: 'https://evil.test', inventory: '//evil.test' })).toBe('/owner/operations')
    expect(appendOwnerInventoryReturnContext('https://evil.test/path', query)).toBe('https://evil.test/path')
    expect(appendOwnerInventoryReturnContext('/support', query)).toBe('/support')
  })
  it('carries list context through an exact x402 connection intent but still rejects unrelated query keys', () => {
    const intent = { connect: 'x402', draft: `sha256:${'a'.repeat(64)}`, resourceUrl: 'https://seller.example/paid', method: 'POST', environment: 'production', ...ownerInventoryReturnSearch(query) }
    expect(parseOwnerToolsX402ConnectionSearch(intent)).toEqual(intent)
    expect(parseOwnerToolsX402ConnectionSearch({ ...intent, returnTo: '//evil.test' })).toBeUndefined()
    expect(parseOwnerToolsX402ConnectionSearch({ ...intent, inventorySort: 'random' })).toBeUndefined()
  })
})
